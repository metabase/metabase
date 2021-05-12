(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks."
  (:require [compojure.core :refer [GET POST]]
            [crypto.random :as crypto-random]
            [metabase.api.common :as api]
            [metabase.logger :as logger]
            [metabase.troubleshooting :as troubleshooting]
            [metabase.util.schema :as su]
            [metabase.util.stats :as stats]
            [ring.util.response :as ring.response]))

(api/defendpoint POST "/password_check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [:as {{:keys [password]} :body}]
  {password su/ValidPassword} ;; if we pass the su/ValidPassword test we're g2g
  {:valid true})

(api/defendpoint GET "/logs"
  "Logs."
  []
  (api/check-superuser)
  (logger/messages))

(api/defendpoint GET "/stats"
  "Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see
  what is being phoned home."
  []
  (api/check-superuser)
  (stats/anonymous-usage-stats))

(api/defendpoint GET "/random_token"
  "Return a cryptographically secure random 32-byte token, encoded as a hexadecimal string.
   Intended for use when creating a value for `embedding-secret-key`."
  []
  {:token (crypto-random/hex 32)})

(api/defendpoint GET "/bug_report_details"
  "Returns version and system information relevant to filing a bug report against Metabase."
  []
  (api/check-superuser)
  {:system-info   (troubleshooting/system-info)
   :metabase-info (troubleshooting/metabase-info)})

(api/defendpoint GET "/diagnostic_info/connection_pool_info"
  "Returns database connection pool info for the current Metabase instance."
  []
  (api/check-superuser)
  (let [pool-info (troubleshooting/connection-pool-info)
        headers   {"Content-Disposition" "attachment; filename=\"connection_pool_info.json\""}]
    (assoc (ring.response/response pool-info) :headers headers, :status 200)))

(api/define-routes)
