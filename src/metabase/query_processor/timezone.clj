(ns metabase.query-processor.timezone
  "Functions for fetching the timezone for the current query."
  (:require [metabase.driver :as driver]
            [metabase.util.date :as du]))

(defn- report-timezone-id
  ^String []
  (driver/report-timezone))

(defn report-timezone-id-if-supported
  "Timezone ID for the report timezone, if the current driver supports it. (If the current driver supports it, this is
  bound by the `bind-effective-timezone` middleware.)"
  ^String []
  (when (driver/supports? driver/*driver* :set-timezone)
    (report-timezone-id)))

(defn- current-database-timezone-id []
  ;; TODO - use QP store for this
  #_(:timezone (qp.store/database))
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

(def ^:dynamic ^:private *results-timezone-id-override*
  nil)

(defn do-with-results-timezone-id
  "Impl for `with-results-timezone-id` macro."
  [timezone-id f]
  (binding [*results-timezone-id-override* timezone-id]
    (f)))

(defmacro with-results-timezone-id
  "Temporarily override the results timezone ID used for parsing and serializing datetime strings and other behavior.
  This is useful primarily for tests."
  [timezone-id & body]
  `(do-with-results-timezone-id ~timezone-id (fn [] ~@body)))

(defn results-timezone-id
  "The timezone that a query is actually ran in -- report timezone, if set and supported by the current driver;
  otherwise the timezone of the database (if known), otherwise the system timezone. Guaranteed to always return a
  timezone ID — never returns `nil`."
  ^String []
  ;; NOTE: if we don't have an explicit report-timezone then use the JVM timezone
  ;;       this ensures alignment between the way dates are processed by JDBC and our returned data
  ;;       GH issues: #2282, #2035
  (or *results-timezone-id-override*
      (report-timezone-id-if-supported)
      (current-database-timezone-id)
      (system-timezone-id)))
