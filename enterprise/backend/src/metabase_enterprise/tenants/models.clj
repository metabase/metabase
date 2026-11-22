(ns metabase-enterprise.tenants.models
  (:require
   [metabase-enterprise.tenants.db :as tenants.db]
   [metabase-enterprise.tenants.schema :as tenants.schema]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
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

(mu/defn create-tenants! :- [:sequential ::tenants.schema/tenant]
  "Insert the Tenant `rows`, each with a new Collection of its own, and return them in order, publishing the event of
  the write; the name or slug of an existing Tenant is a 400."
  [rows :- [:sequential ::tenants.schema/tenant.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (when (tenants.db/tenant-name-or-slug-exists? (mapv :name rows) (mapv :slug rows))
        (throw (ex-info (tru "This tenant name or slug is already taken.") {:status-code 400})))
      (let [collections (collection/create-collections!
                         (for [{tenant-name :name} rows]
                           {:type      collection/tenant-specific-root-collection-type
                            :name      (format "Tenant Collection: %s" tenant-name)
                            :namespace :tenant-specific}))]
        (u/prog1 (tenants.db/insert-tenants! (mapv #(assoc %1 :tenant_collection_id (:id %2)) rows collections))
          (events/publish-event! :event/tenant-create (events/create-event <>)))))))

(defn- update-tenant!
  "Apply `row`, an `:id` and its changes, to its Tenant as [[update-tenants!]] does, returning whether it exists."
  [{tenant-id :id :as row}]
  (let [changes       (dissoc row :id)
        stored        (tenants.db/tenant tenant-id)
        changes-name? (and (contains? changes :name) (not= (:name changes) (:name stored)))
        active        (:is_active changes)]
    (when (and changes-name? (tenants.db/other-tenant-named? (:name changes) tenant-id))
      (throw (ex-info (tru "This name is already taken.") {:status-code 400})))
    (tenants.db/update-tenant! tenant-id changes)
    (when stored
      (events/publish-event! :event/tenant-update (events/update-event {tenant-id stored} [row]))
      (when (and (some? active) (not= active (:is_active stored)))
        (if active
          (user/update-users! (user/deactivated-with-tenant-user-ids tenant-id)
                              {:is_active true :deactivated_with_tenant nil})
          (user/update-users! (user/active-user-ids-of-tenant tenant-id)
                              {:is_active false :deactivated_with_tenant true})))
      true)))

(mu/defn update-tenants! :- [:sequential ::tenants.schema/tenant.update]
  "Apply the `rows`, each an `:id` and its changes, to their Tenants and return the rows that exist, publishing the
  events of the writes; the name of another Tenant is a 400, deactivating a Tenant deactivates its active Users, and
  activating it reactivates the Users deactivated with it."
  [rows :- [:sequential ::tenants.schema/tenant.update]]
  (t2/with-transaction [_conn]
    (filterv update-tenant! rows)))

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
      (user/update-users! (user/active-tenant-user-ids)
                          {:is_active false :deactivated_with_tenant true}))))

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
