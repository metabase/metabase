(ns metabase-enterprise.tenants.models
  (:require
   [metabase-enterprise.tenants.db :as tenants.db]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Model setup ---------------------------------------------------

(methodical/defmethod t2/table-name :model/Tenant [_model] :tenant)

(t2/deftransforms :model/Tenant
  {:attributes mi/transform-json-no-keywordization})

(doto :model/Tenant
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/events)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

(defmethod events/spec :model/Tenant
  [_model]
  {:create :event/tenant-create
   :update :event/tenant-update
   :delete :event/tenant-delete})

(defmethod audit/spec :model/Tenant [_model]
  {:track          [:name :slug :is_active :attributes]
   :track-redacted [:tenant_collection_id]
   :skip           []
   :topics         {:create :tenant-create
                    :update :tenant-update}})

(defmethod change-log/spec :model/Tenant [_model]
  {:track [:name :slug :is_active :attributes :tenant_collection_id]
   :skip  []})

(defmethod app-db-copy/spec :model/Tenant [_model]
  {:skip? false})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-new-name-and-slug
  "Throws a 400 when `tenant`, a row an INSERT writes, has the name or slug of an existing Tenant."
  [{tenant-name :name :keys [slug]}]
  (when (tenants.db/tenant-name-or-slug-exists? tenant-name slug)
    (throw (ex-info (tru "This tenant name or slug is already taken.") {:status-code 400}))))

(t2/define-before-insert :model/Tenant
  [tenant]
  (check-new-name-and-slug tenant)
  (let [tenant-collection-id (tenants.db/insert-collection! {:type      collection/tenant-specific-root-collection-type
                                                             :name      (format "Tenant Collection: %s" (:name tenant))
                                                             :namespace :tenant-specific})]
    (assoc tenant :tenant_collection_id tenant-collection-id)))

(t2/define-before-update :model/Tenant
  [{:keys [id] :as tenant}]
  (let [changes (t2/changes tenant)]
    (when (contains? changes :slug)
      (throw (ex-info (tru "You cannot change the slug of a tenant.") {:status-code 400})))
    (when (contains? changes :tenant_collection_id)
      (throw (ex-info (tru "You cannot change the collection of a tenant.") {:status-code 400})))
    (when (and (contains? changes :name) (tenants.db/other-tenant-named? (:name changes) id))
      (throw (ex-info (tru "This name is already taken.") {:status-code 400})))
    (when (false? (:is_active changes))
      (tenants.db/deactivate-tenant-users! id))
    (when (true? (:is_active changes))
      (tenants.db/reactivate-tenant-users! id))
    tenant))

(mi/define-update-in-transaction :model/Tenant)

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
