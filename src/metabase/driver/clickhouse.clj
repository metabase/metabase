(ns metabase.driver.clickhouse
  (:require [clojure
             [set :as set]
             [string :as string]]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :as field]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))

(defrecord ClickHouseDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "ClickHouse"))

(def ^:private ^:const column->base-type
  "Map of ClickHouse column types -> Field base types.
   Add more mappings here as you come across them."
  {:Array       :type/*
   :Date        :type/Date
   :DateTime    :type/DateTime
   :Enum8       :type/*
   :Enum16      :type/*
   :FixedString :type/Text
   :Float32     :type/Float
   :Float64     :type/Float
   :Int8        :type/Integer
   :Int16       :type/Integer
   :Int32       :type/Integer
   :Int64       :type/BigInteger
   :String      :type/Text
   :Tuple       :type/*
   :UInt8       :type/Integer
   :UInt16      :type/Integer
   :UInt32      :type/Integer
   :UInt64      :type/BigInteger
   :UUID        :type/UUID})

(defn- connection-details->spec [details]
  (let [{:keys [host port dbname]} details]
    (-> (dissoc details :host :port :dbname)
        (merge {:classname   "ru.yandex.clickhouse.ClickHouseDriver"
                :subprotocol "clickhouse"
                :subname     (str "//" host ":" port "/" dbname)
                :use_server_time_zone_for_dates  true})
        (sql/handle-additional-options))))

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

(defn- to-day-of-week [expr]
  ;; ClickHouse weeks start on Monday
  (hx/+ (modulo (hsql/call :toDayOfWeek (hsql/call :toDateTime expr)) 7) 1))

(defn- to-day-of-month [expr]
  (hsql/call :toDayOfMonth (hsql/call :toDateTime expr)))

(defn- to-start-of-month [expr]
  (hsql/call :toStartOfMonth (hsql/call :toDateTime expr)))

(defn- to-start-of-quarter [expr]
  (hsql/call :toStartOfQuarter (hsql/call :toDateTime expr)))

(defn- to-day [expr]
  (hsql/call :toDate expr))

(defn- date [unit expr] 
  (case unit
    :default expr
    :minute (to-start-of-minute expr)
    :minute-of-hour (to-minute expr)
    :hour (to-start-of-hour expr)
    :hour-of-day (to-hour expr)
    :day (to-day expr)
    :day-of-week (to-day-of-week expr)
    :day-of-month (to-day-of-month expr)
    :day-of-year (to-day-of-year expr)
    :week (to-start-of-week expr)
    :week-of-year (to-week-of-year expr)
    :month (to-start-of-month expr)
    :month-of-year (to-month-of-year expr)
    :quarter (to-start-of-quarter expr)
    :quarter-of-year (to-quarter-of-year expr)
    :year (to-year expr)))

(defn- string-length-fn [field-key]
  (hsql/call :lengthUTF8 field-key))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :toDateTime expr)
    :milliseconds (hsql/call :toDateTime (hx// expr 1000))))

(defn- apply-breakout [driver honeysql-form {breakout-field-clauses :breakout, fields-field-clauses :fields}]
  (-> honeysql-form
      ;; ClickHouse requires that we refer to Fields using the alias we gave them in the
      ;; `SELECT` clause, rather than repeating their definitions.
      ((partial apply h/group) (map (partial sqlqp/field-clause->alias driver) breakout-field-clauses))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it
      ;; twice, or HoneySQL will barf
      ((partial apply h/merge-select) (for [field-clause breakout-field-clauses
                                            :when        (not (contains? (set fields-field-clauses) field-clause))]
                                        (sqlqp/as driver field-clause)))))

(defn apply-order-by
  "Apply `order-by` clause to HONEYSQL-FORM. Default implementation of `apply-order-by` for SQL drivers."
  [driver honeysql-form {subclauses :order-by breakout-fields :breakout}]
  (let [[{:keys [special-type] :as first-breakout-field}] breakout-fields]
    (loop [honeysql-form honeysql-form, [[direction field] & more] subclauses]
      (let [honeysql-form (h/merge-order-by honeysql-form [(if (mbql.u/is-clause? :aggregation field)
                                                             (sqlqp/->honeysql driver field)
                                                             (sqlqp/field-clause->alias driver field))
                                                           direction])]
        (if (seq more)
          (recur honeysql-form more)
          honeysql-form)))))

;; ClickHouse doesn't support `TRUE`/`FALSE`; it uses `1`/`0`, respectively;
;; convert these booleans to numbers.
(defmethod sqlqp/->honeysql [ClickHouseDriver Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod sqlqp/->honeysql [ClickHouseDriver :stddev]
  [driver [_ field]]
  (hsql/call :stddevSamp (sqlqp/->honeysql driver field)))

(u/strict-extend ClickHouseDriver
  driver/IDriver
  (merge
   (sql/IDriverSQLDefaultsMixin)
   {:details-fields (constantly [driver/default-host-details
                                 (assoc driver/default-port-details :default 8123)
                                 (assoc driver/default-dbname-details :required false)
                                 (assoc driver/default-user-details :required false)
                                 driver/default-password-details
                                 driver/default-additional-options-details])
    :features (constantly #{:basic-aggregations
                            :standard-deviation-aggregations
                            :expressions
                            :expression-aggregations})})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-breakout            apply-breakout
          :apply-order-by            apply-order-by
          :column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :excluded-schemas          (constantly #{"system", "default", "probi"})
          :quote-style               (constantly :mysql)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the ClickHouse driver"
  []
  (driver/register-driver! :clickhouse (ClickHouseDriver.)))
