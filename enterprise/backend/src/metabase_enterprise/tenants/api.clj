(ns metabase-enterprise.tenants.api
  (:require
   [malli.util]
   [metabase-enterprise.tenants.db :as tenants.db]
   [metabase-enterprise.tenants.models :as tenant]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private Slug (mu/with-api-error-message tenant/Slug
                                               (deferred-tru "invalid slug")))

(def ^:private CreateTenantArguments [:map {:closed true}
                                      [:name ms/NonBlankString]
                                      [:attributes {:optional true} [:maybe tenant/Attributes]]
                                      [:slug Slug]])

(def ^:private Tenant [:map {:closed true}
                       [:id ms/PositiveInt]
                       [:name ms/NonBlankString]
                       [:slug Slug]
                       [:is_active ms/BooleanValue]
                       [:member_count ms/Int]
                       [:attributes [:maybe [:map-of :string :string]]]
                       [:tenant_collection_id ms/PositiveInt]])

(defn- present-tenants [tenants]
  (->> (tenants.db/hydrate-member-count tenants)
       (map #(select-keys % [:id :name :slug :is_active :member_count :attributes :tenant_collection_id]))))

(defn- present-tenant [tenant]
  (first (present-tenants [tenant])))

(defn create-tenant!
  "Creates a new tenant, validating it, verifying that it does not already exist and publishing audit events as
  necessary."
  [tenant]
  (when-not (mr/validate CreateTenantArguments tenant)
    (throw (ex-info "Invalid Tenant"
                    {:status-code 400
                     :errors (mr/explain CreateTenantArguments tenant)})))
  (api/check-403 api/*is-superuser?*)
  (api/check-400 (not (tenant/tenant-exists? tenant))
                 "This tenant name or slug is already taken.")
  (let [new-tenant (tenants.db/insert-tenant! tenant)]
    (events/publish-event! :event/tenant-create {:object new-tenant})
    (present-tenant new-tenant)))

(api.macros/defendpoint :post "/" :- Tenant
  "Create a new Tenant"
  [_route-params
   _query-params
   tenant :- CreateTenantArguments]
  (create-tenant! tenant))

(api.macros/defendpoint :get "/" :- [:map {:closed true} [:data [:sequential Tenant]]]
  "Get all tenants"
  [_
   {:keys [status]} :- [:map
                        [:status {:default "all"} [:enum "all" "deactivated" "active"]]]
   _]
  (api/check-403 (or api/*is-superuser?* (not (:tenant_id @api/*current-user*))))
  {:data (present-tenants
          (tenants.db/tenants-page status
                                   (when (request/paged?) (request/limit))
                                   (when (request/paged?) (request/offset))))})

(def ^:private UpdateTenantArguments
  [:map {:closed true}
   [:name {:optional true} [:maybe ms/NonBlankString]]
   [:attributes {:optional true} [:maybe tenant/Attributes]]
   [:is_active {:optional true} [:maybe ms/BooleanValue]]])

(mu/defn update-tenant!
  "Updates a tenant, publishing any necessary events after doing so"
  [tenant-id :- ms/PositiveInt
   {:keys [is_active] :as tenant} :- UpdateTenantArguments]
  (t2/with-transaction [_cn]
    (collection/with-allow-modifying-tenant-root-collections
      (let [tenant-before-update (tenants.db/tenant tenant-id)
            _                    (tenants.db/update-tenant! tenant-id tenant)
            tenant-after-update  (tenants.db/tenant tenant-id)]
        (when (false? is_active)
          (tenants.db/deactivate-tenant-users! tenant-id)
          (some-> (tenants.db/collection-with-archived-state (:tenant_collection_id tenant-before-update) false)
                  collection/archive-collection!))
        (when (true? is_active)
          (tenants.db/reactivate-tenant-users! tenant-id)
          (some-> (tenants.db/collection-with-archived-state (:tenant_collection_id tenant-before-update) true)
                  (collection/unarchive-collection! {})))
        (events/publish-event! :event/tenant-update {:object          tenant-after-update
                                                     :previous-object tenant-before-update})
        tenant-after-update))))

(api.macros/defendpoint :put "/:id" :- Tenant
  "Update a tenant, can set name, attributes, or whether this tenant is active."
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   tenant :- UpdateTenantArguments]
  (api/check-403 api/*is-superuser?*)
  (when (:name tenant)
    (api/check-400 (not (tenants.db/other-tenant-named? (:name tenant) id))
                   "This name is already taken."))
  (present-tenant (update-tenant! id tenant)))

(api.macros/defendpoint :get "/:id" :- Tenant
  "Get info about a tenant"
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/check-403 (or api/*is-superuser?* (not (:tenant_id @api/*current-user*))))
  (present-tenant (tenants.db/tenant id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/tenant` routes"
  (api.macros/ns-handler *ns* +auth))
