(ns metabase.driver.exasol
  "Database driver for Exasol databases. Builds on top of the SQL JDBC driver, which implements most functionality
  for JDBC-based drivers."
  (:require [clojure
             [set :as set :refer [rename-keys]]
             [string :as s]]
            [clojure.java.jdbc :as jdbc]
            [honeysql.core :as hsql]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql-jdbc.execute.legacy-impl :as legacy]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]])
  (:import java.sql.Time
           [java.util Date UUID]))

(driver/register! :exasol, :parent #{:sql-jdbc ::legacy/use-legacy-classes-for-read-and-set})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/display-name :exasol [_] "Exasol")

(defmethod driver/date-add :exasol [_ dt unit amount]
  (hx/+ (hx/->timestamp dt) (hsql/raw (format "(INTERVAL '%d' %s)" (int amount) (name unit)))))

(defmethod driver/humanize-connection-error-message :exasol [_ message]
  (condp re-matches message
    #"^FATAL: database \".*\" does not exist$"
    (driver.common/connection-error-messages :database-name-incorrect)

    #"^No suitable driver found for.*$"
    (driver.common/connection-error-messages :invalid-hostname)

    #"^Connection refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections.$"
    (driver.common/connection-error-messages :cannot-connect-check-host-and-port)

    #"^FATAL: role \".*\" does not exist$"
    (driver.common/connection-error-messages :username-incorrect)

    #"^FATAL: password authentication failed for user.*$"
    (driver.common/connection-error-messages :password-incorrect)

    #"^FATAL: .*$" ; all other FATAL messages: strip off the 'FATAL' part, capitalize, and add a period
    (let [[_ message] (re-matches #"^FATAL: (.*$)" message)]
      (str (s/capitalize message) \.))

    #".*" ; default
    message))

(defmethod driver.common/current-db-time-date-formatters :exasol [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss"))

(defmethod driver.common/current-db-time-native-query :exasol [_]
  "select to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')")

(defmethod driver/current-db-time :exasol [& args]
  (apply driver.common/current-db-time args))


; ;;; +----------------------------------------------------------------------------------------------------------------+
; ;;; |                                           metabase.driver.sql impls                                            |
; ;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/unix-timestamp->timestamp [:exasol :seconds] [_ _ expr]
  (hsql/call :to_timestamp expr))

(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) (hx/->timestamp expr)))
(defn- extract    [unit expr] (hsql/call :extract    unit              (hx/->timestamp expr)))

(def ^:private extract-integer (comp hx/->integer extract))

(def ^:private ^:const one-day (hsql/raw "INTERVAL '1 day'"))

(defmethod sql.qp/date [:exasol :default]        [_ _ expr] expr)
(defmethod sql.qp/date [:exasol :minute]         [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:exasol :minute-of-hour] [_ _ expr] (extract-integer :minute expr))
(defmethod sql.qp/date [:exasol :hour]           [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:exasol :hour-of-day]    [_ _ expr] (extract-integer :hour expr))
(defmethod sql.qp/date [:exasol :day]            [_ _ expr] (hx/->date expr))
;; Postgres DOW is 0 (Sun) - 6 (Sat); increment this to be consistent with Java, H2, MySQL, and Mongo (1-7)
(defmethod sql.qp/date [:exasol :day-of-week]     [_ _ expr] (hx/inc (extract-integer :dow expr)))
(defmethod sql.qp/date [:exasol :day-of-month]    [_ _ expr] (extract-integer :day expr))
(defmethod sql.qp/date [:exasol :day-of-year]     [_ _ expr] (extract-integer :doy expr))
;; Postgres weeks start on Monday, so shift this date into the proper bucket and then decrement the resulting day
(defmethod sql.qp/date [:exasol :week]            [_ _ expr] (hx/- (date-trunc :week (hx/+ (hx/->timestamp expr)
                                                                                           one-day))
                                                                   one-day))
(defmethod sql.qp/date [:exasol :week-of-year]    [_ _ expr] (extract-integer :week (hx/+ (hx/->timestamp expr)
                                                                                          one-day)))
(defmethod sql.qp/date [:exasol :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:exasol :month-of-year]   [_ _ expr] (extract-integer :month expr))
(defmethod sql.qp/date [:exasol :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:exasol :quarter-of-year] [_ _ expr] (extract-integer :quarter expr))
(defmethod sql.qp/date [:exasol :year]            [_ _ expr] (extract-integer :year expr))

(defmethod sql.qp/->honeysql [:exasol :value] [driver value]
  (let [[_ value {base-type :base_type, database-type :database_type}] value]
    (sql.qp/->honeysql driver value)))


; ;;; +----------------------------------------------------------------------------------------------------------------+
; ;;; |                                         metabase.driver.sql-jdbc impls                                         |
; ;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private default-base-types
  "Map of Exasol column types -> Field base types. Add more mappings here as you come across them."
  {:BIGINT         :type/BigInteger
   :BOOLEAN        :type/Boolean
   :CHAR           :type/Text
   :DATE           :type/Date
   :DECIMAL        :type/Decimal
   :FLOAT          :type/Float
   :GEOMETRY       :type/Text
   :INTEGER        :type/Integer
   :SMALLINT       :type/Integer
   :TIMESTAMP      :type/DateTime
   :TINYINT        :type/Integer
   :VARCHAR        :type/Text
   (keyword "DOUBLE PRECISION")               :type/Float
   (keyword "INTERVAL DAY TO SECOND")         :type/*
   (keyword "INTERVAL YEAR TO MONTH")         :type/*
   (keyword "LONG VARCHAR")                   :type/Text
   (keyword "TIMESTAMP WITH LOCAL TIME ZONE") :type/DateTime})

(defmethod sql-jdbc.sync/database-type->base-type :exasol [driver column]
  (default-base-types column))

(defmethod sql-jdbc.conn/connection-details->spec :exasol
  [_ {:keys [host port schema querytimeout connection_pool]
      :as   details}]
  (-> (merge {:classname   "com.exasol.jdbc.EXADriver"
              :subprotocol "exa"
              :subname     (str host ":" port)
              :schema schema
              :querytimeout querytimeout
              :connection_pool connection_pool}
             (dissoc details :host :port :dbname :db :ssl))
      (sql-jdbc.common/handle-additional-options details)))

(defmethod sql-jdbc.conn/data-warehouse-connection-pool-properties :exasol
  [_ spec]
  {
   "acquireIncrement"             1
   "maxIdleTime"                  (* 3 60 60) ; 3 hours
   "minPoolSize"                  1
   "initialPoolSize"              1
   "maxPoolSize"                  (spec :connection_pool)
   "testConnectionOnCheckout"     true
   "maxIdleTimeExcessConnections" (* 15 60)})

(defmethod sql-jdbc.execute/set-timezone-sql :exasol [_]
  "ALTER SESSION SET time_zone = %s;")
