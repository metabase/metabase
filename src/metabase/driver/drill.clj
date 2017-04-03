(ns metabase.driver.drill
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            (honeysql [core :as hsql]
                      [helpers :as h])
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.driver.hive :as hive]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.query-processor.util :as qputil])
  (:import
   (java.util Collections Date)
   (metabase.query_processor.interface DateTimeValue Value)))

;; ceil(extract(month from pickup_datetime)/3.0)

(def ^:const column->base-type
  "Map of Drill column types -> Field base types.
   Add more mappings here as you come across them."
  {;; Numeric types
   :BIGINT :type/BigInteger
   :BINARY :type/*
   :BOOLEAN :type/Boolean
   :DATE :type/Date
   :DECIMAL :type/Decimal
   ;; do we really need DEC and NUMERIC?
   :DEC :type/Decimal
   :NUMERIC :type/Decimal
   :FLOAT :type/Float
   :DOUBLE :type/Float
   (keyword "DOUBLE PRECISION") :type/Float
   :INTEGER :type/Integer
   :INT :type/Integer
   :INTERVAL :type/*
   :SMALLINT :type/Integer
   :TIME :type/Time
   :TIMESTAMP :type/DateTime
   (keyword "CHARACTER VARYING") :type/Text
   (keyword "CHARACTER") :type/Text
   (keyword "CHAR") :type/Text
   :VARCHAR :type/Text})

(defn- connection-details->spec [details]
  (-> details
      dbspec/drill
      (sql/handle-additional-options details)))

(defn- can-connect? [details]
  (let [connection (connection-details->spec details)]
    (= 1 (first (vals (first (jdbc/query connection ["SELECT 1 FROM (VALUES(1)) LIMIT 1"])))))))

(defn- date-format [format-str expr]
  (hsql/call :to_char expr (hx/literal format-str)))

(defn- str-to-date [format-str expr]
  (hsql/call :to_timestamp expr (hx/literal format-str)))

(defn trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defn date [unit expr]
  (case unit
    :default expr
    :minute (hsql/call :date_trunc_minute expr)
    :minute-of-hour (hx/->integer (date-format "mm"))
    :hour (hsql/call :date_trunc_hour expr)
    :hour-of-day (hsql/call :extract "hour" expr)
    :day (hsql/call :date_trunc_day expr)
    :day-of-week (hx/->integer (date-format "e"
                                            (hx/+ expr
                                                  (hsql/raw "interval '1' day"))))
    :day-of-month (hsql/call :extract "day" expr)
    :day-of-year (hx/->integer (date-format "D" expr))
    :week (hx/- (hsql/call :date_trunc_week (hx/+ expr
                                                  (hsql/raw "interval '1' day")))
                (hsql/raw "interval '1' day"))
    :week-of-year (hx/->integer (date-format "ww" expr))
    :month (hsql/call :date_trunc_month expr)
    :month-of-year (hx/->integer (date-format "MM" expr))
    :quarter (hsql/call :date_trunc_quarter expr)
    :quarter-of-year (hx/->integer
                      (hsql/call :ceil
                                 (hx// (hsql/call :extract
                                                  "month"
                                                  expr)
                                       3.0)))
    :year (hsql/call :extract "year" expr)))

(defn- humanize-connection-error-message [message]
  (condp re-matches message
    #"^FATAL: database \".*\" does not exist$"
    (driver/connection-error-messages :database-name-incorrect)

    #"^No suitable driver found for.*$"
    (driver/connection-error-messages :invalid-hostname)

    #"^Connection refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections.$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^FATAL: .*$" ; all other FATAL messages: strip off the 'FATAL' part, capitalize, and add a period
    (let [[_ message] (re-matches #"^FATAL: (.*$)" message)]
      (str (s/capitalize message) \.))

    #".*" ; default
    message))

(defn- describe-database [driver database]
  {:tables (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
             (set (for [result (jdbc/query {:connection conn} ["select table_name, table_schema from INFORMATION_SCHEMA.`TABLES` where table_type='TABLE'"])]
                    {:name (:table_name result)
                     :schema (:table_schema result)})))})

(defn- describe-table [driver database table]
  (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
    (log/debug "describe table result:"
               (prn-str {:name (:name table)
                         :schema (:schema table)
                         :fields (set (for [result (jdbc/query {:connection conn}
                                                               [(str "select column_name, data_type from INFORMATION_SCHEMA.COLUMNS where table_name='" (:name table) "'")])]
                                        {:name (:column_name result)
                                         :base-type (column->base-type (keyword (:data_type result)))}))}))
    {:name (:name table)
     :schema (:schema table)
     :fields (set (for [result (jdbc/query {:connection conn}
                                           [(str "select column_name, data_type from INFORMATION_SCHEMA.COLUMNS where table_name='" (:name table) "'")])]
                    {:name (:column_name result)
                     :base-type (column->base-type (keyword (:data_type result)))}))}))

(defn execute-query
  "Process and run a native (raw SQL) QUERY."
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [query (-> (assoc query :remark (qputil/query->remark outer-query))
                  (assoc :query (if (seq (:params query))
                                  (unprepare/unprepare (cons (:query query) (:params query)))
                                  (:query query)))
                  (dissoc :params))]
    (hive/do-with-try-catch
     (fn []
       (let [db-connection (sql/db->jdbc-connection-spec database)]
         (hive/run-query-without-timezone driver settings db-connection query))))))

;; This provides an implementation of `prepare-value` that prevents HoneySQL from converting forms to prepared statement parameters (`?`)
;; TODO - Move this into `metabase.driver.generic-sql` and document it as an alternate implementation for `prepare-value` (?)
;;        Or perhaps investigate a lower-level way to disable the functionality in HoneySQL, perhaps by swapping out a function somewhere
(defprotocol ^:private IPrepareValue
  (^:private prepare-value [this]))
(extend-protocol IPrepareValue
  nil (prepare-value [_] nil)
  DateTimeValue (prepare-value [{:keys [value]}] (prepare-value value))
  Value (prepare-value [{:keys [value]}] (prepare-value value))
  String (prepare-value [this] (hx/literal this))
  Boolean (prepare-value [this] (hsql/raw (if this "TRUE" "FALSE")))
  Date (prepare-value [this] (hsql/call :to_timestamp
                                        (hx/literal (u/date->iso-8601 this))
                                        (hx/literal "YYYY-MM-dd''T''HH:mm:ss.SSSZ")))
  Number (prepare-value [this] this)
  Object (prepare-value [this] (throw (Exception. (format "Don't know how to prepare value %s %s" (class this) this)))))

(defrecord DrillDriver []
  clojure.lang.Named
  (getName [_] "Drill"))

(u/strict-extend DrillDriver
                 driver/IDriver
                 (merge (sql/IDriverSQLDefaultsMixin)
                        {:can-connect? (u/drop-first-arg can-connect?)
                         :date-interval (u/drop-first-arg hive/date-interval)
                         :describe-database describe-database
                         :describe-table describe-table
                         :describe-table-fks hive/describe-table-fks
                         :details-fields (constantly [{:name "cluster"
                                                       :display-name "Cluster ID"
                                                       :default "drillcluster"}
                                                      {:name "zookeeper"
                                                       :display-name "ZooKeeper connect string"
                                                       :default "127.0.0.1:2181/drill"}])
                         :execute-query execute-query
                         :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)})
                 sql/ISQLDriver
                 (merge (sql/ISQLDriverDefaultsMixin)
                        {:column->base-type (u/drop-first-arg hive/column->base-type)
                         :connection-details->spec (u/drop-first-arg connection-details->spec)
                         :date (u/drop-first-arg date)
                         :prepare-value (u/drop-first-arg prepare-value)
                         :quote-style (constantly :mysql)
                         :current-datetime-fn (u/drop-first-arg (constantly hive/now))
                         :string-length-fn (u/drop-first-arg hive/string-length-fn)
                         :unix-timestamp->timestamp (u/drop-first-arg hive/unix-timestamp->timestamp)}))

(driver/register-driver! :drill (DrillDriver.))

(defn drill
  "Create a database specification for a Drill cluster. Opts should include
  keys for :cluster and :zookeeper."
  [{:keys [cluster zookeeper]
    :or {cluster "drillcluster", zookeeper "127.0.0.1:2181/drill"}
    :as opts}]
  (merge {:classname "org.apache.drill.jdbc.Driver" ; must be in classpath
          :subprotocol "drill"
          :subname (str "zk=" zookeeper "/" cluster)}
         (dissoc opts :cluster :zookeeper)))
