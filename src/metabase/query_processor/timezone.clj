(ns metabase.query-processor.timezone
  "Functions for fetching the timezone for the current query."
  (:require [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.util.date :as du]))

(defn- report-timezone-id
  "Timezone ID for the report timezone, if the current driver supports it. (If the current driver supports it, this is
  bound by the `bind-effective-timezone` middleware.)"
  []
  (when (bound? #'du/*report-timezone*)
    (.getID du/*report-timezone*)))

(defn- current-database-timezone-id []
  (when (bound? #'du/*database-timezone*)
    (some-> du/*database-timezone* .getID)))

(defn- system-timezone-id []
  (.getID (java.util.TimeZone/getDefault)))

(defn requested-timezone-id
  "The timezone that we would *like* to run a query in, regardless of whether we are actaully able to do so. This is
  always equal to the value of the `report-timezone` Setting (if it is set), otherwise the database timezone (if known),
  otherwise the system timezone."
  ^String []
  (driver/report-timezone))

(defn results-timezone-id
  "The timezone that a query is actually ran in -- report timezone, if set and supported by the current driver;
  otherwise the timezone of the database (if known), otherwise the system timezone. Guaranteed to always return a
  timezone ID — never returns `nil`."
  ^String []
  ;; NOTE: if we don't have an explicit report-timezone then use the JVM timezone
  ;;       this ensures alignment between the way dates are processed by JDBC and our returned data
  ;;       GH issues: #2282, #2035
  (or (report-timezone-id)
      (current-database-timezone-id)
      (system-timezone-id)))
