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
   [metabase.permissions.core :as perms]
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

(defn- create-tenant-collections!
  "Create a new Collection for each of the Tenant `rows` and return the rows with it."
  [rows]
  (let [collections (collection/create-collections!
                     (for [{tenant-name :name} rows]
                       {:type      collection/tenant-specific-root-collection-type
                        :name      (format "Tenant Collection: %s" tenant-name)
                        :namespace :tenant-specific}))]
    (mapv #(assoc %1 :tenant_collection_id (:id %2)) rows collections)))

(mu/defn create-tenants! :- [:sequential ::tenants.schema/tenant]
  "Insert the Tenant `rows`, each with a new Collection of its own, in one transaction and return them in order,
  publishing their create event; the name or slug of an existing Tenant is a 400."
  [rows :- [:sequential ::tenants.schema/tenant.create]]
  (app-db/create-batched! :model/Tenant rows
                          {:before-create (fn [rows]
                                            (check-new-tenants-free rows)
                                            (create-tenant-collections! rows))
                           :after-create  #(events/publish-event! :event/tenant-create (events/create-event %))}))

(defn- check-tenant-updates
  "Throws a 400 unless the rows of `updates`, whose stored Tenants `id->stored` holds, satisfy these rules:

  - no two rows set the same name, ignoring case
  - a rename does not take the name of another Tenant as it stands after the renames of the batch, so a name another
    row of the batch renames away is free
  - the renames of the batch do not take each other's names in a cycle"
  [updates id->stored]
  (let [new-names (into [] (comp (keep :name) (map u/lower-case-en)) updates)
        renames   (filterv #(and (id->stored (:id %)) (contains? % :name) (not= (:name %) (:name (id->stored (:id %)))))
                           updates)]
    (when (or (not= (count new-names) (count (distinct new-names)))
              (and (seq renames)
                   (or (tenants.db/tenant-named-outside? (mapv :name renames) (mapv :id renames))
                       (nil? (perms/rename-order updates id->stored)))))
      (throw (ex-info (tru "This name is already taken.") {:status-code 400})))))

(defn- checked-existing-in-rename-order
  "The rows of `updates` whose Tenants `id->stored` holds, checked by [[check-tenant-updates]], each rename after the
  one that frees its name."
  [updates id->stored]
  (let [updates (filterv (comp id->stored :id) updates)]
    (check-tenant-updates updates id->stored)
    (perms/rename-order updates id->stored)))

(defn- flipped-tenant-ids
  "The ids of the Tenants of `updates`, whose stored Tenants `id->stored` holds, that the rows set active to `active`
  over a stored flag that is not."
  [updates id->stored active]
  (not-empty (into [] (comp (filter #(and (= active (:is_active %)) (not= active (:is_active (id->stored (:id %))))))
                            (map :id))
                   updates)))

(defn- cascade-activation!
  "Deactivate the active Users of the Tenants that `updates` deactivate, and reactivate the Users deactivated with those
  that it activates, in one write; `id->stored` holds the Tenants as stored before."
  [updates id->stored]
  (let [user-rows (concat (for [id (some-> (flipped-tenant-ids updates id->stored true) user/deactivated-with-tenant-user-ids)]
                            {:id id :is_active true :deactivated_with_tenant nil})
                          (for [id (some-> (flipped-tenant-ids updates id->stored false) user/active-user-ids-of-tenant)]
                            {:id id :is_active false :deactivated_with_tenant true}))]
    (when (seq user-rows)
      (user/update-users! (vec user-rows)))))

(mu/defn update-tenants! :- :nil
  "Apply `updates`, each the id of a Tenant and the columns to set, in one transaction, publishing their update event;
  the name of another Tenant, or a name two rows set, is a 400, deactivating a Tenant deactivates its active Users, and
  activating it reactivates the Users deactivated with it."
  [updates :- [:sequential ::tenants.schema/tenant.update]]
  (app-db/update-batched! :model/Tenant updates
                          {:before-update checked-existing-in-rename-order
                           :after-update  (fn [updates id->stored _]
                                            (events/publish-event! :event/tenant-update (events/update-event id->stored updates))
                                            (cascade-activation! updates id->stored))}))

(defenterprise deactivate-tenants!
  "Deactivate every active Tenant and every active tenant User, marking those Users as deactivated with their Tenant,
  so that reactivating a Tenant brings them back."
  :feature :none
  []
  (t2/with-transaction [_conn]
    (let [id->tenant (tenants.db/active-tenants-by-ids)]
      (run! (comp tenants.db/deactivate-tenants! vec) (partition-all app-db/update-partition-size (keys id->tenant)))
      (events/publish-event! :event/tenant-update
                             (events/update-event id->tenant (mapv #(hash-map :id % :is_active false) (keys id->tenant))))
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
