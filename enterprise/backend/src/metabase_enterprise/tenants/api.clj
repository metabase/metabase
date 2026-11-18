(ns metabase-enterprise.tenants.api
  (:require
   [malli.util]
   [metabase-enterprise.tenants.db :as tenants.db]
   [metabase-enterprise.tenants.models :as tenant]
   [metabase-enterprise.tenants.schema :as tenants.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.request.core :as request]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private CreateTenantArguments [:map {:closed true}
                                      [:name ::tenants.schema/tenant.name]
                                      [:attributes {:optional true} [:maybe ::tenants.schema/tenant.attributes]]
                                      [:slug ::tenants.schema/tenant.slug]])

(def ^:private Tenant [:map {:closed true}
                       [:id ms/PositiveInt]
                       [:name ::tenants.schema/tenant.name]
                       [:slug ::tenants.schema/tenant.slug]
                       [:is_active ms/BooleanValue]
                       [:member_count {:optional true} ms/Int]
                       [:attributes {:optional true} [:maybe [:map-of :string :string]]]
                       [:tenant_collection_id ms/PositiveInt]])

(defn- present-tenants
  [tenants]
  (if api/*is-superuser?*
    (->> (t2/hydrate tenants :member_count)
         (map #(select-keys % [:id :name :slug :is_active :member_count :attributes :tenant_collection_id])))
    (map #(select-keys % [:id :name :slug :is_active :tenant_collection_id]) tenants)))

(defn- present-tenant [tenant]
  (first (present-tenants [tenant])))

(defn- checked-tenant
  "The Tenant with `id`, once `check` (`api/read-check` or `api/write-check`) passes for it; the check runs first, so a
  refused caller gets a 403 whether or not the Tenant exists."
  [check id]
  (let [tenant (tenants.db/tenant id)]
    (check (or tenant (t2/instance :model/Tenant {:id id})))
    (api/check-404 tenant)))

(defn create-tenant!
  "Creates a new tenant, validating its shape, and returns it as the API presents it."
  [tenant]
  (when-not (mr/validate CreateTenantArguments tenant)
    (throw (ex-info "Invalid Tenant"
                    {:status-code 400
                     :errors (mr/explain CreateTenantArguments tenant)})))
  (present-tenant (tenants.db/insert-tenant! tenant)))

(api.macros/defendpoint :post "/" :- Tenant
  "Create a new Tenant"
  [_route-params
   _query-params
   tenant :- CreateTenantArguments]
  (api/create-check :model/Tenant tenant)
  (create-tenant! tenant))

(api.macros/defendpoint :get "/" :- [:map {:closed true} [:data [:sequential Tenant]]]
  "Get all tenants"
  [_
   {:keys [status]} :- [:map {:closed true}
                        [:status {:default "all"} [:enum "all" "deactivated" "active"]]]
   _]
  (api/check-403 (tenant/current-user-reads-tenants?))
  {:data (present-tenants
          (tenants.db/tenants-page status
                                   (when (request/paged?) (request/limit))
                                   (when (request/paged?) (request/offset))))})

(def ^:private UpdateTenantArguments
  [:map {:closed true}
   [:name {:optional true} [:maybe ::tenants.schema/tenant.name]]
   [:attributes {:optional true} [:maybe ::tenants.schema/tenant.attributes]]
   [:is_active {:optional true} [:maybe ms/BooleanValue]]])

(mu/defn update-tenant!
  "Applies `tenant` to the Tenant with `tenant-id`, archiving its Collection when it deactivates it and restoring the
  Collection when it activates it, and returns the Tenant."
  [tenant-id :- ms/PositiveInt
   {:keys [is_active] :as tenant} :- UpdateTenantArguments]
  (t2/with-transaction [_conn]
    (let [collection-id (:tenant_collection_id (tenants.db/tenant tenant-id))]
      (tenants.db/update-tenant! tenant-id tenant)
      (when (and collection-id (some? is_active))
        (collection/with-allow-modifying-tenant-root-collections
          (tenants.db/set-collection-archived! collection-id (not is_active))))
      (tenants.db/tenant tenant-id))))

(api.macros/defendpoint :put "/:id" :- Tenant
  "Update a tenant, can set name, attributes, or whether this tenant is active."
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   tenant :- UpdateTenantArguments]
  (checked-tenant api/write-check id)
  (present-tenant (update-tenant! id tenant)))

(api.macros/defendpoint :get "/:id" :- Tenant
  "Get info about a tenant"
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (present-tenant (checked-tenant api/read-check id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/tenant` routes"
  (api.macros/ns-handler *ns* +auth))
