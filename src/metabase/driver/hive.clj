(ns metabase.driver.hive
  (:require
   [clojure.java.jdbc :as jdbc]
   (clojure [set :as set]
            [string :as s])
   [clojure.tools.logging :as log]
   (honeysql [core :as hsql]
             [helpers :as h])
   [metabase.db.spec :as dbspec]
   [metabase.driver :as driver]
   [metabase.driver.generic-sql :as sql]
   [metabase.driver.generic-sql.util.unprepare :as unprepare]
   [metabase.util :as u]
   [metabase.util.honeysql-extensions :as hx]
   [metabase.query-processor.util :as qputil])
  (:import
   (java.util Date)))

(def ^:const column->base-type
  "Map of Spark SQL (Hive) column types -> Field base types.
   Add more mappings here as you come across them."
  {;; Numeric types
   :tinyint :type/Integer
   :smallint :type/Integer
   :int :type/Integer
   :integer :type/Integer
   :bigint :type/BigInteger
   :float :type/Float
   :double :type/Float
   (keyword "double precision") :type/Float
   :decimal :type/Decimal
   ;; Date/Time types
   :timestamp :type/DateTime
   :date :type/Date
   :interval :type/*
   :string :type/Text
   :varchar :type/Text
   :char :type/Text
   :boolean :type/Boolean
   :binary :type/*})

(def ^:const now (hsql/raw "NOW()"))

(defn unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (hx/->timestamp
   (hsql/call :from_unixtime (case seconds-or-milliseconds
                               :seconds      expr
                               :milliseconds (hx// expr 1000)))))

(defn- date-format [format-str expr]
  (hsql/call :date_format expr (hx/literal format-str)))

(defn- str-to-date [format-str expr]
  (hx/->timestamp
   (hsql/call :from_unixtime
              (hsql/call :unix_timestamp
                         expr (hx/literal format-str)))))

(defn trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defn date [unit expr]
  (case unit
    :default expr
    :minute (trunc-with-format "yyyy-MM-dd HH:mm" expr)
    :minute-of-hour (hsql/call :minute expr)
    :hour (trunc-with-format "yyyy-MM-dd HH" expr)
    :hour-of-day (hsql/call :hour expr)
    :day (trunc-with-format "yyyy-MM-dd" expr)
    :day-of-week (hx/->integer (date-format "u"
                                            (hx/+ expr
                                                  (hsql/raw "interval '1' day"))))
    :day-of-month (hsql/call :dayofmonth expr)
    :day-of-year (hx/->integer (date-format "D" expr))
    :week (hsql/call :date_sub
                     (hx/+ expr
                           (hsql/raw "interval 1 day"))
                     (hsql/call :date_format
                                (hx/+ expr
                                      (hsql/raw "interval 1 day"))
                                "u"))
    :week-of-year (hsql/call :weekofyear expr)
    :month (hsql/call :trunc expr (hx/literal :MM))
    :month-of-year (hsql/call :month expr)
    :quarter (hsql/call :add_months
                        (hsql/call :trunc expr (hx/literal :year))
                        (hx/* (hx/- (hsql/call :quarter expr)
                                    1)
                              3))
    :quarter-of-year (hsql/call :quarter expr)
    :year (hsql/call :year expr)))

(defn date-interval [unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d' %s)" (int amount) (name unit))))

(defn string-length-fn [field-key]
  (hsql/call :length field-key))

;; copied from the Presto driver, except using mysql quoting style
(defn apply-page [honeysql-query {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (h/limit honeysql-query items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause (format "row_number() OVER (%s)"
                                (first (hsql/format (select-keys honeysql-query [:order-by])
                                                    :allow-dashed-names? true
                                                    :quoting :mysql)))]
        (-> (apply h/select (map last (:select honeysql-query)))
            (h/from (h/merge-select honeysql-query [(hsql/raw over-clause) :__rownum__]))
            (h/where [:> :__rownum__ offset])
            (h/limit items))))))

;; lots of copy-paste here. consider making some of those non-private instead.
(defn- exception->nice-error-message ^String [^java.sql.SQLException e]
  (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
           (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
           second)             ; so just return the part of the exception that is relevant
      (.getMessage e)))

(defn do-with-try-catch {:style/indent 0} [f]
  (try (f)
       (catch java.sql.SQLException e
         (log/error (jdbc/print-sql-exception-chain e))
         (throw (Exception. (exception->nice-error-message e))))))

(defn- run-query
  "Run the query itself."
  [{sql :query, params :params, remark :remark} connection]
  (let [sql              (str "-- " remark "\n" (hx/unescape-dots sql))
        statement        (into [sql] params)
        [columns & rows] (jdbc/query connection statement {:identifiers identity, :as-arrays? true})]
    {:rows    (or rows [])
     :columns columns}))

(defn run-query-without-timezone [driver settings connection query]
  (run-query query connection))

(defprotocol ^:private IUnprepare
  (^:private unprepare-arg ^String [this]))

(extend-protocol IUnprepare
  nil     (unprepare-arg [this] "NULL")
  String  (unprepare-arg [this] (str \' (s/replace this "'" "\\\\'") \')) ; escape single-quotes
  Boolean (unprepare-arg [this] (if this "TRUE" "FALSE"))
  Number  (unprepare-arg [this] (str this))
  Date    (unprepare-arg [this] (first (hsql/format
                                        (hsql/call :from_unixtime
                                                   (hsql/call :unix_timestamp
                                                              (hx/literal (u/date->iso-8601 this))
                                                              (hx/literal "yyyy-MM-dd\\\\'T\\\\'HH:mm:ss.SSS\\\\'Z\\\\'")))))))

(defn unprepare
  "Convert a normal SQL `[statement & prepared-statement-args]` vector into a flat, non-prepared statement."
  ^String [[sql & args]]
  (loop [sql sql, [arg & more-args, :as args] args]
    (if-not (seq args)
      sql
      (recur (s/replace-first sql #"(?<!\?)\?(?!\?)" (unprepare-arg arg))
             more-args))))

;; we need this because transactions are not supported in Hive 1.2.1
;; bound variables are not support in Spark SQL (maybe not Hive either, haven't checked)
(defn execute-query
  "Process and run a native (raw SQL) QUERY."
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [query (-> (assoc query :remark (qputil/query->remark outer-query))
                  (assoc :query (if (seq (:params query))
                                  (unprepare (cons (:query query) (:params query)))
                                  (:query query)))
                  (dissoc :params))]
    (do-with-try-catch
     (fn []
       (let [db-connection (sql/db->jdbc-connection-spec database)]
         (run-query-without-timezone driver settings db-connection query))))))

(defn describe-database [driver database]
  {:tables (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
             ;; arguably this should be "show tables in " (:name database)
             (set (for [result (jdbc/query {:connection conn} [(str "show tables")])]
                    {:name (:tablename result)
                     :schema nil})))})

(defn describe-table [driver database table]
  (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
    {:name (:name table)
     :schema nil
     :fields (set (for [result (jdbc/query {:connection conn}
                                           [(str "describe `" (:name table) "`")])]
                    {:name (:col_name result)
                     :base-type (column->base-type (keyword (:data_type result)))}))}))

(defn describe-table-fks [driver database table]
  #{})

(defn features
  "Default implementation of `IDriver` `features` for SQL drivers."
  [driver]
  #{:basic-aggregations
    :standard-deviation-aggregations
    :expressions
    :expression-aggregations
    :native-parameters
    })
