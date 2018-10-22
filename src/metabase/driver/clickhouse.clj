(ns metabase.driver.clickhouse
  (:require (clojure [set :as set])
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
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
   :UInt32      :type/BigInteger
   :UInt64      :type/BigInteger
   :UUID        :type/UUID})

(defn- connection-details->spec [details]
  (let [{:keys [host port dbname]} details]
    (-> (dissoc details :host :port :dbname)
        (merge {:classname   "ru.yandex.clickhouse.ClickHouseDriver"
                :subprotocol "clickhouse"
                :subname     (str "//" host ":" port "/" dbname)})
        (sql/handle-additional-options))))

(defn- minus [a b]
  (hsql/call :minus a b))

(defn- plus [a b]
  (hsql/call :plus a b))

(defn- divide [a b]
  (hsql/call :divide a b))

(defn- to-relative-day-num [expr]
  (hsql/call :toRelativeDayNum expr))

(defn- to-relative-week-num [expr]
  (hsql/call :toRelativeWeekNum expr))

(defn- to-relative-month-num [expr]
  (hsql/call :toRelativeMonthNum expr))

(defn- to-start-of-year [expr]
  (hsql/call :toStartOfYear expr))

(defn- to-day-of-year [expr]
  "ClickHouse don't have built-in toDay. So lets do it that way:
   minus(toRelativeDayNum(expr), toRelativeDayNum(toStartOfYear(expr)))"
  (minus (to-relative-day-num expr)
         (to-relative-day-num (to-start-of-year expr))))

(defn- to-week-of-year [expr]
  "ClickHouse don't have built-in toWeek. So lets do it that way:
   minus(toRelativeWeekNum(expr), toRelativeWeekNum(toStartOfYear(expr)))"
  (minus (to-relative-week-num expr)
         (to-relative-week-num (to-start-of-year expr))))

(defn- to-quarter-of-year [expr]
  "ClickHouse don't have built-in toQuarter. So lets do it that way:
   ceil(divide(plus(minus(toRelativeMonthNum(now()),
                          toRelativeMonthNum(toStartOfYear(now()))),
                   1),
              3))"
  (hsql/call :ceil (divide
                     (plus
                       (minus (to-relative-month-num expr)
                              (to-relative-month-num (to-start-of-year expr)))
                       1)
                     3)))

(defn- date [unit expr]
  (case unit
    :default expr
    :minute (hsql/call :toStartOfMinute expr)
    :minute-of-hour (hsql/call :toMinute expr)
    :hour (hsql/call :toStartOfHour expr)
    :hour-of-day (hsql/call :toHour expr)
    :day (hsql/call :toDate expr)
    :day-of-week (hsql/call :toDayOfWeek expr)
    :day-of-month (hsql/call :toDayOfMonth expr)
    :day-of-year (to-day-of-year expr)
    :week (hsql/call :toMonday expr)
    :week-of-year (to-week-of-year expr)
    :month (hsql/call :toStartOfMonth expr)
    :month-of-year (hsql/call :toMonth expr)
    :quarter (hsql/call :toStartOfQuarter expr)
    :quarter-of-year (to-quarter-of-year expr)
    :year (hsql/call :toYear expr)))

(defn- string-length-fn [field-key]
  (hsql/call :lengthUTF8 field-key))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :toDateTime expr)
    :milliseconds (recur (hx// expr 1000) :seconds)))

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
         {:active-tables             sql/post-filtered-active-tables
          :column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :excluded-schemas          (constantly #{"system"})
          :quote-style               (constantly :mysql)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :stddev-fn                 (constantly :stddevPop)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the Clickhouse driver"
  []
  (driver/register-driver! :clickhouse (ClickHouseDriver.)))
