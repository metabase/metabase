(ns metabase.driver.vertica
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]]))

(driver/register! :vertica, :parent :sql-jdbc)

(defmethod sql-jdbc.sync/database-type->base-type :vertica [_ database-type]
  ({:Boolean                   :type/Boolean
     :Integer                   :type/Integer
     :Bigint                    :type/BigInteger
     :Varbinary                 :type/*
     :Binary                    :type/*
     :Char                      :type/Text
     :Varchar                   :type/Text
     :Money                     :type/Decimal
     :Numeric                   :type/Decimal
     :Double                    :type/Decimal
     :Float                     :type/Float
     :Date                      :type/Date
     :Time                      :type/Time
     :TimeTz                    :type/Time
     :Timestamp                 :type/DateTime
     :TimestampTz               :type/DateTime
     :AUTO_INCREMENT            :type/Integer
     (keyword "Long Varchar")   :type/Text
     (keyword "Long Varbinary") :type/*} database-type))

(defmethod sql-jdbc.conn/connection-details->spec :vertica [_ {:keys [host port db dbname]
                                                               :or   {host "localhost", port 5433, db ""}
                                                               :as   details}]
  (-> (merge {:classname   "com.vertica.jdbc.Driver"
              :subprotocol "vertica"
              :subname     (str "//" host ":" port "/" (or dbname db))}
             (dissoc details :host :port :dbname :db :ssl))
      (sql-jdbc.common/handle-additional-options details)))

(defmethod sql.qp/unix-timestamp->timestamp [:vertica :seconds] [_ _ expr]
  (hsql/call :to_timestamp expr))

(defn- cast-timestamp
  "Vertica requires stringified timestamps (what Date/DateTime/Timestamps are converted to) to be cast as timestamps
  before date operations can be performed. This function will add that cast if it is a timestamp, otherwise this is a
  noop."
  [expr]
  (if (du/is-temporal? expr)
    (hx/cast :timestamp expr)
    expr))

(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) (cast-timestamp expr)))
(defn- extract    [unit expr] (hsql/call :extract    unit              expr))

(def ^:private extract-integer (comp hx/->integer extract))

(def ^:private ^:const one-day (hsql/raw "INTERVAL '1 day'"))

(defmethod sql.qp/date [:vertica :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:vertica :minute]          [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:vertica :minute-of-hour]  [_ _ expr] (extract-integer :minute expr))
(defmethod sql.qp/date [:vertica :hour]            [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:vertica :hour-of-day]     [_ _ expr] (extract-integer :hour expr))
(defmethod sql.qp/date [:vertica :day]             [_ _ expr] (hx/->date expr))
(defmethod sql.qp/date [:vertica :day-of-week]     [_ _ expr] (hx/inc (extract-integer :dow expr)))
(defmethod sql.qp/date [:vertica :day-of-month]    [_ _ expr] (extract-integer :day expr))
(defmethod sql.qp/date [:vertica :day-of-year]     [_ _ expr] (extract-integer :doy expr))
(defmethod sql.qp/date [:vertica :week-of-year]    [_ _ expr] (hx/week expr))
(defmethod sql.qp/date [:vertica :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:vertica :month-of-year]   [_ _ expr] (extract-integer :month expr))
(defmethod sql.qp/date [:vertica :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:vertica :quarter-of-year] [_ _ expr] (extract-integer :quarter expr))
(defmethod sql.qp/date [:vertica :year]            [_ _ expr] (extract-integer :year expr))

(defmethod sql.qp/date [:vertica :week] [_ _ expr]
  (hx/- (date-trunc :week (hx/+ (cast-timestamp expr)
                                one-day))
        one-day))

(defmethod driver/date-interval :vertica [_ unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d %s')" (int amount) (name unit))))

(defn- materialized-views
  "Fetch the Materialized Views for a Vertica DATABASE.
   These are returned as a set of maps, the same format as `:tables` returned by `describe-database`."
  [database]
  (try (set (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                        ["SELECT TABLE_SCHEMA AS \"schema\", TABLE_NAME AS \"name\" FROM V_CATALOG.VIEWS;"]))
       (catch Throwable e
         (log/error "Failed to fetch materialized views for this database:" (.getMessage e)))))

(defmethod driver/describe-database :vertica [driver database]
  (-> ((get-method driver/describe-database :sql-jdbc) driver database)
      (update :tables set/union (materialized-views database))))

(defmethod driver.common/current-db-time-date-formatters :vertica [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss z"))

(defmethod driver.common/current-db-time-native-query :vertica [_]
  "select to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS TZ')")

(defmethod driver/current-db-time :vertica [& args]
  (apply driver.common/current-db-time args))

(defmethod sql-jdbc.execute/set-timezone-sql :vertica [_] "SET TIME ZONE TO %s;")
