(ns metabase-enterprise.tenants.models
  (:require
   [metabase-enterprise.tenants.db :as tenants.db]
   [metabase-enterprise.tenants.schema :as tenants.schema]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Definition ---------------------------------------------------

(methodical/defmethod t2/table-name :model/Tenant [_model] :tenant)

(t2/deftransforms :model/Tenant
  {:attributes mi/transform-json-no-keywordization})

(doto :model/Tenant
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/Tenant
  [tenant]
  (let [changes (t2/changes tenant)]
    (when (contains? changes :slug)
      (throw (ex-info (tru "You cannot change the slug of a tenant.") {:status-code 400})))
    (when (contains? changes :tenant_collection_id)
      (throw (ex-info (tru "You cannot change the collection of a tenant.") {:status-code 400})))
    tenant))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn current-user-reads-tenants?
  "Whether the current user may read Tenants, which superusers and users outside any tenant may."
  []
  (boolean (or (mi/superuser?) (nil? (:tenant_id @api/*current-user*)))))

(methodical/defmethod t2/batched-hydrate [:model/Tenant :can_read]
  "Whether the current user can read each of `tenants`, per [[current-user-reads-tenants?]]."
  [_model k tenants]
  (let [readable? (current-user-reads-tenants?)]
    (for [tenant tenants]
      (when tenant
        (vary-meta tenant assoc k readable?)))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Tenant :member_count]
  [_model k tenants]
  (mi/instances-with-hydrated-data
   tenants k
   (fn []
     (->> (tenants.db/active-member-counts (map u/the-id tenants))
          (map (juxt :tenant_id :count))
          (into {})))
   :id
   {:default 0}))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(defenterprise user->tenant-collection-and-descendant-ids
  "EE version of user->tenant-collection-and-descendant-ids. Returns a vector of the tenant collection ID and all
  descendant collection IDs for the user's tenant, or an empty vector if the user has no tenant."
  :feature :tenants
  [user-or-id]
  (into []
        (when-let [tenant-id (tenants.db/user-tenant-id (u/the-id user-or-id))]
          (when-let [tenant-collection-id (tenants.db/tenant-collection-id tenant-id)]
            (let [descendant-ids (tenants.db/descendant-collection-ids tenant-collection-id)]
              (conj descendant-ids tenant-collection-id))))))

(defenterprise maybe-localize-tenant-collection-names
  "EE implementation: localizes tenant root collection names."
  :feature :tenants
  [collections]
  (let [tenant-collection-ids (keep (fn [c]
                                      (when (= (:type c) collection/tenant-specific-root-collection-type)
                                        (:id c)))
                                    collections)
        collection-id->tenant-name-and-id
        (when (seq tenant-collection-ids)
          (tenants.db/tenant-names-and-ids-by-collection tenant-collection-ids))]
    (mapv (fn [{ttype :type id :id :as coll}]
            (cond-> coll
              (= ttype collection/tenant-specific-root-collection-type)
              (assoc :name (if-let [user-tenant-id (:tenant_id @api/*current-user*)]
                             (let [[_tenant-name tenant-id] (collection-id->tenant-name-and-id id)]
                               ;; this should never happen, but juuuuuust in case
                               (api/check-403 (= user-tenant-id tenant-id))
                               (tru "Our data"))
                             (let [[tenant-name _tenant-id] (collection-id->tenant-name-and-id id)]
                               (tru "Tenant collection: {0}" tenant-name))))))
          collections)))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-new-tenants-free
  "Throws a 400 unless the Tenant `rows` satisfy these rules:

  - no existing Tenant has the name or the slug of a row"
  [rows]
  (when (tenants.db/tenant-name-or-slug-exists? (mapv :name rows) (mapv :slug rows))
    (throw (ex-info (tru "This tenant name or slug is already taken.") {:status-code 400}))))

(defn- insert-tenants!
  "Insert the Tenant `rows`, each with a new Collection of its own, and return them in order."
  [rows]
  (let [collections (collection/create-collections!
                     (for [{tenant-name :name} rows]
                       {:type      collection/tenant-specific-root-collection-type
                        :name      (format "Tenant Collection: %s" tenant-name)
                        :namespace :tenant-specific}))]
    (tenants.db/insert-tenants! (mapv #(assoc %1 :tenant_collection_id (:id %2)) rows collections))))

(mu/defn create-tenants! :- [:sequential ::tenants.schema/tenant]
  "Insert the Tenant `rows`, each with a new Collection of its own, in one transaction and return them in order,
  publishing their create event; the name or slug of an existing Tenant is a 400."
  [rows :- [:sequential ::tenants.schema/tenant.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (let [created (into []
                          (mapcat (fn [batch]
                                    (check-new-tenants-free batch)
                                    (insert-tenants! batch)))
                          (partition-all app-db/create-partition-size rows))]
        (events/publish-event! :event/tenant-create (events/create-event created))
        created))))

(defn- check-new-names-distinct
  "Throws a 400 unless the rows of `updates` satisfy these rules:

  - no two rows set the same name, ignoring case"
  [updates]
  (let [new-names (into [] (comp (keep :name) (map u/lower-case-en)) updates)]
    (when (not= (count new-names) (count (distinct new-names)))
      (throw (ex-info (tru "This name is already taken.") {:status-code 400})))))

(defn- check-renames-free
  "Throws a 400 unless every row of `updates`, whose stored Tenants `stored` holds by id, satisfies these rules:

  - a rename does not take the name of another Tenant"
  [stored updates]
  (when-let [renames (not-empty (into []
                                      (comp (filter #(and (contains? % :name) (not= (:name %) (:name (stored (:id %))))))
                                            (map #(select-keys % [:id :name])))
                                      updates))]
    (when (tenants.db/other-tenants-named? renames)
      (throw (ex-info (tru "This name is already taken.") {:status-code 400})))))

(defn- write-tenant-updates!
  "Write `updates` over the `stored` Tenants, one statement per distinct change, and return each row with its stored
  Tenant."
  [stored updates]
  (doseq [[changes ids] (mi/group-ids-by-changes stored updates)]
    (tenants.db/update-tenants! ids changes))
  (mapv (fn [row] [(stored (:id row)) row]) updates))

(defn- update-tenant-batch!
  "Check and apply the `batch` of updates whose Tenants exist, returning what [[write-tenant-updates!]] returns."
  [batch]
  (let [stored  (u/index-by :id (tenants.db/tenants-by-ids (mapv :id batch)))
        updates (filterv (comp stored :id) batch)]
    (check-renames-free stored updates)
    (write-tenant-updates! stored updates)))

(defn- cascade-activation!
  "Deactivate the active Users of the Tenants whose row of `written`, pairs of a stored Tenant and its update row, sets
  `is_active` false over a stored true, and reactivate the Users deactivated with those that it sets true over a stored
  false, in one write."
  [written]
  (let [flipped     (fn [active]
                      (not-empty (into [] (comp (filter (fn [[stored row]]
                                                          (and (= active (:is_active row))
                                                               (not= active (:is_active stored)))))
                                                (map (comp :id first)))
                                       written)))
        activated   (flipped true)
        deactivated (flipped false)
        user-rows   (concat (for [id (some-> activated user/deactivated-with-tenant-user-ids)]
                              {:id id :is_active true :deactivated_with_tenant nil})
                            (for [id (some-> deactivated user/active-user-ids-of-tenant)]
                              {:id id :is_active false :deactivated_with_tenant true}))]
    (when (seq user-rows)
      (user/update-users! (vec user-rows)))))

(mu/defn update-tenants! :- :nil
  "Apply `updates`, each the id of a Tenant and the columns to set, in one transaction, publishing their update event;
  the name of another Tenant, or a name two rows set, is a 400, deactivating a Tenant deactivates its active Users, and
  activating it reactivates the Users deactivated with it."
  [updates :- [:sequential ::tenants.schema/tenant.update]]
  (t2/with-transaction [_conn]
    (check-new-names-distinct updates)
    (let [written (into [] (mapcat update-tenant-batch!) (partition-all app-db/update-partition-size updates))]
      (when (seq written)
        (events/publish-event! :event/tenant-update
                               (events/update-event (into {} (map (fn [[stored _]] [(:id stored) stored])) written)
                                                    (mapv second written)))
        (cascade-activation! written))))
  nil)

(defenterprise deactivate-tenants!
  "Deactivate every active Tenant and every active tenant User, marking those Users as deactivated with their Tenant,
  so that reactivating a Tenant brings them back."
  :feature :none
  []
  (t2/with-transaction [_conn]
    (let [tenants (tenants.db/active-tenants)]
      (when (seq tenants)
        (tenants.db/deactivate-tenants! (mapv :id tenants)))
      (events/publish-event! :event/tenant-update
                             (events/update-event (u/index-by :id tenants)
                                                  (mapv #(hash-map :id (:id %) :is_active false) tenants)))
      (user/update-users! (for [id (user/active-tenant-user-ids)]
                            {:id id :is_active false :deactivated_with_tenant true})))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Tenant [_model]
  {:skip? false})

(defmethod change-log/spec :model/Tenant [_model]
  {:track [:name :slug :is_active :attributes :tenant_collection_id]
   :skip  []})

(defmethod audit/spec :model/Tenant [_model]
  {:track          [:name :slug :is_active :attributes]
   :track-redacted [:tenant_collection_id]
   :skip           []
   :topics         {:create :tenant-create
                    :update :tenant-update}})
