(ns metabase-enterprise.tenants.api
  (:require
   [malli.util]
   [metabase-enterprise.tenants.model :as tenant]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections-rest.api :as api.collection]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.util :as u]
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
  (u/prog1 (t2/insert-returning-instance! :model/Tenant (dissoc tenant ::is-verified?))
    (events/publish-event! :event/tenant-create {:object <>})))

(api.macros/defendpoint :post "/"
  "Create a new Tenant"
  [_route-params
   _query-params
   tenant :- CreateTenantArguments]
  (create-tenant! tenant))

(defn- present-tenants [tenants]
  (->> (t2/hydrate tenants :member_count)
       (map #(select-keys % [:id :name :slug :is_active :member_count :attributes]))))

(defn- present-tenant [tenant]
  (first (present-tenants [tenant])))

(api.macros/defendpoint :get "/"
  "Get all tenants"
  [_
   {:keys [status]} :- [:map
                        [:status {:default "all"} [:enum "all" "deactivated" "active"]]]
   _]
  (api/check-403 api/*is-superuser?*)
  {:data (present-tenants
          (t2/select :model/Tenant (cond-> {:order-by [[:id :asc]]}
                                     (request/paged?) (assoc :limit (request/limit) :offset (request/offset))
                                     true (assoc :where (case status
                                                          "all" [:inline [:= 1 1]]
                                                          "active" [:= :is_active true]
                                                          "deactivated" [:= :is_active false])))))})

(def ^:private UpdateTenantArguments
  [:map {:closed true}
   [:name {:optional true} [:maybe ms/NonBlankString]]
   [:attributes {:optional true} [:maybe tenant/Attributes]]
   [:is_active {:optional true} [:maybe ms/BooleanValue]]])

(mu/defn- update-tenant! [tenant-id :- ms/PositiveInt
                          {:keys [is_active] :as tenant} :- UpdateTenantArguments]
  (when (false? is_active)
    (t2/update! :model/User {:is_active true :tenant_id tenant-id}
                {:is_active false :deactivated_with_tenant true}))
  (when (true? is_active)
    (t2/update! :model/User {:is_active false :tenant_id tenant-id :deactivated_with_tenant true}
                {:is_active true :deactivated_with_tenant nil}))
  (let [tenant-before-update (t2/select-one :model/Tenant tenant-id)
        _                    (t2/update! :model/Tenant {:id tenant-id} tenant)
        tenant-after-update  (t2/select-one :model/Tenant tenant-id)]
    (events/publish-event! :event/tenant-update {:object          tenant-after-update
                                                 :previous-object tenant-before-update})
    tenant-after-update))

(api.macros/defendpoint :put ["/:id" :id #"[^/]+"]
  "Update a tenant, can set name, attributes, or whether this tenant is active."
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   tenant :- UpdateTenantArguments]
  (api/check-403 api/*is-superuser?*)
  (when (:name tenant)
    (api/check-400 (not (t2/exists? :model/Tenant :name (:name tenant) :id [:not= id]))
                   "This name is already taken."))
  (update-tenant! id tenant)
  (present-tenant (update-tenant! id tenant)))

(api.macros/defendpoint :get "/:id"
  "Get info about a tenant"
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/check-403 api/*is-superuser?*)
  (present-tenant (t2/select-one :model/Tenant :id id)))

(api.macros/defendpoint :get "/collection/root/items"
  "Get collections, analogous to `/api/collection/root/items` but for tenant collections"
  [_route-params
   {:keys [archived sort_column sort_direction official_collections_first]}
   :- [:map
       [:archived {:default false} [:maybe ms/BooleanValue]]
       [:sort_column {:default :name} [:enum :name :last_edited_at :last_edited_by :model]]
       [:sort_direction {:default :asc} [:enum :asc :desc]]
       [:official_collections_first {:default true} [:maybe ms/BooleanValue]]]]
  (api.collection/collection-children
   collection/root-collection
   {:archived? (boolean archived)
    :models #{:collection}
    :pinned-state :all
    :show-dashboard-questions? false
    :include-tenant-collections? true
    :sort-info {:sort-column sort_column
                :sort-direction sort_direction
                :official-collections-first? official_collections_first}}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/tenant` routes"
  (api.macros/ns-handler *ns* +auth))
