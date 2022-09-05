(ns metabase.driver.hive-like
  (:require [buddy.core.codecs :as codecs]
            [clojure.string :as str]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util :as sql.u]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honeysql-extensions :as hx])
  (:import [java.sql ResultSet Types]
           [java.time LocalDate OffsetDateTime ZonedDateTime]))

(driver/register! :hive-like
  :parent #{:sql-jdbc ::sql-jdbc.legacy/use-legacy-classes-for-read-and-set}
  :abstract? true)

(defmethod driver/escape-alias :hive-like
  [driver s]
  ;; replace question marks inside aliases with `_QMARK_`, otherwise Spark SQL will interpret them as JDBC parameter
  ;; placeholder (yes, even if the identifier is quoted... (:unamused:)
  ;;
  ;; `_QMARK_` is kind of arbitrary but that's what [[munge]] does and it seems like it would lead to less potential
  ;; name clashes than if we just used underscores.
  (let [s (str/replace s #"\?" "_QMARK_")]
    ((get-method driver/escape-alias :sql) driver s)))

(defmethod driver/db-start-of-week :hive-like
  [_]
  :sunday)

(defmethod sql-jdbc.conn/data-warehouse-connection-pool-properties :hive-like
  [driver database]
  ;; The Hive JDBC driver doesn't support `Connection.isValid()`, so we need to supply a test query for c3p0 to use to
  ;; validate connections upon checkout.
  (merge
   ((get-method sql-jdbc.conn/data-warehouse-connection-pool-properties :sql-jdbc) driver database)
   {"preferredTestQuery" "SELECT 1"}))

(defmethod sql-jdbc.sync/database-type->base-type :hive-like
  [_ database-type]
  (condp re-matches (name database-type)
    #"boolean"          :type/Boolean
    #"tinyint"          :type/Integer
    #"smallint"         :type/Integer
    #"int"              :type/Integer
    #"bigint"           :type/BigInteger
    #"float"            :type/Float
    #"double"           :type/Float
    #"double precision" :type/Double
    #"decimal.*"        :type/Decimal
    #"char.*"           :type/Text
    #"varchar.*"        :type/Text
    #"string.*"         :type/Text
    #"binary*"          :type/*
    #"date"             :type/Date
    #"time"             :type/Time
    #"timestamp"        :type/DateTime
    #"interval"         :type/*
    #"array.*"          :type/Array
    #"map"              :type/Dictionary
    #".*"               :type/*))

(defmethod sql.qp/current-datetime-honeysql-form :hive-like [_] :%now)

(defmethod sql.qp/unix-timestamp->honeysql [:hive-like :seconds]
  [_ _ expr]
  (hx/->timestamp (hsql/call :from_unixtime expr)))

(defn- date-format [format-str expr]
  (hsql/call :date_format expr (hx/literal format-str)))

(defn- str-to-date [format-str expr]
  (hx/->timestamp
   (hsql/call :from_unixtime
              (hsql/call :unix_timestamp
                         expr (hx/literal format-str)))))

(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defmethod sql.qp/date [:hive-like :default]         [_ _ expr] (hx/->timestamp expr))
(defmethod sql.qp/date [:hive-like :minute]          [_ _ expr] (trunc-with-format "yyyy-MM-dd HH:mm" (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :minute-of-hour]  [_ _ expr] (hsql/call :minute (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :hour]            [_ _ expr] (trunc-with-format "yyyy-MM-dd HH" (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :hour-of-day]     [_ _ expr] (hsql/call :hour (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :day]             [_ _ expr] (trunc-with-format "yyyy-MM-dd" (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :day-of-month]    [_ _ expr] (hsql/call :dayofmonth (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :day-of-year]     [_ _ expr] (hx/->integer (date-format "D" (hx/->timestamp expr))))
(defmethod sql.qp/date [:hive-like :month]           [_ _ expr] (hsql/call :trunc (hx/->timestamp expr) (hx/literal :MM)))
(defmethod sql.qp/date [:hive-like :month-of-year]   [_ _ expr] (hsql/call :month (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :quarter-of-year] [_ _ expr] (hsql/call :quarter (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :year]            [_ _ expr] (hsql/call :trunc (hx/->timestamp expr) (hx/literal :year)))

(defrecord DateExtract [unit expr]
  hformat/ToSql
  (to-sql [_this]
    (format "extract(%s FROM %s)" (name unit) (hformat/to-sql expr))))

(defmethod sql.qp/date [:hive-like :day-of-week]
  [driver _unit expr]
  (sql.qp/adjust-day-of-week driver (-> (->DateExtract :dow (hx/->timestamp expr))
                                        (hx/with-database-type-info "integer"))))

(defmethod sql.qp/date [:hive-like :week]
  [driver _ expr]
  (let [week-extract-fn (fn [expr]
                          (-> (hsql/call :date_sub
                                         (hx/+ (hx/->timestamp expr)
                                               (hsql/raw "interval '1' day"))
                                         (->DateExtract :dow (hx/->timestamp expr)))
                              (hx/with-database-type-info "timestamp")))]
    (sql.qp/adjust-start-of-week driver week-extract-fn expr)))

(defmethod sql.qp/date [:hive-like :quarter]
  [_ _ expr]
  (hsql/call :add_months
    (hsql/call :trunc (hx/->timestamp expr) (hx/literal :year))
    (hx/* (hx/- (hsql/call :quarter (hx/->timestamp expr))
                1)
          3)))

(defmethod sql.qp/->honeysql [:hive-like :replace]
  [driver [_ arg pattern replacement]]
  (hsql/call :regexp_replace
    (sql.qp/->honeysql driver arg)
    (sql.qp/->honeysql driver pattern)
    (sql.qp/->honeysql driver replacement)))

(defmethod sql.qp/->honeysql [:hive-like :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_extract (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern) 0))

(defmethod sql.qp/->honeysql [:hive-like :median]
  [driver [_ arg]]
  (hsql/call :percentile (sql.qp/->honeysql driver arg) 0.5))

(defmethod sql.qp/->honeysql [:hive-like :percentile]
  [driver [_ arg p]]
  (hsql/call :percentile (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver p)))

(defmethod sql.qp/add-interval-honeysql-form :hive-like
  [driver hsql-form amount unit]
  (if (= unit :quarter)
    (recur driver hsql-form (* amount 3) :month)
    (hx/+ (hx/->timestamp hsql-form) (hsql/raw (format "(INTERVAL '%d' %s)" (int amount) (name unit))))))

(def ^:dynamic *param-splice-style*
  "How we should splice params into SQL (i.e. 'unprepare' the SQL). Either `:friendly` (the default) or `:paranoid`.
  `:friendly` makes a best-effort attempt to escape strings and generate SQL that is nice to look at, but should not
  be considered safe against all SQL injection -- use this for 'convert to SQL' functionality. `:paranoid` hex-encodes
  strings so SQL injection is impossible; this isn't nice to look at, so use this for actually running a query."
  :friendly)

(defmethod unprepare/unprepare-value [:hive-like String]
  [_ ^String s]
  ;; Because Spark SQL doesn't support parameterized queries (e.g. `?`) convert the entire String to hex and decode.
  ;; e.g. encode `abc` as `decode(unhex('616263'), 'utf-8')` to prevent SQL injection
  (case *param-splice-style*
    :friendly (str \' (sql.u/escape-sql s :backslashes) \')
    :paranoid (format "decode(unhex('%s'), 'utf-8')" (codecs/bytes->hex (.getBytes s "UTF-8")))))

;; Hive/Spark SQL doesn't seem to like DATEs so convert it to a DATETIME first
(defmethod unprepare/unprepare-value [:hive-like LocalDate]
  [driver t]
  (unprepare/unprepare-value driver (t/local-date-time t (t/local-time 0))))

(defmethod unprepare/unprepare-value [:hive-like OffsetDateTime]
  [_ t]
  (format "to_utc_timestamp('%s', '%s')" (u.date/format-sql (t/local-date-time t)) (t/zone-offset t)))

(defmethod unprepare/unprepare-value [:hive-like ZonedDateTime]
  [_ t]
  (format "to_utc_timestamp('%s', '%s')" (u.date/format-sql (t/local-date-time t)) (t/zone-id t)))

;; Hive/Spark SQL doesn't seem to like DATEs so convert it to a DATETIME first
(defmethod sql-jdbc.execute/set-parameter [:hive-like LocalDate]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/local-date-time t (t/local-time 0))))

;; TIMEZONE FIXME — not sure what timezone the results actually come back as
(defmethod sql-jdbc.execute/read-column-thunk [:hive-like Types/TIME]
  [_ ^ResultSet rs _rsmeta ^Integer i]
  (fn []
    (when-let [t (.getTimestamp rs i)]
      (t/offset-time (t/local-time t) (t/zone-offset 0)))))

(defmethod sql-jdbc.execute/read-column-thunk [:hive-like Types/DATE]
  [_ ^ResultSet rs _rsmeta ^Integer i]
  (fn []
    (when-let [t (.getDate rs i)]
      (t/zoned-date-time (t/local-date t) (t/local-time 0) (t/zone-id "UTC")))))

(defmethod sql-jdbc.execute/read-column-thunk [:hive-like Types/TIMESTAMP]
  [_ ^ResultSet rs _rsmeta ^Integer i]
  (fn []
    (when-let [t (.getTimestamp rs i)]
      (t/zoned-date-time (t/local-date-time t) (t/zone-id "UTC")))))
