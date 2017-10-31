(ns metabase.driver.drill
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [set :as set]
                     [string :as s])
            (honeysql [core :as hsql]
                      [format :as hformat]
                      [helpers :as h])
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver.bigquery :as bigquery]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as qp]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.driver.hive-like :as hive-like]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx])
  (:import
   (java.util Collections Date)
   (metabase.query_processor.interface DateTimeValue Value)))

(def ^:const column->base-type
  "Map of Drill column types -> Field base types.
   Add more mappings here as you come across them."
  {;; Numeric types
   :BIGINT :type/BigInteger
   :BINARY :type/*
   :BOOLEAN :type/Boolean
   :DATE :type/Date
   :DECIMAL :type/Decimal
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

(defn drill
  "Create a database specification for a Drill cluster. Opts should include
  :drill-connect."
  [{:keys [drill-connect]
    :or {drill-connect "drillbit=localhost"}
    :as opts}]
  (merge {:classname "org.apache.drill.jdbc.Driver" ; must be in classpath
          :subprotocol "drill"
          :subname drill-connect}
         (dissoc opts :drill-connect)))

(defn- connection-details->spec [details]
  (-> details
      drill
      (sql/handle-additional-options details)))

(defn- can-connect? [details]
  (let [connection (connection-details->spec details)]
    (= 1 (first (vals (first (jdbc/query connection ["SELECT 1 FROM (VALUES(1)) LIMIT 1"])))))))

(defn- date-format [format-str expr]
  (hsql/call :to_char expr (hx/literal format-str)))

(defn- date [unit expr]
  (case unit
    :default (hx/->timestamp expr)
    :minute (hsql/call :date_trunc_minute (hx/->timestamp expr))
    :minute-of-hour (hx/->integer (date-format "mm" expr))
    :hour (hsql/call :date_trunc_hour (hx/->timestamp expr))
    :hour-of-day (hsql/call :extract "hour" (hx/->timestamp expr))
    :day (hsql/call :date_trunc_day (hx/->timestamp expr))
    :day-of-week (hx/->integer (date-format "e"
                                            (hx/+ (hx/->timestamp expr)
                                                  (hsql/raw "interval '1' day"))))
    :day-of-month (hsql/call :extract "day" (hx/->timestamp expr))
    :day-of-year (hx/->integer (date-format "D" (hx/->timestamp expr)))
    :week (hx/- (hsql/call :date_trunc_week (hx/+ (hx/->timestamp expr)
                                                  (hsql/raw "interval '1' day")))
                (hsql/raw "interval '1' day"))
    :week-of-year (hx/->integer (date-format "ww" (hx/->timestamp expr)))
    :month (hsql/call :date_trunc_month (hx/->timestamp expr))
    :month-of-year (hx/->integer (date-format "MM" (hx/->timestamp expr)))
    :quarter (hx/+ (hsql/call :date_trunc_year (hx/->timestamp expr))
                   (hx/* (hx// (hx/- (hsql/call :extract "month" (hx/->timestamp expr))
                                     1)
                               3)
                         (hsql/raw "INTERVAL '3' MONTH")))
    ;; quarter gives incorrect results in Drill 1.10
    ;;:quarter (hsql/call :date_trunc_quarter (hx/->timestamp expr))
    :quarter-of-year (hx/->integer
                      (hsql/call :ceil
                                 (hx// (hsql/call :extract
                                                  "month"
                                                  (hx/->timestamp expr))
                                       3.0)))
    :year (hsql/call :extract "year" (hx/->timestamp expr))))

(defmethod hformat/fn-handler "drill-from-unixtime" [_ datetime-literal]
  (hformat/to-sql
   (hsql/call :to_timestamp
              ;;(hx/literal (u/date->iso-8601 datetime-literal))
              datetime-literal
              (hx/literal "YYYY-MM-dd''T''HH:mm:ss.SSSZ"))))

(defn drill-unprepare
  "Translates `sql-and-args` to the Drill SQL dialect"
  [sql-and-args]
  (unprepare/unprepare sql-and-args :iso-8601-fn :drill-from-unixtime))

(defn- execute-query
  "Process and run a native (raw SQL) QUERY."
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [query (-> (assoc query :remark (qputil/query->remark outer-query))
                  (assoc :query (if (seq (:params query))
                                  (drill-unprepare (cons (:query query) (:params query)))
                                  (:query query)))
                  (dissoc :params))]
    (qp/do-with-try-catch
     (fn []
       (let [db-connection (sql/db->jdbc-connection-spec database)]
         (hive-like/run-query-without-timezone driver settings db-connection query))))))

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

(defn- date-interval [unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d' %s(%d))" (int amount) (name unit)
                    (count (str amount)))))

(defrecord DrillDriver []
  clojure.lang.Named
  (getName [_] "Drill"))

(u/strict-extend DrillDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:can-connect? (u/drop-first-arg can-connect?)
          :date-interval (u/drop-first-arg date-interval)
          :describe-table-fks (constantly #{})
          :details-fields (constantly [{:name "drill-connect"
                                        :display-name "Drill connect string"
                                        :default "drillbit=localhost or zk=localhost:2181/drill/cluster-id"}])
          :execute-query execute-query
          :features (constantly #{:basic-aggregations
                                  ;;:foreign-keys
                                  :expressions
                                  :expression-aggregations
                                  :native-parameters
                                  :nested-queries
                                  :standard-deviation-aggregations})})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-aggregation qp/apply-aggregation-deduplicate-select-aliases
          :column->base-type (u/drop-first-arg column->base-type)
          :connection-details->spec (u/drop-first-arg connection-details->spec)
          :date (u/drop-first-arg date)
          :field->identifier (u/drop-first-arg hive-like/field->identifier)
          :prepare-value (u/drop-first-arg prepare-value)
          :quote-style (constantly :mysql)
          :current-datetime-fn (u/drop-first-arg (constantly hive-like/now))
          :string-length-fn (u/drop-first-arg hive-like/string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg hive-like/unix-timestamp->timestamp)}))

(driver/register-driver! :drill (DrillDriver.))
