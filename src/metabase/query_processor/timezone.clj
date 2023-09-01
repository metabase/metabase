(ns metabase.query-processor.timezone
  "Functions for fetching the timezone for the current query."
  (:require
   [java-time :as t]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.expression.temporal
    :as lib.schema.expression.temporal]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.time ZonedDateTime)))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic *report-timezone-id-override* nil)

(def ^:private ^:dynamic *database-timezone-id-override* nil)

(def ^:private ^:dynamic *results-timezone-id-override* nil)

;; TODO - consider making this `metabase.util.date-2/the-timezone-id`
(mu/defn ^:private valid-timezone-id :- [:maybe ::lib.schema.expression.temporal/timezone-id]
  [timezone-id]
  (when (and (string? timezone-id)
             (seq timezone-id))
    (try
      (t/zone-id timezone-id)
      timezone-id
      (catch Throwable _
        (log/warn (tru "Invalid timezone ID ''{0}''" timezone-id))
        nil))))

(mu/defn ^:private report-timezone-id* :- [:maybe :string]
  []
  (when-not (= *report-timezone-id-override* ::nil)
    (or *report-timezone-id-override*
        (driver/report-timezone))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Public Interface                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(mr/def ::db-from-store
  [:= ::db-from-store])

(mu/defn ^:private resolve-database :- lib.metadata/DatabaseMetadata
  [database :- [:or lib.metadata/DatabaseMetadata ::db-from-store]]
  (if (= database ::db-from-store)
    (lib.metadata/database (qp.store/metadata-provider))
    database))

(mu/defn report-timezone-id-if-supported :- [:maybe ::lib.schema.expression.temporal/timezone-id]
  "Timezone ID for the report timezone, if the current driver and database supports it. (If the current driver supports it, this is
  bound by the `bind-effective-timezone` middleware.)"
  (^String []
   (report-timezone-id-if-supported driver/*driver* ::db-from-store))

  (^String [driver database :- [:or lib.metadata/DatabaseMetadata ::db-from-store]]
   (when (driver/database-supports? driver :set-timezone (resolve-database database))
     (valid-timezone-id (report-timezone-id*)))))

(mu/defn database-timezone-id :- [:maybe ::lib.schema.expression.temporal/timezone-id]
  "The timezone that the current database is in, as determined by the most recent sync."
  (^String []
   (database-timezone-id ::db-from-store))

  (^String [database :- [:or lib.metadata/DatabaseMetadata ::db-from-store]]
   (when-not (= *database-timezone-id-override* ::nil)
     (valid-timezone-id
      (or *database-timezone-id-override*
          (:timezone (resolve-database database)))))))

(mu/defn system-timezone-id :- ::lib.schema.expression.temporal/timezone-id
  "The system timezone of this Metabase instance."
  ^String []
  (.. (t/system-clock) getZone getId))

(mu/defn requested-timezone-id :- [:maybe ::lib.schema.expression.temporal/timezone-id]
  "The timezone that we would *like* to run a query in, regardless of whether we are actually able to do so. This is
  always equal to the value of the `report-timezone` Setting (if it is set), otherwise the database timezone (if known),
  otherwise the system timezone."
  ^String []
  (valid-timezone-id (report-timezone-id*)))

(mu/defn results-timezone-id :- ::lib.schema.expression.temporal/timezone-id
  "The timezone that a query is actually ran in ­ report timezone, if set and supported by the current driver;
  otherwise the timezone of the database (if known), otherwise the system timezone. Guaranteed to always return a
  timezone ID ­ never returns `nil`."
  (^String []
   (results-timezone-id driver/*driver* ::db-from-store))

  (^String [database :- lib.metadata/DatabaseMetadata]
   (results-timezone-id (:engine database) database))

  (^String [driver   :- :keyword
            database :- [:or lib.metadata/DatabaseMetadata ::db-from-store]
            & {:keys [use-report-timezone-id-if-unsupported?]
               :or   {use-report-timezone-id-if-unsupported? false}}]
   (valid-timezone-id
    (or *results-timezone-id-override*
        (if use-report-timezone-id-if-unsupported?
          (valid-timezone-id (report-timezone-id*))
          (report-timezone-id-if-supported driver database))
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
