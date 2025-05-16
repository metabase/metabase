(ns metabase.tenant.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [metabase.tenant.models.tenant]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/"
  "list em"
  [_route-params
   _query-params
   _body]
  (t2/select :model/Tenant))

(api.macros/defendpoint :post "/"
  "Create a new tenant"
  [_route-params
   _query-params
   body]
  (t2/insert-returning-instance! :model/Tenant body))

(api.macros/defendpoint :put "/:id"
  "Create a new tenant"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body ]
  (api/check-404 (t2/select-one :model/Tenant :id id))
  (t2/update! :model/Tenant id body))
