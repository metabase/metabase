(ns metabase.query-processor.timezone
  "Functions for fetching the timezone for the current query."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase
             [config :as config]
             [driver :as driver]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :refer [tru]])
  (:import java.time.ZonedDateTime))

(def ^:private ^:dynamic *report-timezone-id-override* nil)

(def ^:private ^:dynamic *database-timezone-id-override* nil)

(def ^:private ^:dynamic *results-timezone-id-override* nil)

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
  "The timezone that we would *like* to run a query in, regardless of whether we are actually able to do so. This is
  always equal to the value of the `report-timezone` Setting (if it is set), otherwise the database timezone (if known),
  otherwise the system timezone."
  ^String []
  (valid-timezone-id (report-timezone-id*)))

(defn results-timezone-id
  "The timezone that a query is actually ran in ­ report timezone, if set and supported by the current driver;
  otherwise the timezone of the database (if known), otherwise the system timezone. Guaranteed to always return a
  timezone ID ­ never returns `nil`."
  (^String []
   (results-timezone-id driver/*driver* ::db-from-store))

  (^String [database]
   (results-timezone-id (:engine database) database))

  (^String [driver database & {:keys [use-report-timezone-id-if-unsupported?]
                               :or   {use-report-timezone-id-if-unsupported? false}}]
   (valid-timezone-id
    (or *results-timezone-id-override*
        (if use-report-timezone-id-if-unsupported?
          (valid-timezone-id (report-timezone-id*))
          (report-timezone-id-if-supported driver))
        ;; don't actually fetch DB from store unless needed — that way if `*results-timezone-id-override*` is set we
        ;; don't need to init a store during tests
        (database-timezone-id database)
        ;; NOTE: if we don't have an explicit report-timezone then use the JVM timezone
        ;;       this ensures alignment between the way dates are processed by JDBC and our returned data
        ;;       GH issues: #2282, #2035
        (system-timezone-id)))))

(def ^ZonedDateTime now
  "Get the current moment in time adjusted to the results timezone ID, e.g. for relative datetime calculations."
  (comp (fn [timezone-id]
          (t/with-zone-same-instant (t/zoned-date-time) (t/zone-id timezone-id)))
        results-timezone-id))

;; normally I'd do this inline with the `def` form above but it busts Eastwood
(when config/is-dev?
  (alter-meta! #'now assoc :arglists (:arglists (meta #'results-timezone-id))))
