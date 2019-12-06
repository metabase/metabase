(ns metabase.query-processor.timezone
  "Functions for fetching the timezone for the current query."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :refer [tru]]))

(def ^:private ^:dynamic *report-timezone-id-override* nil)

(def ^:private ^:dynamic *database-timezone-id-override* nil)

(def ^:private ^:dynamic *results-timezone-id-override* nil)

;; TIMEZONE FIXME - since these are all intended for REPL and test usage we should move them all into a test namespace.

(defn do-with-report-timezone-id
  "Impl for `with-report-timezone-id`."
  [timezone-id thunk]
  {:pre [((some-fn nil? string?) timezone-id)]}
  ;; This will fail if the app DB isn't initialized yet. That's fine — there's no DBs to notify if the app DB isn't
  ;; set up.
  (try
    (#'driver/notify-all-databases-updated)
    (catch Throwable _))
  (binding [*report-timezone-id-override* (or timezone-id ::nil)]
    (thunk)))

(defmacro with-report-timezone-id
  "Override the `report-timezone` Setting and execute `body`. Intended primarily for REPL and test usage."
  [timezone-id & body]
  `(do-with-report-timezone-id ~timezone-id (fn [] ~@body)))

(defn do-with-database-timezone-id
  "Impl for `with-database-timezone-id`."
  [timezone-id thunk]
  {:pre [((some-fn nil? string?) timezone-id)]}
  (binding [*database-timezone-id-override* (or timezone-id ::nil)]
    (thunk)))

(defmacro with-database-timezone-id
  "Override the database timezone ID and execute `body`. Intended primarily for REPL and test usage."
  [timezone-id & body]
  `(do-with-database-timezone-id ~timezone-id (fn [] ~@body)))

(defn do-with-results-timezone-id
  "Impl for `with-results-timezone-id`."
  [timezone-id thunk]
  {:pre [((some-fn nil? string?) timezone-id)]}
  (binding [*results-timezone-id-override* (or timezone-id ::nil)]
    (thunk)))

(defmacro with-results-timezone-id
  "Override the determined results timezone ID and execute `body`. Intended primarily for REPL and test usage."
  [timezone-id & body]
  `(do-with-results-timezone-id ~timezone-id (fn [] ~@body)))

;; TODO - consider making this `metabase.util.date-2/the-timezone-id`
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Public Interface                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn report-timezone-id-if-supported
  "Timezone ID for the report timezone, if the current driver supports it. (If the current driver supports it, this is
  bound by the `bind-effective-timezone` middleware.)"
  (^String []
   (report-timezone-id-if-supported driver/*driver*))

  (^String [driver]
   (when (driver/supports? driver :set-timezone)
     (valid-timezone-id (report-timezone-id*)))))

(defn database-timezone-id
  "The timezone that the current database is in, as determined by the most recent sync."
  (^String []
   (database-timezone-id ::db-from-store))

  (^String [database]
   (valid-timezone-id
    (or *database-timezone-id-override*
        (:timezone (if (= database ::db-from-store) (qp.store/database) database))))))

(defn system-timezone-id
  "The system timezone of this Metabase instance."
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
  (^String []
   (results-timezone-id driver/*driver* ::db-from-store))

  (^String [database]
   (results-timezone-id (:engine database) database))

  (^String [driver database]
   (valid-timezone-id
    (or *results-timezone-id-override*
        (report-timezone-id-if-supported driver)
        ;; don't actually fetch DB from store unless needed — that way if `*results-timezone-id-override*` is set we
        ;; don't need to init a store during tests
        (database-timezone-id database)
        ;; NOTE: if we don't have an explicit report-timezone then use the JVM timezone
        ;;       this ensures alignment between the way dates are processed by JDBC and our returned data
        ;;       GH issues: #2282, #2035
        (system-timezone-id)))))
