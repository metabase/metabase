(ns metabase-enterprise.tenants.api
  (:require
   [metabase-enterprise.tenants.model :as tenant]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/"
  "Create a new Tenant"
  [_route-params
   _query-params
   tenant :- [:map {:closed true}
              [:name ms/NonBlankString]]]
  (api/check-400 (not (tenant/name-exists? (:name tenant)))
                 "This tenant name is already taken.")
  (t2/insert! :model/Tenant tenant))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/tenants` routes"
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
