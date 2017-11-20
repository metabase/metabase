(ns metabase.driver.teradata
  (:require [metabase.driver :as driver]
    [clojure.java.jdbc :as jdbc]
    [clojure [set :refer [rename-keys], :as set]
     [string :as s]]
    [honeysql [core :as hsql]
     [format :as hformat]
     [helpers :as h]
     types]
    [metabase.models [field :as field]]
    [clojure.tools.logging :as log]
    [honeysql.core :as hsql]
    [metabase.driver.generic-sql :as sql]
    [metabase.query-processor
     [annotate :as annotate]
     [interface :as i]
     [util :as qputil]]
    [metabase.util :as u]
    [metabase.util
     [honeysql-extensions :as hx]
     [ssh :as ssh]])
  (:import [java.sql DatabaseMetaData ResultSet SQLException]
    [java.util Calendar TimeZone]
    [java.util.concurrent TimeUnit]))

(defrecord TeradataDriver []
  clojure.lang.Named
  (getName [_] "Teradata"))

(def ^:private ^:const column->base-type
  "Map of Teradata column types -> Field base types.
   Add more mappings here as you come across them."
  {:BIGINT        :type/BigInteger
   :BIGSERIAL     :type/BigInteger
   :BIT           :type/*
   :BLOB          :type/*
   :BOX           :type/*
   :CHAR          :type/Text
   :CLOB          :type/Text
   :BYTE          :type/*
   :BYTEINT       :type/Integer
   :DATE          :type/Date
   :DECIMAL       :type/Decimal
   :FLOAT         :type/Float
   :FLOAT4        :type/Float
   :FLOAT8        :type/Float
   :INTEGER       :type/Integer
   :INT           :type/Integer
   :INT2          :type/Integer
   :INT4          :type/Integer
   :INT8          :type/BigInteger
   :INTERVAL      :type/* ; time span
   :JSON          :type/Text
   :LONGVARCHAR   :type/Text ; Teradata extension
   :LSEG          :type/*
   :MACADDR       :type/Text
   :MONEY         :type/Decimal
   :NUMERIC       :type/Decimal
   :PATH          :type/*
   :POINT         :type/*
   :REAL          :type/Float
   :SERIAL        :type/Integer
   :SERIAL2       :type/Integer
   :SERIAL4       :type/Integer
   :SERIAL8       :type/BigInteger
   :SMALLINT      :type/Integer
   :SMALLSERIAL   :type/Integer
   :TIME          :type/Time
   :TIMETZ        :type/Time
   :TIMESTAMP     :type/DateTime
   :TIMESTAMPTZ   :type/DateTime
   (keyword "TIMESTAMP WITH TIME ZONE") :type/DateTime
   :TSQUERY       :type/*
   :TSVECTOR      :type/*
   :TXID_SNAPSHOT :type/*
   :UUID          :type/UUID
   :VARBIT        :type/*
   :VARBYTE       :type/* ; byte array
   :VARCHAR       :type/Text
   :XML           :type/Text
   (keyword "bit varying")                :type/*
   (keyword "character varying")          :type/Text
   (keyword "double precision")           :type/Float
   (keyword "time with time zone")        :type/Time
   (keyword "time without time zone")     :type/Time
   (keyword "timestamp with timezone")    :type/DateTime
   (keyword "timestamp without timezone") :type/DateTime})

(defn- dbnames-set
  "Transform the string of databases to a set of strings."
  [dbnames]
  (when dbnames
    (set (map #(s/trim %) (s/split (s/trim dbnames) #",")))))

(defn- teradata-spec
  "Create a database specification for a teradata database. Opts should include keys
  for :db, :user, and :password. You can also optionally set host and port.
  Delimiters are automatically set to \"`\"."
  [{:keys [host port dbnames charset tmode encrypt-data]
    :or {host "localhost", charset "UTF8", tmode "ANSI", encrypt-data true}
    :as opts}]
  (merge {:classname   "com.teradata.jdbc.TeraDriver" ; must be in classpath
          :subprotocol "teradata"
          :subname     (str "//" host "/"
                         (->> (merge
                                (when dbnames
                                  {"DATABASE" (first (dbnames-set dbnames))})
                                (when port
                                  {"DBS_PORT" port})
                                {"CHARSET"             charset
                                 "TMODE"               tmode
                                 "ENCRYPTDATA"         (if encrypt-data "ON" "OFF")
                                 "FINALIZE_AUTO_CLOSE" "ON"
                                 ;; We don't need lob support in metabase. This also removes the limitation of 16 open statements per session which would interfere metadata crawling.
                                 "LOB_SUPPORT"         "OFF"
                                 })
                           (map #(format "%s=%s" (first %) (second %)))
                           (clojure.string/join ",")))
          :delimiters  "`"}
    (dissoc opts :host :port :dbnames :tmode :charset)))


(defn- connection-details->spec [{ssl? :ssl, :as details-map}]
  (-> details-map
    teradata-spec
    (sql/handle-additional-options details-map, :seperator-style :comma)))

;; trunc always returns a date in Teradata
(defn- date-trunc [unit expr] (hsql/call :trunc expr (hx/literal unit)))

(defn- timestamp-trunc [unit expr] (hsql/call :to_timestamp
                                     (hsql/call :to_char 
                                     expr
                                     unit) unit))

(defn- extract    [unit expr] (hsql/call :extract unit expr))

(def ^:private extract-integer (comp hx/->integer extract))

(def ^:private ^:const one-day (hsql/raw "INTERVAL '1' DAY"))

(def ^:private ^:const now (hsql/raw "CURRENT_TIMESTAMP"))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :to_timestamp expr)
    :milliseconds (recur (hx// expr 1000) :seconds)))

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (timestamp-trunc "yyyy-mm-dd hh24:mi" expr)
    :minute-of-hour  (extract-integer :minute expr)
    :hour            (timestamp-trunc "yyyy-mm-dd hh24" expr)
    :hour-of-day     (extract-integer :hour expr)
    :day             (hx/->date expr)
    :day-of-week     (hx/inc (hx/- (date :day expr)
                                   (date :week expr)))
    :day-of-month    (extract-integer :day expr)
    :day-of-year     (hx/inc (hx/- (date :day expr) (date-trunc :year expr)))
    :week            (date-trunc :day expr) ; Same behaviour as with Oracle.
    :week-of-year    (hx/inc (hx// (hx/- (date-trunc :iw expr)
                                         (date-trunc :iy expr))
                                   7))
    :month           (date-trunc :mm expr)
    :month-of-year   (extract-integer :month expr)
    :quarter         (date-trunc :q expr)
    :quarter-of-year (hx// (hx/+ (date :month-of-year (date :quarter expr)) 2) 3)
    :year            (extract-integer :year expr)))

(defn- apply-limit [honeysql-form {value :limit}]
  (assoc honeysql-form :modifiers [(format "TOP %d" value)]))

(defn- apply-page [honeysql-form {{:keys [items page]} :page}]
  (assoc honeysql-form :offset (hsql/raw (format "QUALIFY ROW_NUMBER() OVER (%s) BETWEEN %d AND %d"
                                           (first (hsql/format (select-keys honeysql-form [:order-by])
                                                    :allow-dashed-names? true
                                                    :quoting :ansi))
                                           (inc (* items (dec page)))
                                           (* items page)))))

(def excluded-schemas
  #{"SystemFe" "SYSLIB" "LockLogShredder" "Sys_Calendar" "SYSBAR" "SYSUIF"
    "dbcmngr" "tdwm" "TDStats" "TDQCD" "SQLJ" "SysAdmin" "SYSSPATIAL" "DBC" "Crashdumps" "External_AP" "TDPUSER"})

(defn- string-length-fn [field-key]
  (hsql/call :char_length (hx/cast "VARCHAR(2048)" field-key)))

;; Teradata uses ByteInt with values `1`/`0` for boolean `TRUE`/`FALSE`.
(defn- prepare-value [{value :value}]
  (cond
    (true? value)  1
    (false? value) 0
    :else          value))

(defn- get-tables
  "Fetch a JDBC Metadata ResultSet of tables in the DB, optionally limited to ones belonging to a given schema."
  ^ResultSet [^DatabaseMetaData metadata, ^String schema-or-nil]
  (jdbc/result-set-seq (.getTables metadata nil schema-or-nil "%" ; tablePattern "%" = match all tables
                         (into-array String ["TABLE", "VIEW", "FOREIGN TABLE"]))))

(defn- fast-active-tables
  "Teradata, fast implementation of `fast-active-tables` to support inclusion list."
  [driver, ^DatabaseMetaData metadata, {{:keys [dbnames]} :details, :as database}]
  (let [all-schemas (set (map :table_schem (jdbc/result-set-seq (.getSchemas metadata))))
        dbs (dbnames-set dbnames)
        schemas     (if (empty? dbs)
                      (set/difference all-schemas excluded-schemas) ; use default exclusion list
                      (set/intersection all-schemas dbs))] ; use defined inclusion list
    (set (for [schema schemas
               table-name (mapv :table_name (get-tables metadata schema))]
           {:name   table-name
            :schema schema}))))

(defn- describe-database
  "Overridden to have access to the database with the configured property dbnames (inclusion list)
   which will be used to filter the schemas."
  [driver database]
  (sql/with-metadata [metadata driver database]
    {:tables (fast-active-tables, driver, ^DatabaseMetaData metadata, database)}))

(defn- run-query
  "Run the query itself without setting the timezone connection parameter as this must not be changed on a Teradata connection.
   Setting connection attributes like timezone would make subsequent queries behave unexpectedly."
  [{sql :query, params :params, remark :remark} timezone connection]
  (let [sql              (s/replace (str "-- " remark "\n" (hx/unescape-dots sql)) "OFFSET" "")
        statement        (into [sql] params)
        [columns & rows] (jdbc/query connection statement {:identifiers    identity, :as-arrays? true
                                                           :read-columns   (#'metabase.driver.generic-sql.query-processor/read-columns-with-date-handling timezone)})]
    {:rows    (or rows [])
     :columns columns}))

(defn- run-query-without-timezone [driver settings connection query]
  (#'metabase.driver.generic-sql.query-processor/do-in-transaction connection (partial run-query query nil)))

(defn- execute-query
"Process and run a native (raw SQL) QUERY."
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [query (assoc query :remark (qputil/query->remark outer-query))]
    (#'metabase.driver.generic-sql.query-processor/do-with-try-catch
      (fn []
        (let [db-connection (sql/db->jdbc-connection-spec database)]
          (run-query-without-timezone driver settings db-connection query))))))

(def TeradataISQLDriverMixin
  "Implementations of `ISQLDriver` methods for `TeradataDriver`."
  (merge (sql/ISQLDriverDefaultsMixin)
    {:column->base-type        (u/drop-first-arg column->base-type)
     :connection-details->spec  (u/drop-first-arg connection-details->spec)
     :date                      (u/drop-first-arg date)
     :current-datetime-fn       (constantly now)
     :prepare-value             (u/drop-first-arg prepare-value)
     :string-length-fn          (u/drop-first-arg string-length-fn)
     :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)
     :apply-limit               (u/drop-first-arg apply-limit)
     :apply-page                (u/drop-first-arg apply-page)
     :stddev-fn                 (constantly :STDDEV_SAMP)
     :field->identifier         (u/drop-first-arg (comp (partial apply hsql/qualify) field/qualified-name-components))
     :set-timezone-sql          (constantly nil)}))

(u/strict-extend TeradataDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
    {:describe-database         describe-database
     :details-fields  (constantly (ssh/with-tunnel-config
                                    [{:name         "host"
                                      :display-name "Host"
                                      :default      "localhost"}
                                     {:name         "port"
                                      :display-name "Port"
                                      :placeholder  "1025 will be used by default"}
                                     {:name         "user"
                                      :display-name "Database username"
                                      :placeholder  "What username do you use to login to the database?"
                                      :required     true}
                                     {:name         "password"
                                      :display-name "Database password"
                                      :type         :password
                                      :placeholder  "*******"}
                                     {:name         "dbnames"
                                      :display-name "Database name(s) (case sensitive)"
                                      :placeholder  "Comma-separated list of database names"} ; a default exclusion list is used if left emtpy
                                     {:name         "encrypt-data"
                                      :display-name "Encrypt data"
                                      :type         :boolean
                                      :default      true}
                                     {:name         "charset"
                                      :display-name "Character set"
                                      :default      "UTF8"}
                                     {:name         "tmode"
                                      :display-name "Transaction mode"
                                      :default      "ANSI"}
                                     {:name         "additional-options"
                                      :display-name "Additional JDBC connection string options"
                                      :placeholder  "e.g. COPLAST=OFF"}]))
     :execute-query            execute-query
     })
  sql/ISQLDriver TeradataISQLDriverMixin)

(defn -init-driver
  "Register the teradata driver when the required jar is found on the classpath"
  []
  ;; Register the teradata driver when the required jar is found on the classpath
  (when (u/ignore-exceptions
          (Class/forName "com.teradata.jdbc.TeraDriver"))
    (driver/register-driver! :teradata (TeradataDriver.))))
