(ns metabase-enterprise.tenants.api
  (:require
   [metabase-enterprise.tenants.model :as tenant]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private Slug (mu/with-api-error-message tenant/Slug
                                               (deferred-tru "invalid slug")))

(api.macros/defendpoint :post "/"
  "Create a new Tenant"
  [_route-params
   _query-params
   tenant :- [:map {:closed true}
              [:name ms/NonBlankString]
              [:slug Slug]]]
  (api/check-400 (not (tenant/tenant-exists? tenant))
                 "This tenant name or slug is already taken.")
  (t2/insert! :model/Tenant tenant))

(defn- present-tenants [tenants]
  (t2/hydrate tenants :member_count))

(defn- present-tenant [tenant]
  (first (present-tenants [tenant])))

(api.macros/defendpoint :get "/"
  "Get all tenants"
  [_ _ _]
  {:data (present-tenants
          (t2/select :model/Tenant (cond-> {:order-by [[:id :asc]]}
                                     (request/paged?) (assoc :limit (request/limit) :offset (request/offset)))))})

(api.macros/defendpoint :put ["/:id" :id #"[^/]+"]
  "Update a tenant (right now, only name)"
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   tenant :- [:map {:closed true} [:name ms/NonBlankString]]]
  (api/check-400 (not (t2/exists? :model/Tenant :name (:name tenant)))
                 "This name is already taken.")
  (t2/update! :model/Tenant {:id id} tenant)
  (present-tenant (t2/select-one :model/Tenant :id id)))

(api.macros/defendpoint :get "/:id"
  "Get info about a tenant"
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (present-tenant (t2/select-one :model/Tenant :id id)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/tenants` routes"
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
