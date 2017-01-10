(ns metabase.driver.clickhouse
  (:require (clojure [set :as set])
            [honeysql.core :as hsql]
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))

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
   :UInt64      :type/BigInteger})

(defn- connection-details->spec [details]
  (-> details
      (set/rename-keys {:dbname :db})
      dbspec/clickhouse
      (sql/handle-additional-options details)))

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


(defrecord ClickHouseDriver []
  clojure.lang.Named
  (getName [_] "ClickHouse"))


(u/strict-extend ClickHouseDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:details-fields (constantly [{:name "host"
                                        :display-name "Host"
                                        :default      "localhost"}
                                       {:name         "port"
                                        :display-name "Port"
                                        :type         :integer
                                        :default      8123}
                                       {:name         "dbname"
                                        :display-name "Database name"
                                        :placeholder  "database_name"
                                        :required     true}
                                       {:name         "user"
                                        :display-name "Database username"
                                        :placeholder  "What username do you use to login to the database?"
                                        :default      "default"
                                        :required     false}
                                       {:name         "password"
                                        :display-name "Database password"
                                        :type         :password
                                        :placeholder  "*******"}
                                       {:name         "additional-options"
                                        :display-name "Additional JDBC connection string options"
                                        :placeholder  "connection_timeout=50"}])
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

(driver/register-driver! :clickhouse (ClickHouseDriver.))