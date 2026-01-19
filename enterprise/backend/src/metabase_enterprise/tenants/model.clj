(ns metabase-enterprise.tenants.model
  (:require
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit-app]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Tenant [_model] :tenant)

(defmethod audit-app/model-details :model/Tenant
  [entity _event-type]
  (select-keys entity [:name :slug :is_active]))

(t2/deftransforms :model/Tenant
  {:attributes mi/transform-json-no-keywordization})

(def Slug
  "The malli schema for a tenant's slug"
  [:re #"^[-_a-z0-9]{1,255}$"])

(t2/define-before-insert :model/Tenant
  [tenant]
  (let [tenant-collection-id (t2/insert-returning-pk! :model/Collection {:type "tenant-specific-root-collection"
                                                                         :name (format "Tenant Collection: %s" (:name tenant))
                                                                         :namespace "tenant-specific"})]
    (u/prog1 (assoc tenant :tenant_collection_id tenant-collection-id)
      ;; The API layer is responsible for doing validation with nice error messages, here we just throw as a final layer
      ;; of defense.
      (mu/validate-throw Slug (:slug tenant)))))

(defn tenant-exists?
  "Given a tenant name, returns truthy if the name (or its slugified version) is already reserved."
  [{n :name slug :slug}]
  (t2/exists? :model/Tenant {:where [:or
                                     [:= :slug slug]
                                     [:= :name n]]}))

(doto :model/Tenant
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/batched-hydrate [:model/Tenant :member_count]
  [_model k tenants]
  (mi/instances-with-hydrated-data
   tenants k
   (fn []
     (->> (t2/query {:select [[:tenant_id] [[:count :*] :count]]
                     :from [(t2/table-name :model/User)]
                     :where [:and
                             [:in :tenant_id (map u/the-id tenants)]
                             [:= :type "personal"]
                             :is_active]
                     :group-by [:tenant_id]})
          (map (juxt :tenant_id :count))
          (into {})))
   :id
   {:default 0}))

(def Attributes
  "Attributes attached to a tenant that will be passed down to users in the tenant."
  [:map-of
   [:and
    (mu/with-api-error-message
     ms/KeywordOrString
     (deferred-tru "attribute keys must be a keyword or string"))
    (mu/with-api-error-message
     [:fn (fn [k] (re-matches #"^(?!@).*" (name k)))]
     (deferred-tru "attribute keys must not start with `@`"))]
   :any])

(defenterprise user->tenant-collection-and-descendant-ids
  "EE version of user->tenant-collection-and-descendant-ids. Returns a vector of the tenant collection ID and all
  descendant collection IDs for the user's tenant, or an empty vector if the user has no tenant."
  :feature :tenants
  [user-or-id]
  (into []
        (when-let [tenant-id (t2/select-one-fn :tenant_id :model/User :id (u/the-id user-or-id))]
          (when-let [tenant-collection-id (t2/select-one-fn :tenant_collection_id :model/Tenant :id tenant-id)]
            (let [descendant-ids (t2/select-pks-set :model/Collection
                                                    :location
                                                    [:like (str "/" tenant-collection-id "/%")])]
              (conj descendant-ids tenant-collection-id))))))

(defenterprise maybe-localize-tenant-collection-names
  "EE implementation: localizes tenant root collection names."
  :feature :tenants
  [collections]
  (let [tenant-collection-ids (keep (fn [c]
                                      (when (= (:type c) "tenant-specific-root-collection")
                                        (:id c)))
                                    collections)
        collection-id->tenant-name-and-id
        (when (seq tenant-collection-ids)
          (t2/select-fn->fn :tenant_collection_id (juxt :name :id)
                            :model/Tenant
                            :tenant_collection_id [:in tenant-collection-ids]))]
    (mapv (fn [{ttype :type id :id :as coll}]
            (cond-> coll
              (= ttype "tenant-specific-root-collection")
              (assoc :name (if-let [user-tenant-id (:tenant_id @api/*current-user*)]
                             (let [[_tenant-name tenant-id] (collection-id->tenant-name-and-id id)]
                               ;; this should never happen, but juuuuuust in case
                               (api/check-403 (= user-tenant-id tenant-id))
                               (tru "Our data"))
                             (let [[tenant-name _tenant-id] (collection-id->tenant-name-and-id id)]
                               (tru "Tenant collection: {0}" tenant-name))))))
          collections)))
