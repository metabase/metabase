(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks."
  (:require
   [compojure.core :refer [GET POST]]
   [crypto.random :as crypto-random]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.stats :as stats]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.logger :as logger]
   [metabase.troubleshooting :as troubleshooting]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [ring.middleware.content-type :as content-type]
   [metabase.api.defendpoint2 :as defendpoint2]
   [metabase.config :as config]))

(api/defendpoint POST "/password_check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [:as {{:keys [password]} :body}]
  {password ms/ValidPassword} ;; if we pass the su/ValidPassword test we're g2g
  {:valid true})

(api/defendpoint GET "/logs"
  "Logs."
  []
  (validation/check-has-application-permission :monitoring)
  (logger/messages))

(api/defendpoint GET "/stats"
  "Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see
  what is being phoned home."
  []
  (validation/check-has-application-permission :monitoring)
  (stats/anonymous-usage-stats))

(api/defendpoint GET "/random_token"
  "Return a cryptographically secure random 32-byte token, encoded as a hexadecimal string.
   Intended for use when creating a value for `embedding-secret-key`."
  []
  {:token (crypto-random/hex 32)})

(api/defendpoint GET "/bug_report_details"
  "Returns version and system information relevant to filing a bug report against Metabase."
  []
  (validation/check-has-application-permission :monitoring)
  {:system-info   (troubleshooting/system-info)
   :metabase-info (troubleshooting/metabase-info)})

(api/defendpoint GET "/diagnostic_info/connection_pool_info"
  "Returns database connection pool info for the current Metabase instance."
  []
  (validation/check-has-application-permission :monitoring)
  (let [pool-info (prometheus/connection-pool-info)
        headers   {"Content-Disposition" "attachment; filename=\"connection_pool_info.json\""}]
    (assoc (response/response {:connection-pools pool-info}) :headers headers, :status 200)))

(api/defendpoint GET "/openapi.json"
  "Returns OpenAPI spec"
  []
  (defendpoint2/openapi-json 'metabase.api.routes/routes
    {:title   "Metabase API"
     :version (:tag config/mb-version-info)}))

(api/defendpoint GET "/docs*"
  "Shows Swagger UI"
  [:as {:keys [params uri]}]
  (let [path    (:* params)
        respond (fn [path]
                  (-> (response/resource-response (str "swagger-ui" path))
                      (content-type/content-type-response {:uri path})))]
    (case path
      ""             {:status  302
                      :headers {"Location" (str uri "/")}
                      :body    ""}
      "/config.json" {:url "/api/util/openapi.json"}
      "/"            (respond "/index.html")
      (respond path))))

(api/define-routes)
