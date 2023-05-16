(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks."
  (:require
   [compojure.core :refer [GET POST]]
   [crypto.random :as crypto-random]
   [metabase.analytics.stats :as stats]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.logger :as logger]
   [metabase.troubleshooting :as troubleshooting]
   [metabase.util.schema :as su]
   [ring.util.response :as response]))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/password_check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [:as {{:keys [password]} :body}]
  {password su/ValidPassword} ;; if we pass the su/ValidPassword test we're g2g
  {:valid true})

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/logs"
  "Logs."
  []
  (validation/check-has-application-permission :monitoring)
  (logger/messages))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/stats"
  "Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see
  what is being phoned home."
  []
  (validation/check-has-application-permission :monitoring)
  (stats/anonymous-usage-stats))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/random_token"
  "Return a cryptographically secure random 32-byte token, encoded as a hexadecimal string.
   Intended for use when creating a value for `embedding-secret-key`."
  []
  {:token (crypto-random/hex 32)})

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/bug_report_details"
  "Returns version and system information relevant to filing a bug report against Metabase."
  []
  (validation/check-has-application-permission :monitoring)
  {:system-info   (troubleshooting/system-info)
   :metabase-info (troubleshooting/metabase-info)})

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/diagnostic_info/connection_pool_info"
  "Returns database connection pool info for the current Metabase instance."
  []
  (validation/check-has-application-permission :monitoring)
  (let [pool-info (troubleshooting/connection-pool-info)
        headers   {"Content-Disposition" "attachment; filename=\"connection_pool_info.json\""}]
    (assoc (response/response pool-info) :headers headers, :status 200)))

(api/define-routes)
