(ns metabase.driver.hive-like
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql-jdbc.execute.legacy-impl :as legacy]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.models.table :refer [Table]]
            [metabase.util
             [date-2 :as u.date]
             [honeysql-extensions :as hx]]
            [toucan.db :as db])
  (:import [java.sql PreparedStatement ResultSet Types]
           [java.time LocalDate OffsetDateTime ZonedDateTime]))

(driver/register! :hive-like
  :parent #{:sql-jdbc ::legacy/use-legacy-classes-for-read-and-set}
  :abstract? true)

(defmethod sql-jdbc.conn/data-warehouse-connection-pool-properties :hive-like
  [driver]
  ;; The Hive JDBC driver doesn't support `Connection.isValid()`, so we need to supply a test query for c3p0 to use to
  ;; validate connections upon checkout.
  (merge
   ((get-method sql-jdbc.conn/data-warehouse-connection-pool-properties :sql-jdbc) driver)
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

(defmethod sql.qp/current-datetime-fn :hive-like [_] :%now)

(defmethod sql.qp/unix-timestamp->timestamp [:hive-like :seconds]
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
(defmethod sql.qp/date [:hive-like :week-of-year]    [_ _ expr] (hsql/call :weekofyear (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :month]           [_ _ expr] (hsql/call :trunc (hx/->timestamp expr) (hx/literal :MM)))
(defmethod sql.qp/date [:hive-like :month-of-year]   [_ _ expr] (hsql/call :month (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :quarter-of-year] [_ _ expr] (hsql/call :quarter (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :year]            [_ _ expr] (hsql/call :trunc (hx/->timestamp expr) (hx/literal :year)))

(defmethod sql.qp/date [:hive-like :day-of-week]
  [_ _ expr]
  (hx/->integer (date-format "u"
                             (hx/+ (hx/->timestamp expr)
                                   (hsql/raw "interval '1' day")))))

(defmethod sql.qp/date [:hive-like :week]
  [_ _ expr]
  (hsql/call :date_sub
    (hx/+ (hx/->timestamp expr)
          (hsql/raw "interval '1' day"))
    (date-format "u"
                 (hx/+ (hx/->timestamp expr)
                       (hsql/raw "interval '1' day")))))

(defmethod sql.qp/date [:hive-like :quarter]
  [_ _ expr]
  (hsql/call :add_months
    (hsql/call :trunc (hx/->timestamp expr) (hx/literal :year))
    (hx/* (hx/- (hsql/call :quarter (hx/->timestamp expr))
                1)
          3)))

(defmethod driver/date-add :hive-like
  [_ dt amount unit]
  (hx/+ (hx/->timestamp dt) (hsql/raw (format "(INTERVAL '%d' %s)" (int amount) (name unit)))))

;; ignore the schema when producing the identifier
(defn qualified-name-components
  "Return the pieces that represent a path to `field`, of the form `[table-name parent-fields-name* field-name]`."
  [{field-name :name, table-id :table_id}]
  [(db/select-one-field :name Table, :id table-id) field-name])

(defmethod sql.qp/field->identifier :hive-like
  [_ field]
  (apply hsql/qualify (qualified-name-components field)))

(defn- run-query
  "Run the query itself."
  [driver {sql :query, :keys [params remark max-rows]} connection]
  (let [sql     (str "-- " remark "\n" sql)
        options {:identifiers identity
                 :as-arrays?  true
                 :max-rows    max-rows
                 :read-columns   (partial sql-jdbc.execute/read-columns driver)
                 :set-parameters (partial sql-jdbc.execute/set-parameters driver)}]
    (with-open [connection (jdbc/get-connection connection)]
      (with-open [^PreparedStatement statement (jdbc/prepare-statement connection sql options)]
        (let [statement        (into [statement] params)
              [columns & rows] (jdbc/query connection statement options)]
          {:rows    (or rows [])
           :columns (map u/qualified-name columns)})))))

(defn run-query-without-timezone
  "Runs the given query without trying to set a timezone"
  [driver _ connection query]
  (run-query driver query connection))

(defmethod unprepare/unprepare-value [:hive-like String]
  [_ value]
  (str \' (str/replace value "'" "\\\\'") \'))

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
(defmethod sql-jdbc.execute/read-column [:hive-like Types/TIME]
  [_ _ ^ResultSet rs rsmeta ^Integer i]
  (t/offset-time (t/local-time (.getTimestamp rs i)) (t/zone-offset 0)))

(defmethod sql-jdbc.execute/read-column [:hive-like Types/DATE]
  [_ _ ^ResultSet rs rsmeta ^Integer i]
  (t/zoned-date-time (t/local-date (.getDate rs i)) (t/local-time 0) (t/zone-id "UTC")))

(defmethod sql-jdbc.execute/read-column [:hive-like Types/TIMESTAMP]
  [_ _ ^ResultSet rs rsmeta ^Integer i]
  (t/zoned-date-time (t/local-date-time (.getTimestamp rs i)) (t/zone-id "UTC")))
