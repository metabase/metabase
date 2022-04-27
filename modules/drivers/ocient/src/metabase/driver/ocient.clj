(ns metabase.driver.ocient
  "Metabase Ocient Driver."
  (:require [clojure
             [set :as set]]
            [clojure.tools.logging :as log]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clj-http.client :as http]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [metabase.util.honeysql-extensions :as hx]
            [java-time :as t]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.driver.sql.util :as sql.u]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.driver.sql.query-processor :as sql.qp]
            [schema.core :as s]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru]]
             [date-2 :as u.date]]
            [metabase.driver.sql-jdbc.sync.common :as sync-common]
            [metabase.driver.sql-jdbc.sync.interface :as i]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [execute :as sql-jdbc.execute]
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]])

  (:import [java.sql PreparedStatement Types]
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime ZonedDateTime Instant]
           [java.sql DatabaseMetaData ResultSet]
           [java.util Calendar TimeZone]))


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

(defmethod unprepare/unprepare-value [:ocient OffsetDateTime]
  [_ t]
  (let [s (-> (t/format "yyyy-MM-dd HH:mm:ss.SSS ZZZZZ" t)
              ;; Ocient doesn't like `Z` to mean UTC
              (str/replace #"Z$" "UTC"))]
    (format "timestamp('%s')" s)))

(defmethod unprepare/unprepare-value [:ocient ZonedDateTime]
  [_ t]
  (format "timestamp('%s')" (t/format "yyyy-MM-dd HH:mm:ss.SSS VV" t)))

(defmethod unprepare/unprepare-value [:ocient Instant]
  [driver t]
  (unprepare/unprepare-value driver (t/zoned-date-time t (t/zone-id "UTC"))))

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

