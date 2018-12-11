(ns metabase.driver.clickhouse
  (:require [clojure
             [set :as set]
             [string :as string]]
            [clojure.java.jdbc :as jdbc]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :as field]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [ssh :as ssh]])
  (:import java.sql.DatabaseMetaData))

(driver/register! :clickhouse, :parent :sql-jdbc)

(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [
    [#"Array"       :type/*]
    [#"DateTime"    :type/DateTime]
    [#"Date"        :type/Date]
    [#"Decimal"     :type/Decimal]
    [#"Enum8"       :type/*]
    [#"Enum16"      :type/*]
    [#"FixedString" :type/Text]
    [#"Float32"     :type/Float]
    [#"Float64"     :type/Float]
    [#"Int8"        :type/Integer]
    [#"Int16"       :type/Integer]
    [#"Int32"       :type/Integer]
    [#"Int64"       :type/BigInteger]
    [#"String"      :type/Text]
    [#"Tuple"       :type/*]
    [#"UInt8"       :type/Integer]
    [#"UInt16"      :type/Integer]
    [#"UInt32"      :type/Integer]
    [#"UInt64"      :type/BigInteger]
    [#"UUID"        :type/UUID]]))

(defmethod sql-jdbc.sync/database-type->base-type :clickhouse [_ database-type]
  (database-type->base-type
   (string/replace (name database-type) #"(?:Nullable|LowCardinality)\((\S+)\)" "$1")))

(defmethod sql-jdbc.conn/connection-details->spec :clickhouse [_ details]
  (let [{:keys [host port dbname]} details]
    (-> (dissoc details :host :port :dbname)
        (merge {:classname   "ru.yandex.clickhouse.ClickHouseDriver"
                :subprotocol "clickhouse"
                :subname     (str "//" host
                                  ":" port
                                  (when dbname
                                    (str "/" dbname)))
                :use_server_time_zone_for_dates true})
        (sql-jdbc.common/handle-additional-options details))))

(defn- modulo [a b]
  (hsql/call :modulo a b))

(defn- to-relative-day-num [expr]
  (hsql/call :toRelativeDayNum (hsql/call :toDateTime expr)))

(defn- to-relative-week-num [expr]
  (hsql/call :toRelativeWeekNum (hsql/call :toDateTime expr)))

(defn- to-relative-month-num [expr]
  (hsql/call :toRelativeMonthNum (hsql/call :toDateTime expr)))

(defn- to-start-of-year [expr]
  (hsql/call :toStartOfYear (hsql/call :toDateTime expr)))

(defn- to-day-of-year [expr]
  (hx/+
   (hx/- (to-relative-day-num expr)
          (to-relative-day-num (to-start-of-year expr)))
   1))

(defn- to-week-of-year [expr]
  (hsql/call :toUInt8 (hsql/call :formatDateTime (hx/+ (hsql/call :toDate expr) 1) "%V")))

(defn- to-month-of-year [expr]
  (hx/+
   (hx/- (to-relative-month-num expr)
          (to-relative-month-num (to-start-of-year expr)))
   1))

(defn- to-quarter-of-year [expr]
  (hsql/call :ceil (hx//
                    (hx/+
                     (hx/- (to-relative-month-num expr)
                           (to-relative-month-num (to-start-of-year expr)))
                     1)
                    3)))

(defn- to-start-of-week [expr]
  ;; ClickHouse weeks start on Monday
  (hx/- (hsql/call :toMonday (hx/+ (hsql/call :toDate expr) 1)) 1))

(defn- to-start-of-minute [expr]
  (hsql/call :toStartOfMinute (hsql/call :toDateTime expr)))

(defn- to-start-of-hour [expr]
  (hsql/call :toStartOfHour (hsql/call :toDateTime expr)))

(defn- to-hour [expr]
  (hsql/call :toHour (hsql/call :toDateTime expr)))

(defn- to-minute [expr]
  (hsql/call :toMinute (hsql/call :toDateTime expr)))

(defn- to-year [expr]
  (hsql/call :toYear (hsql/call :toDateTime expr)))

(defn- to-day [expr]
  (hsql/call :toDate expr))

(defn- to-day-of-week [expr]
  ;; ClickHouse weeks start on Monday
  (hx/+ (modulo (hsql/call :toDayOfWeek (hsql/call :toDateTime expr)) 7) 1))

(defn- to-day-of-month [expr]
  (hsql/call :toDayOfMonth (hsql/call :toDateTime expr)))

(defn- to-start-of-month [expr]
  (hsql/call :toStartOfMonth (hsql/call :toDateTime expr)))

(defn- to-start-of-quarter [expr]
  (hsql/call :toStartOfQuarter (hsql/call :toDateTime expr)))

(defmethod sql.qp/date [:clickhouse :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:clickhouse :minute]          [_ _ expr] (to-start-of-minute expr))
(defmethod sql.qp/date [:clickhouse :minute-of-hour]  [_ _ expr] (to-minute expr))
(defmethod sql.qp/date [:clickhouse :hour]            [_ _ expr] (to-start-of-hour expr))
(defmethod sql.qp/date [:clickhouse :hour-of-day]     [_ _ expr] (to-hour expr))
(defmethod sql.qp/date [:clickhouse :day-of-week]     [_ _ expr] (to-day-of-week expr))
(defmethod sql.qp/date [:clickhouse :day-of-month]    [_ _ expr] (to-day-of-month expr))
(defmethod sql.qp/date [:clickhouse :day-of-year]     [_ _ expr] (to-day-of-year expr))
(defmethod sql.qp/date [:clickhouse :week-of-year]    [_ _ expr] (to-week-of-year expr))
(defmethod sql.qp/date [:clickhouse :month]           [_ _ expr] (to-start-of-month expr))
(defmethod sql.qp/date [:clickhouse :month-of-year]   [_ _ expr] (to-month-of-year expr))
(defmethod sql.qp/date [:clickhouse :quarter-of-year] [_ _ expr] (to-quarter-of-year expr))
(defmethod sql.qp/date [:clickhouse :year]            [_ _ expr] (to-year expr))

(defmethod sql.qp/date [:clickhouse :day]             [_ _ expr] (to-day expr))
(defmethod sql.qp/date [:clickhouse :week]            [_ _ expr] (to-start-of-week expr))
(defmethod sql.qp/date [:clickhouse :quarter]         [_ _ expr] (to-start-of-quarter expr))

(defmethod sql.qp/unix-timestamp->timestamp [:clickhouse :seconds] [_ _ expr]
  (hsql/call :toDateTime expr))

(defmethod sql.qp/apply-top-level-clause [:clickhouse :breakout]
  [driver _ honeysql-form {breakout-field-clauses :breakout, fields-field-clauses :fields}]
  (-> honeysql-form
      ;; ClickHouse requires that we refer to Fields using the alias we gave them in the
      ;; `SELECT` clause, rather than repeating their definitions. See BigQuery driver
      ((partial apply h/group) (map (partial sql.qp/field-clause->alias driver) breakout-field-clauses))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it
      ;; twice, or HoneySQL will barf
      ((partial apply h/merge-select) (for [field-clause breakout-field-clauses
                                            :when        (not (contains? (set fields-field-clauses) field-clause))]
                                        (sql.qp/as driver field-clause)))))

(defmethod sql.qp/apply-top-level-clause [:clickhouse :order-by]
  [driver _ honeysql-form {subclauses :order-by, :as query}]
  (loop [honeysql-form honeysql-form, [[direction field-clause] & more] subclauses]
    (let [honeysql-form (h/merge-order-by honeysql-form [(if (mbql.u/is-clause? :aggregation field-clause)
                                                           (sql.qp/->honeysql driver field-clause)
                                                           (sql.qp/field-clause->alias driver field-clause))
                                                         direction])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

;; ClickHouse doesn't support `TRUE`/`FALSE`; it uses `1`/`0`, respectively;
;; convert these booleans to numbers.
(defmethod sql.qp/->honeysql [:clickhouse Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod sql.qp/->honeysql [:clickhouse :stddev]
  [driver [_ field]]
  (hsql/call :stddevSamp (sql.qp/->honeysql driver field)))

(defmethod sql.qp/quote-style :clickhouse [_] :mysql)

(defmethod sql-jdbc.sync/excluded-schemas :clickhouse [_]
  #{"system"})

(defn- get-tables
  "Fetch a JDBC Metadata ResultSet of tables in the DB, optionally limited to ones belonging to a given schema."
  [^DatabaseMetaData metadata, ^String schema-or-nil, ^String db-name-or-nil]
  (vec
   (jdbc/metadata-result
    (.getTables metadata db-name-or-nil schema-or-nil "%" ; tablePattern "%" = match all tables
                (into-array String ["TABLE", "VIEW", "FOREIGN TABLE", "MATERIALIZED VIEW"])))))

(defn- post-filtered-active-tables
  [driver, ^DatabaseMetaData metadata, & [db-name-or-nil]]
  (set (for [table   (filter #(not (contains? (sql-jdbc.sync/excluded-schemas driver) (:table_schem %)))
                             (get-tables metadata db-name-or-nil nil))]
         (let [remarks (:remarks table)]
           {:name        (:table_name  table)
            :schema      (:table_schem table)
            :description (when-not (string/blank? remarks)
                           remarks)}))))

(defn- ->spec [db-or-id-or-spec]
  (if (u/id db-or-id-or-spec)
    (sql-jdbc.conn/db->pooled-connection-spec db-or-id-or-spec)
    db-or-id-or-spec))

;; ClickHouse exposes databases as schemas, but MetaBase sees
;; schemas as sub-entities of a database, at least the fast-active-tables
;; implementation would lead to duplicate tables because it iterates
;; over all schemas of the current dbs and then retrieves all
;; tables of a schema
(defmethod driver/describe-database :clickhouse
  [driver db-or-id-or-spec]
  (jdbc/with-db-metadata [metadata (->spec db-or-id-or-spec)]
    {:tables (post-filtered-active-tables
              ;; TODO: this only covers the db case, not id or spec
              driver metadata (get-in db-or-id-or-spec [:details :db]))}))

(defmethod driver.common/current-db-time-date-formatters :clickhouse [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss"))

(defmethod driver.common/current-db-time-native-query :clickhouse [_]
  "SELECT NOW()")

(defmethod driver/display-name :clickhouse [_] "ClickHouse")

(defmethod driver/supports? [:clickhouse :foreign-keys] [_ _] false)

;; TODO: Nested queries are actually supported, but I do not know how
;; to make the driver use correct aliases per sub-query
(defmethod driver/supports? [:clickhouse :nested-queries] [_ _] false)

(defmethod driver/connection-properties :clickhouse [_]
  (ssh/with-tunnel-config
    [driver.common/default-host-details
     (assoc driver.common/default-port-details :default 8123)
     driver.common/default-dbname-details
     (assoc driver.common/default-user-details :required false)
     (assoc driver.common/default-password-details :required false)
     driver.common/default-additional-options-details]))
