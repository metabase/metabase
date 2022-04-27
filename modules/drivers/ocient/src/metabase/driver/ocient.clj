(ns metabase.driver.ocient
  "Metabase Ocient Driver."
  (:require [clojure
             [set :as set]]
            [clojure.tools.logging :as log]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clj-http.client :as http]
            [honeysql.core :as hsql]
            [metabase.util.honeysql-extensions :as hx]
            [java-time :as t]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.driver.sql.util :as sql.u]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru]]]
            [metabase.driver.sql-jdbc.sync.common :as sync-common]
            [metabase.driver.sql-jdbc.sync.interface :as i]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [execute :as sql-jdbc.execute]
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]])

  (:import [java.sql Connection PreparedStatement ResultSet Types Timestamp]
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           [java.sql DatabaseMetaData ResultSet]
           [java.util Date Calendar TimeZone]))


(driver/register! :ocient, :parent :sql-jdbc)

; ;;; +----------------------------------------------------------------------------------------------------------------+
; ;;; |                                         metabase.driver.sql-jdbc impls                                         |
; ;;; +----------------------------------------------------------------------------------------------------------------+

(defn- make-subname [host port db]
  (str "//" host ":" port "/" db))

(defn ocient
  "Create a Clojure JDBC database specification for the Ocient DB."
  [{:keys [host port db]
    :or   {host "localhost", port 4050, db "system"}
    :as   opts}]
  (merge
   {:classname                     "com.ocient.jdbc.JDBCDriver"
    :subprotocol                   "ocient"
    :subname                       (make-subname host port db)}
   (dissoc opts :host :port :db)))

(defmethod driver/display-name :ocient [_] "Ocient")

(defmethod sql-jdbc.conn/connection-details->spec :ocient [_ {ssl? :ssl, :as details-map}]
  (-> details-map
      (update :port (fn [port]
                      (if (string? port)
                        (Integer/parseInt port)
                        port)))
      ;; (assoc :pooling "OFF")
      ;; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
      (dissoc :ssl)
      (merge {:sslmode "disable"})
      (set/rename-keys {:dbname :db})
      ocient
      ;; note: seperator style is misspelled in metabase core code
      (sql-jdbc.common/handle-additional-options details-map, :seperator-style :semicolon)))


;; We'll do regex pattern matching here for determining Field types because Ocient types can have optional lengths,
;; e.g. VARCHAR(255) or NUMERIDECIMAL(16,4)
(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"BIGINT"    :type/BigInteger]
    [#"INT"       :type/Integer]
    [#"SHORT"     :type/Integer]
    [#"SMALLINT"  :type/Integer]
    [#"CHAR"      :type/Text]
    [#"VARCHAR"   :type/Text]
    [#"TEXT"      :type/Text]
    [#"BLOB"      :type/*]
    [#"BINARY"    :type/*]
    [#"REAL"      :type/Float]
    [#"DOUBLE"    :type/Float]
    [#"FLOAT"     :type/Float]
    [#"LONG"      :type/BigInteger]
    [#"DECIMAL"   :type/Decimal]
    [#"BOOLEAN"   :type/Boolean]
    [#"TIMESTAMP" :type/DateTimeWithLocalTZ]
    [#"DATETIME"  :type/DateTime]
    [#"DATE"      :type/Date]
    [#"TIME"      :type/Time]]))

(defmethod sql-jdbc.sync/database-type->base-type :ocient
  [_ database-type]
  (database-type->base-type database-type))


(doseq [[feature supported?] {:set-timezone                    true
                              :native-parameters               true
                              :basic-aggregations              true
                              :standard-deviation-aggregations true
                              :expression-aggregations         true
                              :advanced-math-expressions       true
                              :left-join                       true
                              :right-join                      true
                              :inner-join                      true
                              :nested-queries                  true
                              :regex                           true
                              :binning                         true
                              :foreign-keys                    (not config/is-test?)}]
  (defmethod driver/supports? [:ocient feature] [_ _] supported?))

;; overriding driver/describe-table-fields may fix many of our test errors
;; TODO

(defmethod sql-jdbc.execute/read-column-thunk [:ocient Types/TIMESTAMP]
  [_ rs _ i]
  (fn []
    (.toLocalDateTime (.getObject rs i))))

(defmethod sql-jdbc.execute/read-column-thunk [:ocient Types/DATE]
  [_ rs _ i]
  (fn []
    (.toLocalDate (.getObject rs i))))

(defmethod sql-jdbc.execute/set-parameter [:ocient java.time.OffsetDateTime]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [cal (Calendar/getInstance (TimeZone/getTimeZone (t/zone-id t)))
        t   (t/sql-timestamp t)]
    (log/tracef "(.setTimestamp %d ^%s %s <%s Calendar>)" i (.getName (class t)) (pr-str t) (.. cal getTimeZone getID))
    (.setTimestamp ps i t cal)))

(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) (hx/->timestamp expr)))

(defmethod sql.qp/->honeysql [:ocient :median]
  [driver [_ arg]]
  (sql.qp/->honeysql driver [:percentile arg 0.5]))

;;  :cause Unsupported temporal bucketing: You can't bucket a :type/Date Field by :hour.                                                                                                                                                                                      │
;;  :data {:type :invalid-query, :field [:field 11 {:temporal-unit :hour}], :base-type :type/Date, :unit :hour, :valid-units #{:quarter :day :week :default :day-of-week :month :month-of-year :day-of-month :year :day-of-year :week-of-year :quarter-of-year}}              │
;;  :via                                                                                                                                                                                                                                                                      │
;;  [{:type clojure.lang.ExceptionInfo                                                                                                                                                                                                                                        │
;;    :message Error calculating permissions for query                                                                                                                                                                                                                        │
;;    :data {:query {:database 1, :type :query, :query {:source-table 3, :aggregation [[:count]], :breakout [[:field 11 {:temporal-unit :hour}] [:field 11 {:temporal-unit :minute}]]}}}                                                                                      │
;;    :at [metabase.models.query.permissions$eval59295$mbql_permissions_path_set__59300$fn__59304 invoke permissions.clj 138]}                                                                                                                                                │
;;   {:type clojure.lang.ExceptionInfo                                                                                                                                                                                                                                        │
;;    :message Unsupported temporal bucketing: You can't bucket a :type/Date Field by :hour.                                                                                                                                                                                  │
;;    :data {:type :invalid-query, :field [:field 11 {:temporal-unit :hour}], :base-type :type/Date, :unit :hour, :valid-units #{:quarter :day :week :default :day-of-week :month :month-of-year :day-of-month :year :day-of-year :week-of-year :quarter-of-year}}            │
;;    :at [metabase.query_processor.middleware.validate_temporal_bucketing$validate_temporal_bucketing invokeStatic validate_temporal_bucketing.clj 39]}]                                                                                                                     │
;;  :trace
;; Cast time columns to timestamps
(defn- ->timestamp [honeysql-form]
  (hx/cast-unless-type-in "timestamp" #{"timestamp" "date" "time"} honeysql-form))

(defmethod sql.qp/date [:ocient :date]            [_ _ expr] (hsql/call :date expr))
(defmethod sql.qp/date [:ocient :minute]          [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:ocient :hour]            [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:ocient :day]             [_ _ expr] (hsql/call :date expr))
(defmethod sql.qp/date [:ocient :week]            [_ _ expr] (date-trunc :week expr))
(defmethod sql.qp/date [:ocient :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:ocient :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:ocient :year]            [_ _ expr] (date-trunc :year expr))
(defmethod sql.qp/date [:ocient :minute-of-hour]  [_ _ expr] (hsql/call :minute expr))
(defmethod sql.qp/date [:ocient :hour-of-day]     [_ _ expr] (hsql/call :hour expr))
(defmethod sql.qp/date [:ocient :day-of-week]     [_ _ expr] (hsql/call :day_of_week expr))
(defmethod sql.qp/date [:ocient :day-of-month]    [_ _ expr] (hsql/call :day_of_month expr))
(defmethod sql.qp/date [:ocient :day-of-year]     [_ _ expr] (hsql/call :day_of_year expr))
(defmethod sql.qp/date [:ocient :week-of-year]    [_ _ expr] (hsql/call :week expr))
(defmethod sql.qp/date [:ocient :month-of-year]   [_ _ expr] (hsql/call :month expr))
(defmethod sql.qp/date [:ocient :quarter-of-year] [_ _ expr] (hsql/call :quarter expr))

(defmethod sql.qp/date [:ocient :default]         [_ _ expr] expr)

(defmethod sql.qp/current-datetime-honeysql-form :ocient [driver] :%now)

;; (defmethod sql.qp/unix-timestamp->honeysql [:ocient :seconds]      [_ _ expr] (hsql/call :to_timestamp expr))
;; (defmethod sql.qp/unix-timestamp->honeysql [:ocient :milliseconds] [_ _ expr] (hsql/call :to_timestamp expr 3))
;; (defmethod sql.qp/unix-timestamp->honeysql [:ocient :microseconds] [_ _ expr] (hsql/call :to_timestamp expr 6))

(defmethod sql.qp/current-datetime-honeysql-form :ocient
  [_]
  :%current_timestamp)

;; The following INTERVAL calc needs work, it is resulting in
;; "SELECT count(*) AS \"count\" FROM \"canal\".\"location_d\" WHERE (\"canal\".\"location_d\".\"date\" >= day((CAST(now() AS timestamp) + days(-30))) AND \"canal\".\"
;; location_d\".\"date\" < day(now()))" 
;;"The comparison operation 'location_d.date >= day((current_timestamp())+(days((byte((-1)))*((30)))))' is invalid (LHS is type TIMESTAMP, RHS is type INT)",
;; WHERE clause should be: WHERE (canal.location_d.date >= now() +  days(-30) AND canal.location_d.date < now());

;; (defmethod sql.qp/->honeysql [:ocient :relative-datetime]
;;   [driver [_ amount unit]]
;;   (sql.qp/date driver unit (if (zero? amount)
;;                              (sql.qp/current-datetime-honeysql-form driver)
;;                              (sql.qp/add-interval-honeysql-form driver (sql.qp/current-datetime-honeysql-form driver) amount unit))))

;; (defmethod sql.qp/add-interval-honeysql-form :ocient
;;   [_ hsql-form amount unit]
;;   (hx/+
;;    (hx/->timestamp hsql-form)
;;    (case unit
;;      :second   (hsql/call :seconds amount)
;;      :minute   (hsql/call :minutes amount)
;;      :hour     (hsql/call :hours amount)
;;      :day      (hsql/call :days amount)
;;      :week     (hsql/call :weeks amount)
;;      :month    (hsql/call :months amount)
;;      :quarter  (hsql/call :months (hx/* amount (hsql/raw 3)))
;;      :quarters (hsql/call :months (hx/* amount (hsql/raw 3)))
;;      :year     (hsql/call :years amount))))

;; (defn- num-to-ds-interval [unit v] (hsql/call :numtodsinterval v (hx/literal unit)))
;; (defn- num-to-ym-interval [unit v] (hsql/call :numtoyminterval v (hx/literal unit)))

;; (defmethod sql.qp/unix-timestamp->honeysql [:ocient :seconds]
;;   [_ _ field-or-value]
;;   (hx/+ (hsql/raw "timestamp '1970-01-01 00:00:00 UTC'")
;;         (num-to-ds-interval :second field-or-value)))

;; (defmethod sql.qp/unix-timestamp->honeysql [:ocient :milliseconds]
;;   [driver _ field-or-value]
;;   (sql.qp/unix-timestamp->honeysql driver :seconds (hx// field-or-value (hsql/raw 1000))))

;; (defmethod sql.qp/unix-timestamp->honeysql [:ocient :microseconds]
;;   [driver _ field-or-value]
;;   (sql.qp/unix-timestamp->honeysql driver :seconds (hx// field-or-value (hsql/raw 1000000))))

;; (defn- parse-datetime    [format-str expr] (hsql/call :parsedatetime expr  (hx/literal format-str)))

;; ;; Rounding dates to quarters is a bit involved but still doable. Here's the plan:
;; ;; *  extract the year and quarter from the date;
;; ;; *  convert the quarter (1 - 4) to the corresponding starting month (1, 4, 7, or 10).
;; ;;    (do this by multiplying by 3, giving us [3 6 9 12]. Then subtract 2 to get [1 4 7 10]);
;; ;; *  concatenate the year and quarter start month together to create a yyyymm date string;
;; ;; *  parse the string as a date. :sunglasses:
;; ;;
;; ;; Postgres DATE_TRUNC('quarter', x)
;; ;; becomes  PARSEDATETIME(CONCAT(YEAR(x), ((QUARTER(x) * 3) - 2)), 'yyyyMM')
;; (defmethod sql.qp/date [:ocient :quarter]
;;   [_ _ expr]
;;   (parse-datetime "yyyyMM"
;;                   (hx/concat (hx/year expr) (hx/- (hx/* (hx/quarter expr)
;;                                                         3)
;;                                                   2))))
