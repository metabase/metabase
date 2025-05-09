(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks."
  (:require
   [crypto.random :as crypto-random]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.logger :as logger]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/password_check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [_route-params
   _query-params
   _body :- [:map
             [:password ms/ValidPassword]]]
  ;; if we pass the su/ValidPassword test we're g2g
  {:valid true})

(api.macros/defendpoint :get "/logs"
  "Logs."
  []
  (validation/check-has-application-permission :monitoring)
  (logger/messages))

(api.macros/defendpoint :get "/random_token"
  "Return a cryptographically secure random 32-byte token, encoded as a hexadecimal string.
   Intended for use when creating a value for `embedding-secret-key`."
  []
  {:token (crypto-random/hex 32)})

(api.macros/defendpoint :get "/diagnostic_info/connection_pool_info"
  "Returns database connection pool info for the current Metabase instance."
  []
  (validation/check-has-application-permission :monitoring)
  (let [pool-info (analytics/connection-pool-info)
        headers   {"Content-Disposition" "attachment; filename=\"connection_pool_info.json\""}]
    (assoc (response/response {:connection-pools pool-info}) :headers headers, :status 200)))

(api.macros/defendpoint :get "/openapi"
  "Return the OpenAPI specification for the Metabase API."
  []
  (api/check-superuser)
  {:status 200
   :body (merge
          (open-api/root-open-api-object @(requiring-resolve 'metabase.api-routes.core/routes))
          {:servers [{:url "" :description "Metabase API"}]})})
