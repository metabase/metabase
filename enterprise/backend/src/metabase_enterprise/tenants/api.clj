(ns metabase-enterprise.tenants.api
  (:require
   [metabase-enterprise.tenants.model :as tenant]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/"
  "Create a new Tenant"
  [_route-params
   _query-params
   tenant :- [:map {:closed true}
              [:name ms/NonBlankString]
              [:slug ms/NonBlankString]]]
  (api/check-400 (not (tenant/tenant-exists? tenant))
                 "This tenant name or slug is already taken.")
  (t2/insert! :model/Tenant tenant))

(api.macros/defendpoint :get "/"
  "Get all tenants"
  [_ _ _]
  (t2/hydrate (t2/select :model/Tenant (cond-> {}
                                         true (assoc :order-by [[:id :asc]])
                                         (request/paged?) (assoc :limit (request/limit) :offset (request/offset))))
              :member_count))

(api.macros/defendpoint :put ["/:id" :id #"[^/]+"]
  "Update a tenant (right now, only name)"
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   tenant :- [:map {:closed true} [:name ms/NonBlankString]]]
  (t2/update! :model/Tenant {:id id} tenant))

(api.macros/defendpoint :get "/:id"
  [{id :id} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (t2/hydrate (t2/select-one :model/Tenant :id id) :member_count))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/tenants` routes"
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
