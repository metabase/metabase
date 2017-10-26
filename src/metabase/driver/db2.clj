(ns metabase.driver.db2
  "Driver for DB2 databases. Uses the official IBM DB2 JDBC driver(use LIMIT OFFSET support DB2 v9.7 https://www.ibm.com/developerworks/community/blogs/SQLTips4DB2LUW/entry/limit_offset?lang=en)"
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]])
  (:import [clojure.lang Keyword PersistentVector]
           com.mchange.v2.c3p0.ComboPooledDataSource
           [java.sql DatabaseMetaData ResultSet]
           java.util.Map
           metabase.models.field.FieldInstance
           [metabase.query_processor.interface Field Value]))

(defn- column->base-type
  "Mappings for DB2 types to Metabase types.
   See the list here: https://docs.tibco.com/pub/spc/4.0.0/doc/html/ibmdb2/ibmdb2_data_types.htm"
  [column-type]
  ({:BIGINT                               :type/BigInteger
    :BINARY                               :type/*
    :BLOB                                 :type/*
    :CHAR                                 :type/Text
    :CLOB                                 :type/Text
    :DATALINK                             :type/*
    :DATE                                 :type/Date
    :DBCLOB                               :type/Text
    :DECIMAL                              :type/Decimal
    :DOUBLE                               :type/Float
    :FLOAT                                :type/Float
    :GRAPHIC                              :type/Text
    :INTEGER                              :type/Integer
    :NUMERIC                              :type/Decimal
    :REAL                                 :type/Float
    :ROWID                                :type/*
    :SMALLINT                             :type/Integer
    :TIME                                 :type/Time
    :TIMESTAMP                            :type/DateTime
    :VARCHAR                              :type/Text
    :VARGRAPHIC                           :type/Text

    (keyword "CHAR() FOR BIT DATA")       :type/*
    (keyword "LONG VARCHAR")              :type/*
    (keyword "LONG VARCHAR FOR BIT DATA") :type/*
    (keyword "LONG VARGRAPHIC")           :type/*
    (keyword "VARCHAR() FOR BIT DATA")    :type/*} column-type))

(defn- connection-details->spec
  [{:keys [host port db]
    :or   {host "localhost", port 3386, db "SCHEMA"}
    :as   details}]
  (merge {:classname "com.ibm.as400.access.AS400JDBCDriver" ; must be in classpath
          :subprotocol "as400"
          :subname (str "//" host ":" port "/" db)}
         (dissoc details :host :port :db)))

(defn- can-connect? [details]
  (let [connection (connection-details->spec (ssh/include-ssh-tunnel details))]
    (= 1 (first (vals (first (jdbc/query connection ["SELECT 1 FROM SYSIBM.SYSDUMMY1"])))))))

;(defn- describe-database
;  "Custom implementation of `describe-database` for AS400 DB2."
;  [driver database]
;  (log/info "LOADING AS400 DB2 describe-database")
;  (let [connection (connection-details->spec (ssh/include-ssh-tunnel database))]
;    :tables (try (set (jdbc/query connection ["SELECT TABLE_SCHEMA AS \"schema\", TABLE_NAME AS \"name\" FROM QSYS2.SYSTABLES WHERE TABLE_TYPE='T' AND TABLE_SCHEMA = 'ORGACCTEST' ORDER BY TABLE_NAME ASC"]))
;            (catch Throwable e (log/error "Failed to fetch materialized views for this database:" (.getMessage e))))))
;
;(defn fast-active-tables
;  "Default, fast implementation of `ISQLDriver/active-tables` best suited for DBs with lots of system tables (like Oracle).
;   Fetch list of schemas, then for each one not in `excluded-schemas`, fetch its Tables, and combine the results.
;
;   This is as much as 15x faster for Databases with lots of system tables than `post-filtered-active-tables` (4 seconds vs 60)."
;  [driver, ^DatabaseMetaData metadata]
;  (let [all-schemas (set (map :table_schem (jdbc/result-set-seq (.getSchemas metadata))))
;        schemas     (set/difference all-schemas (excluded-schemas driver))]
;    (set (for [schema     schemas
;               table-name (mapv :table_name (get-tables metadata schema))]
;           {:name   table-name
;            :schema schema}))))

(defn- date-format [format-str expr] (hsql/call :varchar_format expr (hx/literal format-str)))
(defn- str-to-date [format-str expr] (hsql/call :to_date expr (hx/literal format-str)))

(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defn- date
  "Wrap a HoneySQL datetime EXPRession in appropriate forms to cast/bucket it as UNIT.
  See [this page](https://www.ibm.com/developerworks/data/library/techarticle/0211yip/0211yip3.html) for details on the functions we're using."
  [unit expr]
  (case unit
    :default expr
    :minute (trunc-with-format "YYYY-MM-DD HH24:MI" expr)
    :minute-of-hour (hsql/call :minute expr)
    :hour (trunc-with-format "YYYY-MM-DD HH24" expr)
    :hour-of-day (hsql/call :hour expr)
    :day (hsql/call :date expr)
    :day-of-week (hsql/call :dayofweek expr)
    :day-of-month (hsql/call :day expr)
    :day-of-year (hsql/call :dayofyear expr)
    :week (hx/- expr (hsql/raw (format "%d days" (int (hx/- (hsql/call :dayofweek expr) 1)))))
    :week-of-year (hsql/call :week expr)
    :month (str-to-date "YYYY-MM-DD" (hx/concat (date-format "YYYY-MM" expr) (hx/literal "-01")))
    :month-of-year (hsql/call :month expr)
    :quarter (str-to-date "YYYY-MM-DD" (hsql/raw (format "%d-%d-01" (int (hx/year expr)) (int ((hx/- (hx/* (hx/quarter expr) 3) 2))))))
    :quarter-of-year (hsql/call :quarter expr)
    :year (hsql/call :year expr)))

(defn- date-interval
  [unit amount]
  (case unit
    :second (hsql/raw (format "current timestamp + %d seconds" (int amount)))
    :minute (hsql/raw (format "current timestamp + %d minutes" (int amount)))
    :hour (hsql/raw (format "current timestamp + %d hours" (int amount)))
    :day (hsql/raw (format "current timestamp + %d days" (int amount)))
    :week (hsql/raw (format "current timestamp + %d days" (int (hx/* amount (hsql/raw 7)))))
    :month (hsql/raw (format "current timestamp + %d months" (int amount)))
    :quarter (hsql/raw (format "current timestamp + %d months" (int (hx/* amount (hsql/raw 3)))))
    :year (hsql/raw (format "current timestamp + %d years" (int amount)))))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds (hx/+ (hsql/raw "timestamp('1970-01-01 00:00:00')") (hsql/raw (format "%d seconds" (int expr))))
    :milliseconds (hx/+ (hsql/raw "timestamp('1970-01-01 00:00:00')") (hsql/raw (format "%d seconds" (int (hx// expr 1000)))))))


(defn- string-length-fn [field-key]
  (hsql/call :length field-key))

(def ^:private db2-date-formatter (driver/create-db-time-formatter "yyyy-MM-dd HH:mm:ss.SSS zzz"))
(def ^:private db2-db-time-query "SELECT CURRENT TIMESTAMP FROM SYSIBM.SYSDUMMY1;")
(def ^:private ^:const now (hsql/raw "current timestamp"))


;; DB2 doesn't support `LIMIT n` syntax. Instead we have to use `WHERE ROWNUM <= n`.
;; This has to wrap the actual query, e.g.
;;
;; SELECT *
;; FROM
;; (
;;   SELECT p.*, ROW_NUMBER() OVER () AS ROWNUM
;;   FROM LOGIN p
;; ) temp
;; WHERE temp.ROWNUM BETWEEN 20 AND 25;
;;
;; This wrapping can cause problems if there is an ambiguous column reference in the nested query (i.e. two columns with the same alias name).
;; To ensure that doesn't happen, those column references need to be disambiguated first
;;
;; To do an offset we have to do something like:
;;
;; SELECT *
;; FROM
;; (
;;     SELECT __table__.*, ROW_NUMBER () OVER () AS __rownum__
;;     FROM LOGIN
;; ) __table__
;; WHERE __table__.__rownum__ <= 150 AND __table__.__rownum__ >= 100;

(defn- apply-limit [honeysql-form {value :limit}]
  {:pre [(integer? value)]}
  {:select [:*]
   :from [[{
            :select [:tmp.* [(hsql/raw "ROW_NUMBER() OVER()") :rn]]
            :from   [[(merge {:select [:*]} honeysql-form) :tmp]]} :x]]
   :where  [:<= :x.rn value]})

(defn- apply-page [honeysql-form {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can use use the single-nesting implementation for `apply-limit`
      (apply-limit honeysql-form {:limit items})
      ;; if we need to do an offset we have to do double-nesting
      {:select [:*]
       :from   [[{:select [:tmp.* [(hsql/raw "ROW_NUMBER() OVER()") :rn]]
                 :from   [[(merge {:select [:*]} honeysql-form) :tmp]]}]]
       :where  [(hsql/raw (format "rn BETWEEN %d AND %d" offset (+ offset items)))]})))


(defrecord DB2Driver []
  clojure.lang.Named
  (getName [_] "DB2"))

(u/strict-extend DB2Driver
                 driver/IDriver
                 (merge (sql/IDriverSQLDefaultsMixin)
                        {:can-connect?      (u/drop-first-arg can-connect?)
                         :date-interval     (u/drop-first-arg date-interval)
                         ;:describe-database (u/drop-first-arg describe-database)
                         :details-fields    (constantly (ssh/with-tunnel-config
                                                        [{:name         "host"
                                                          :display-name "Host"
                                                          :default      "localhost"}
                                                         {:name         "port"
                                                          :display-name "Port"
                                                          :default      3386}
                                                         {:name         "db"
                                                          :display-name "Database name"
                                                          :placeholder  "SCHEMA NAME"
                                                          :required     true}
                                                         {:name         "user"
                                                          :display-name "Database username"
                                                          :placeholder  "What username do you use to login to the database?"
                                                          :required     true}
                                                         {:name         "password"
                                                          :display-name "Database password"
                                                          :type         :password
                                                          :placeholder  "*******"}]))
                         :current-db-time (driver/make-current-db-time-fn db2-date-formatter db2-db-time-query)})

                 sql/ISQLDriver
                 (merge (sql/ISQLDriverDefaultsMixin)
                        {:apply-limit               (u/drop-first-arg apply-limit)
                         :apply-page                (u/drop-first-arg apply-page)
                         :column->base-type         (u/drop-first-arg column->base-type)
                         :connection-details->spec  (u/drop-first-arg connection-details->spec)
                         :current-datetime-fn       (constantly now)
                         :date                      (u/drop-first-arg date)
                         :excluded-schemas          (constantly #{"SQLJ" "SYSCAT" "SYSFUN" "SYSIBMADM" "SYSIBMINTERNAL" "SYSIBMTS" "SYSPROC" "SYSPUBLIC" "SYSSTAT" "SYSTOOLS"})
                         :set-timezone-sql          (constantly "SET SESSION TIME ZONE = '%s'")
                         :string-length-fn          (u/drop-first-arg string-length-fn)
                         :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the DB2 driver when the JAR is found on the classpath"
  []
  ;; only register the DB2 driver if the JDBC driver is available
  (when (u/ignore-exceptions
          (Class/forName "com.ibm.as400.access.AS400JDBCDriver"))
    (driver/register-driver! :db2 (DB2Driver.))))
