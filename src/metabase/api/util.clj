(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks."
  (:require [clojure.java.jdbc :as jdbc]
            [compojure.core :refer [GET POST]]
            [crypto.random :as crypto-random]
            [metabase
             [logger :as logger]
             [troubleshooting :as troubleshooting]]
            [metabase.api.common :as api]
            [metabase.models.setting.cache :as cache]
            [metabase.util
             [schema :as su]
             [stats :as stats]]
            [toucan.db :as db]))

(api/defendpoint POST "/password_check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [:as {{:keys [password]} :body}]
  {password su/ComplexPassword} ;; if we pass the su/ComplexPassword test we're g2g
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
  []
  (api/check-superuser)
  {:system-info (troubleshooting/system-info)
   :metabase-info (troubleshooting/metabase-info)})

(defn- snapshot-path-for-name
  [snapshot-name]
  (str "frontend/test/snapshots/" snapshot-name ".sql"))

; FIXME: only enable for test + sanitize `name`
(api/defendpoint POST "/snapshot/:name"
  [name]
  (jdbc/query (db/connection) ["SCRIPT TO ?" (snapshot-path-for-name name)])
  nil)

; FIXME: only enable for test + sanitize `name`
(api/defendpoint POST "/restore/:name"
  [name]
  (jdbc/execute! (db/connection) ["DROP ALL OBJECTS"])
  (jdbc/execute! (db/connection) ["RUNSCRIPT FROM ?" (snapshot-path-for-name name)])
  (cache/restore-cache!)
  nil)

(api/define-routes)
