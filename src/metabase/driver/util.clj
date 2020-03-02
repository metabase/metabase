(ns metabase.driver.util
  "Utility functions for common operations on drivers."
  (:require [clojure.core.memoize :as memoize]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(def ^:private can-connect-timeout-ms
  "Consider `can-connect?`/`can-connect-with-details?` to have failed after this many milliseconds.
   By default, this is 5 seconds. You can configure this value by setting the env var `MB_DB_CONNECTION_TIMEOUT_MS`."
  (or (config/config-int :mb-db-connection-timeout-ms)
      5000))

(defn can-connect-with-details?
  "Check whether we can connect to a database with `driver` and `details-map` and perform a basic query such as `SELECT
  1`. Specify optional param `throw-exceptions` if you want to handle any exceptions thrown yourself (e.g., so you
  can pass the exception message along to the user); otherwise defaults to returning `false` if a connection cannot be
  established.

     (can-connect-with-details? :postgres {:host \"localhost\", :port 5432, ...})"
  ^Boolean [driver details-map & [throw-exceptions]]
  {:pre [(or (keyword? driver)
             (println "driver:" driver) ; NOCOMMIT
             )
         (map? details-map)]}
  (if throw-exceptions
    (try
      (u/with-timeout can-connect-timeout-ms
        (driver/can-connect? driver details-map))
      ;; actually if we are going to `throw-exceptions` we'll rethrow the original but attempt to humanize the message
      ;; first
      (catch Throwable e
        (log/error e (trs "Database connection error"))
        (throw (Exception. (str (driver/humanize-connection-error-message driver (.getMessage e))) e))))
    (try
      (can-connect-with-details? driver details-map :throw-exceptions)
      (catch Throwable e
        (log/error e (trs "Failed to connect to database"))
        false))))

(defn report-timezone-if-supported
  "Returns the report-timezone if `driver` supports setting it's timezone and a report-timezone has been specified by
  the user."
  [driver]
  (when (driver/supports? driver :set-timezone)
    (let [report-tz (driver/report-timezone)]
      (when-not (empty? report-tz)
        report-tz))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Driver Resolution                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- database->driver* [database-or-id]
  (or
   (:engine database-or-id)
   (db/select-one-field :engine 'Database, :id (u/get-id database-or-id))))

(def ^{:arglists '([database-or-id])} database->driver
  "Look up the driver that should be used for a Database. Lightly cached.

  (This is cached for a second, so as to avoid repeated application DB calls if this function is called several times
  over the duration of a single API request or sync operation.)"
  (memoize/ttl database->driver* :ttl/threshold 1000))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Available Drivers Info                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn features
  "Return a set of all features supported by `driver`."
  [driver]
  (set (for [feature driver/driver-features
             :when (driver/supports? driver feature)]
         feature)))

(defn available-drivers
  "Return a set of all currently available drivers."
  []
  (set (for [driver (descendants driver/hierarchy :metabase.driver/driver)
             :when  (driver/available? driver)]
         driver)))

(defn available-drivers-info
  "Return info about all currently available drivers, including their connection properties fields and supported
  features."
  []
  (into {} (for [driver (available-drivers)
                 :let   [props (try
                                 (driver/connection-properties driver)
                                 (catch Throwable e
                                   (log/error e (trs "Unable to determine connection properties for driver {0}" driver))))]
                 :when  props]
             ;; TODO - maybe we should rename `details-fields` -> `connection-properties` on the FE as well?
             [driver {:details-fields props
                      :driver-name    (driver/display-name driver)}])))
