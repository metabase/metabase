(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks."
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [compojure.core :refer [GET POST]]
   [crypto.random :as crypto-random]
   [environ.core :refer [env]]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.stats :as stats]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.config :as config]
   [metabase.logger :as logger]
   [metabase.troubleshooting :as troubleshooting]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]))

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

(defn- product-feedback-url
  "Product feedback url. When not prod, reads `MB_PRODUCT_FEEDBACK_URL` from the environment to prevent development
  feedback from hitting the endpoint."
  []
  (if config/is-prod?
    "https://prod-feedback.metabase.com/api/v1/crm/product-feedback"
    (env :mb-product-feedback-url)))

(mu/defn send-feedback!
  "Sends the feedback to the api endpoint"
  [comments :- [:maybe ms/NonBlankString]
   source :- ms/NonBlankString
   email :- [:maybe ms/NonBlankString]]
  (try (http/post (product-feedback-url)
                  {:content-type :json
                   :body         (json/generate-string {:comments comments
                                                        :source   source
                                                        :email    email})})
       (catch Exception e
         (log/warn e)
         (throw e))))

(api/defendpoint POST "/product-feedback"
  "Endpoint to provide feedback from the product"
  [:as {{:keys [comments source email]} :body}]
  {comments [:maybe ms/NonBlankString]
   source ms/NonBlankString
   email [:maybe ms/NonBlankString]}
  (future (send-feedback! comments source email))
  api/generic-204-no-content)

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

(api/define-routes)
