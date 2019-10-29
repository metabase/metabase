(ns metabase.query-processor.timezone
  "Functions for fetching the timezone for the current query."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.query-processor
             [store :as qp.store]
             [timezone :as qp.timezone]]
            [metabase.util.i18n :refer [tru]]))

(def ^:private ^:dynamic *report-timezone-id-override* nil)

(def ^:private ^:dynamic *database-timezone-id-override* nil)

(def ^:private ^:dynamic *results-timezone-id-override* nil)

(defn do-with-report-timezone-id [timezone-id thunk]
  (binding [*report-timezone-id-override* (or timezone-id ::nil)]
    (thunk)))

(defmacro with-report-timezone-id [timezone-id & body]
  `(do-with-report-timezone-id ~timezone-id (fn [] ~@body)))

(defn do-with-database-timezone-id [timezone-id thunk]
  (binding [*database-timezone-id-override* (or timezone-id ::nil)]
    (thunk)))

(defmacro with-database-timezone-id [timezone-id & body]
  `(do-with-database-timezone-id ~timezone-id (fn [] ~@body)))

(defn do-with-results-timezone-id [timezone-id thunk]
  (binding [*results-timezone-id-override* (or timezone-id ::nil)]
    (thunk)))

(defmacro with-results-timezone-id [timezone-id & body]
  `(do-with-results-timezone-id ~timezone-id (fn [] ~@body)))

(defn- valid-timezone-id [timezone-id]
  (when (and (string? timezone-id)
             (seq timezone-id))
    (try
      (t/zone-id timezone-id)
      timezone-id
      (catch Throwable _
        (log/warn (tru "Invalid timezone ID ''{0}''" timezone-id))
        nil))))

(defn- report-timezone-id* []
  (or *report-timezone-id-override*
      (driver/report-timezone)))

(defn- database-timezone-id* []
  (or *database-timezone-id-override*
      (:timezone (qp.store/database))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Public Interface                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn report-timezone-id-if-supported
  "Timezone ID for the report timezone, if the current driver supports it. (If the current driver supports it, this is
  bound by the `bind-effective-timezone` middleware.)"
  ^String []
  (when (driver/supports? driver/*driver* :set-timezone)
    (valid-timezone-id (report-timezone-id*))))

(defn database-timezone-id
  ^String []
  (valid-timezone-id
   (database-timezone-id*)))

(defn system-timezone-id
  ^String []
  (.. (t/system-clock) getZone getId))

(defn requested-timezone-id
  "The timezone that we would *like* to run a query in, regardless of whether we are actaully able to do so. This is
  always equal to the value of the `report-timezone` Setting (if it is set), otherwise the database timezone (if known),
  otherwise the system timezone."
  ^String []
  (valid-timezone-id (report-timezone-id*)))

(defn results-timezone-id
  "The timezone that a query is actually ran in -- report timezone, if set and supported by the current driver;
  otherwise the timezone of the database (if known), otherwise the system timezone. Guaranteed to always return a
  timezone ID — never returns `nil`."
  ^String []
  (valid-timezone-id
   (or *results-timezone-id-override*
       (report-timezone-id-if-supported)
       (database-timezone-id)
       ;; NOTE: if we don't have an explicit report-timezone then use the JVM timezone
       ;;       this ensures alignment between the way dates are processed by JDBC and our returned data
       ;;       GH issues: #2282, #2035
       (system-timezone-id))))
