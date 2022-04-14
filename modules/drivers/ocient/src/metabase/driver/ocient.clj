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



(defmethod sql-jdbc.sync/database-type->base-type :ocient [_ database-type]
  ;;(println "OCIENT sync DB type: " database-type)
  ({:BIGINT       :type/BigInteger
    :BINARY       :type/*
    :BOOLEAN      :type/Boolean
    :BYTE         :type/*
    :CHAR         :type/Text
    :DATE         :type/Date
    :DECIMAL      :type/Decimal
    :DOUBLE       :type/Float
    :FLOAT        :type/Float
    :HASH12       :type/*
    :HASH20       :type/*
    :INT          :type/Integer
    :IPV4         :type/*
    :INTEGER      :type/Integer
    :LONG         :type/BigInteger
    :SHORT        :type/Integer
    :SMALLINT     :type/Integer
    :TIME         :type/Time
    :TIMESTAMP    :type/DateTime
    :VARCHAR      :type/Text} database-type))

;; try FK support to see if manual support works ok
(defmethod driver/database-supports? [:ocient :foreign-keys] [_ _ db] true)
(defmethod driver/database-supports? [:ocient :native-parameters] [_ _ db] false)

(defmethod driver/database-supports? [:ocient :percentile-aggregations] [_ _ db] true)
(defmethod driver/database-supports? [:ocient :standard-deviation-aggregations] [_ _ db] true)
(defmethod driver/database-supports? [:ocient :expression-aggregations] [_ _ db] true)
(defmethod driver/database-supports? [:ocient :advanced-math-expressions] [_ _ db] true)
(defmethod driver/database-supports? [:ocient :left-join] [_ _ db] true)
(defmethod driver/database-supports? [:ocient :right-join] [_ _ db] true)
(defmethod driver/database-supports? [:ocient :inner-join] [_ _ db] true)
(defmethod driver/database-supports? [:ocient :nested-queries] [_ _ db] true)
(defmethod driver/database-supports? [:ocient :regex] [_ _ db] true)

;; overriding describe fks to see if this will allow FKs to work in MB. May not benecessary to enable this to get manual FK support.
(defmethod driver/describe-table-fks :ocient [_ _ _]
  nil)

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

;; The following INTERVAL calc needs work, it is resulting in
;; "SELECT count(*) AS \"count\" FROM \"canal\".\"location_d\" WHERE (\"canal\".\"location_d\".\"date\" >= day((CAST(now() AS timestamp) + days(-30))) AND \"canal\".\"
;; location_d\".\"date\" < day(now()))" 
;;"The comparison operation 'location_d.date >= day((current_timestamp())+(days((byte((-1)))*((30)))))' is invalid (LHS is type TIMESTAMP, RHS is type INT)",
;; WHERE clause should be: WHERE (canal.location_d.date >= now() +  days(-30) AND canal.location_d.date < now());

(defmethod sql.qp/->honeysql [:ocient :relative-datetime]
  [driver [_ amount unit]]
  (sql.qp/date driver unit (if (zero? amount)
                             (sql.qp/current-datetime-honeysql-form driver)
                             (sql.qp/add-interval-honeysql-form driver (sql.qp/current-datetime-honeysql-form driver) amount unit))))

(defmethod sql.qp/add-interval-honeysql-form :ocient
  [_ hsql-form amount unit]
  (hx/+
   (hx/->timestamp hsql-form)
   (case unit
     :second  (hsql/call :seconds amount)
     :minute  (hsql/call :minutes amount)
     :hour    (hsql/call :hours amount)
     :day     (hsql/call :days amount)
     :week    (hsql/call :weeks amount)
     :month   (hsql/call :months amount)
     :quarter (hsql/call :quarters amount)
     :year    (hsql/call :years amount))))
