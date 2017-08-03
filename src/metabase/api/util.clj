(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin page tasks."
  (:require [clj-time
             [core :as time]
             [format :as tformat]]
            [compojure.core :refer [GET POST]]
            [crypto.random :as crypto-random]
            [metabase
             [driver :as driver]
             [logger :as logger]]
            [metabase.api.common :as api]
            [metabase.models
             [database :refer [Database]]
             [setting :as setting]]
            [metabase.util
             [schema :as su]
             [stats :as stats]]
            [toucan.db :as db])
  (:import [org.joda.time DateTime DateTimeZone]))

(api/defendpoint POST "/password_check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [:as {{:keys [password]} :body}]
  {password su/ComplexPassword} ;; if we pass the su/ComplexPassword test we're g2g
  {:valid true})

(api/defendpoint GET "/logs"
  "Logs."
  []
  (api/check-superuser)
  (logger/get-messages))

(api/defendpoint GET "/stats"
  "Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see
  what is being phoned home."
  []
  (api/check-superuser)
  (stats/anonymous-usage-stats))

(api/defendpoint GET "/random_token"
  "Return a cryptographically secure random 32-byte token, encoded as a hexidecimal string.
   Intended for use when creating a value for `embedding-secret-key`."
  []
  {:token (crypto-random/hex 32)})

(def ^:private date-time-formatter (tformat/formatters :date-time))

(defn- create-tz-info-map [^DateTimeZone tz ^DateTime current-time]
  (when tz
    {:name (.getID tz)
     :offset_time (tformat/unparse (tformat/with-zone date-time-formatter tz) current-time)
     :utc_time (tformat/unparse date-time-formatter current-time)}))

(defn- extract-time-zone [^DateTime dt]
  (-> dt .getChronology .getZone))

(api/defendpoint GET "/troubleshooting_info"
  "Troubleshooting info for timezones, and other admin settings"
  []
  (api/check-superuser)
  (let [current-time (time/now)
        report-tz    (when-let [tz-id (setting/get :report-timezone)]
                       (time/time-zone-for-id tz-id))]
    {:server_timezone    (create-tz-info-map (time/default-time-zone) current-time)
     :reporting_timezone (create-tz-info-map report-tz current-time)
     :databases          (mapv (fn [db-instance]
                                 (let [the-driver (driver/->driver (:engine db-instance))
                                       dt         (driver/current-db-time the-driver db-instance)]
                                   (create-tz-info-map (extract-time-zone dt) dt)))
                               (db/select Database {:order-by [:%lower.name]})) }))

(api/define-routes)
