(ns metabase.driver.teradata
  (:refer-clojure :exclude [select-keys empty? mapv])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time :as t]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common :as driver.common]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.boolean-to-comparison :as sql.qp.boolean-to-comparison]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [select-keys empty? mapv]])
  (:import [java.sql Connection DatabaseMetaData ResultSet Types PreparedStatement]
           [java.time OffsetDateTime OffsetTime]
           [java.util Calendar TimeZone]))

(set! *warn-on-reflection* true)

(driver/register! :teradata, :parent :sql-jdbc)

(doseq [[feature supported?] {:metadata/key-constraints         false
                              :test/jvm-timezone-setting        false
                              :database-routing                 false
                              :connection-impersonation         false
                              :regex/lookaheads-and-lookbehinds false
                              :window-functions/offset          false}]
  (defmethod driver/database-supports? [:teradata feature] [_driver _feature _db] supported?))

(defmethod driver/db-start-of-week :teradata
  [_driver]
  :sunday)

(defmethod sql-jdbc.sync/database-type->base-type :teradata [_ column-type]
  (let [type-mapping
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
         :NUMBER        :type/Decimal ; Add this mapping
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
         (keyword "TIME WITH TIME ZONE")        :type/Time
         :TIMESTAMP     :type/DateTime
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
         (keyword "timestamp without timezone") :type/DateTime}]
    (get type-mapping column-type :type/*))) ; Default to :type/* if no mapping is found

(defn- dbnames-set
  "Transform the string of databases to a set of strings."
  [dbnames]
  (when dbnames
    (set (map #(str/trim %) (str/split (str/trim dbnames) #",")))))

(defn- jdbc-fields-metadata
  "Fetch metadata about the Fields belonging to a Table or View using a SELECT * query."
  [driver ^Connection conn _db-name-or-nil schema table-name]
  (try
    (let [table (sql.u/quote-name driver :table schema table-name)
          sql (format "SELECT * FROM %s WHERE 1=0" table)] ; Query with no rows
      (with-open [stmt (.createStatement conn)
                  rs   (.executeQuery stmt sql)]
        (let [metadata (.getMetaData rs)]
          (mapv (fn [i]
                  (let [column-name (.getColumnName metadata i)
                        database-type (.getColumnTypeName metadata i)
                        column-size (.getColumnDisplaySize metadata i)
                        nullable (.isNullable metadata i)
                        remarks (.getColumnLabel metadata i)]
                    {:name column-name
                     :database-type database-type
                     :column-size column-size
                     :nullable? (= nullable DatabaseMetaData/columnNullable)
                     :remarks remarks}))
                (range 1 (inc (.getColumnCount metadata)))))))
    (catch java.sql.SQLException e
      (let [sqlstate (.getSQLState e)
            error-code (.getErrorCode e)]
        (cond
          ;; 42S02: base object gone
          (= "42S02" sqlstate)
          (do
            (log/warnf "Table or view '%s' in schema '%s' does not exist." table-name schema)
            [])
          ;; 42S22: column(s) referenced by the view no longer exist
          (= "42S22" sqlstate)
          (do
            (log/warnf "Skipping fields sync for '%s' in schema '%s' due to missing column(s). Cause: %s"
                       table-name schema (.getMessage e))
            [])
          ;; 5407: Invalid operation for DateTime or Interval
          (or (= 5407 error-code) (= "HY000" sqlstate))
          (do
            (log/warnf "Skipping fields sync for '%s' in schema '%s' due to DateTime/Interval error. Cause: %s"
                       table-name schema (.getMessage e))
            [])
          :else
          (throw e)))))) ; Re-throw other exceptions

(defn ^:private fields-metadata
  [driver ^Connection conn {schema :schema, table-name :name} ^String db-name-or-nil]
  {:pre [(instance? Connection conn) (string? table-name)]}
  ;; Attempt to fetch metadata using DatabaseMetaData.getColumns
  (let [jdbc-metadata (jdbc-fields-metadata driver conn db-name-or-nil schema table-name)]
    jdbc-metadata))

(defmethod sql-jdbc.describe-table/describe-table-fields :teradata
  [driver conn table db-name-or-nil]
  (into
   #{}
   (sql-jdbc.describe-table/describe-table-fields-xf driver table)
   (fields-metadata driver conn table db-name-or-nil)))

(defn- teradata-spec
  "Create a database specification for a Teradata database."
  [{:keys [host _user _password port dbnames charset tmode encrypt-data ssl _additional-options]
    :or   {host "localhost", charset "UTF8", tmode "ANSI", encrypt-data true, ssl false}
    :as   opts}]
  (merge {:classname   "com.teradata.jdbc.TeraDriver"
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
                                   "LOB_SUPPORT"         "OFF"}
                                  (when ssl
                                    {"SSLMODE" "REQUIRE"}))
                                 (map #(format "%s=%s" (first %) (second %)))
                                 (str/join ",")))}
         (dissoc opts :host :port :dbnames :tmode :charset :ssl :encrypt-data)))

(defmethod sql-jdbc.conn/connection-details->spec :teradata
  [_ details-map]
  (->
   ;; :engine, :let-user-control-scheduling and :advanced-options are part of the details-map but would lead to
   ;; java.sql.SQLException: [Teradata JDBC Driver] [TeraJDBC 17.10.00.27] [Error 1536] [SQLState HY000] Invalid connection parameter name advanced-options
   ;; thus we filtering the map, using only the data we are interested in teradata-spec
   ;; (more keys might be added in the future to `default-advanced-options` => see metabase-plugin.yaml
   ;; thus we switched from using `dissoc` to `select-keys`)
   (select-keys details-map [:host :port :user :password :dbnames :charset :tmode :encrypt-data :ssl :additional-options])
   teradata-spec
   (sql-jdbc.common/handle-additional-options details-map, :seperator-style :comma)))

(defn- trunc [format-template v]
  [:trunc v (h2x/literal format-template)])

(def ^:private ^:const now [:raw "CURRENT_TIMESTAMP"])

(defmethod sql.qp/date [:teradata :default] [_ _ expr] expr)
(defmethod sql.qp/date [:teradata :minute]
  [_ _ expr]
  (h2x/- expr (h2x/* [::h2x/extract :second expr] [:raw "INTERVAL '1' SECOND"])))
(defmethod sql.qp/date [:teradata :minute-of-hour] [_ _ expr] [::h2x/extract :minute expr])
(defmethod sql.qp/date [:teradata :hour]
  [_ _ expr]
  (h2x/- expr (h2x/+ (h2x/* [::h2x/extract :minute expr] [:raw "INTERVAL '1' MINUTE"])
                     (h2x/* [::h2x/extract :second expr] [:raw "INTERVAL '1' SECOND"]))))
(defmethod sql.qp/date [:teradata :hour-of-day] [_ _ expr] [::h2x/extract :hour expr])
(defmethod sql.qp/date [:teradata :day] [_ _ expr] (h2x/->date expr))
(defmethod sql.qp/date [:teradata :day-of-week]
  [driver _ expr]
  (let [day-of-week (h2x/with-database-type-info [:td_day_of_week expr] "integer")]
    (sql.qp/adjust-day-of-week
     driver
     day-of-week
     (driver.common/start-of-week-offset driver)
     (fn mod-fn [& args]
       (into [:mod] args)))))
(defmethod sql.qp/date [:teradata :day-of-month] [_ _ expr] [::h2x/extract :day expr])
(defmethod sql.qp/date [:teradata :day-of-year] [driver _ expr] (h2x/inc (h2x/- (sql.qp/date driver :day expr) (trunc :year expr))))
(defmethod sql.qp/date [:teradata :week]
  [driver _ expr]
  (sql.qp/adjust-start-of-week driver (partial trunc :day) expr))

(defmethod sql.qp/date [:teradata :week-of-year-iso]
  [_ _ expr]
  (h2x/with-database-type-info [:weeknumber_of_year expr (h2x/literal "ISO")] "integer"))

(defmethod sql.qp/date [:teradata :month] [_ _ expr] (trunc :month expr))
(defmethod sql.qp/date [:teradata :month-of-year] [_ _ expr] [::h2x/extract :month expr])
(defmethod sql.qp/date [:teradata :quarter] [_ _ expr] (trunc :q expr))
(defmethod sql.qp/date [:teradata :quarter-of-year] [driver _ expr] (h2x// (h2x/+ (sql.qp/date driver :month-of-year (sql.qp/date driver :quarter expr)) 2) 3))
(defmethod sql.qp/date [:teradata :year] [_ _ expr] (trunc :year expr))

(defn- num-to-interval [unit amount]
  (let [amount (Math/abs (long amount))]
    (case unit
      :second [:numtodsinterval (sql.qp/inline-num amount) (h2x/literal "SECOND")]
      [:raw (format "INTERVAL '%d' %s" amount (name unit))])))

(defn- add-months [hsql-form amount]
  (let [expr (h2x/cast-unless-type-in "date" #{"date" "timestamp" "timestamp with time zone"} hsql-form)]
    (h2x/with-database-type-info [:add_months expr (sql.qp/inline-num amount)]
                                 (h2x/database-type expr))))

(defmethod sql.qp/add-interval-honeysql-form :teradata [_ hsql-form amount unit]
  (case unit
    :month   (add-months hsql-form amount)
    :quarter (add-months hsql-form (* amount 3))
    :year    (add-months hsql-form (* amount 12))
    (let [op (if (>= amount 0) h2x/+ h2x/-)]
      (op (h2x/->timestamp hsql-form)
          (case unit
            :second (num-to-interval :second amount)
            :minute (num-to-interval :minute amount)
            :hour   (num-to-interval :hour amount)
            :day    (num-to-interval :day amount)
            :week   (num-to-interval :day (* amount 7)))))))

(defmethod sql.qp/float-dbtype :teradata
  [_]
  "DOUBLE PRECISION")

;; Teradata truncates on CAST(float AS INTEGER) instead of rounding
(defmethod sql.qp/->integer :teradata
  [driver value]
  (sql.qp/->integer-with-round driver value))

(defmethod sql.qp/->honeysql [:teradata ::sql.qp/cast-to-text]
  [driver [_ expr]]
  (let [hsql-expr (sql.qp/->honeysql driver expr)]
    (if (h2x/is-of-type? hsql-expr "date")
      (h2x/with-database-type-info [:to_char hsql-expr (h2x/literal "YYYY-MM-DD")] "varchar(2048)")
      (h2x/maybe-cast "varchar(2048)" hsql-expr))))

(defmethod sql.qp/->honeysql [:teradata :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

(defmethod sql.qp/->honeysql [:teradata :replace]
  [driver [_ arg pattern replacement]]
  [:oreplace
   (sql.qp/->honeysql driver arg)
   (sql.qp/->honeysql driver pattern)
   (sql.qp/->honeysql driver replacement)])

(defmethod sql.qp/unix-timestamp->honeysql [:teradata :seconds]
  [_ _ expr]
  (h2x/with-database-type-info [:to_timestamp expr] "timestamp"))

(defmethod sql.qp/cast-temporal-string [:teradata :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  (h2x/with-database-type-info [:to_timestamp expr (h2x/literal "YYYYMMDDHH24MISS")] "timestamp"))

(defn- subsecond-unix-timestamp->honeysql
  [driver expr divisor]
  (let [seconds-expr    (h2x/cast :bigint (h2x// expr divisor))
        remainder-expr  (h2x/cast (sql.qp/float-dbtype driver) [:mod expr (sql.qp/inline-num divisor)])
        subseconds-expr (h2x// remainder-expr divisor)]
    (h2x/+ (sql.qp/unix-timestamp->honeysql driver :seconds seconds-expr)
           [:numtodsinterval subseconds-expr (h2x/literal "SECOND")])))

(defmethod sql.qp/unix-timestamp->honeysql [:teradata :milliseconds]
  [driver _ expr]
  (subsecond-unix-timestamp->honeysql driver expr 1000))

(defmethod sql.qp/unix-timestamp->honeysql [:teradata :microseconds]
  [driver _ expr]
  (subsecond-unix-timestamp->honeysql driver expr 1000000))

(defmethod sql.qp/unix-timestamp->honeysql [:teradata :nanoseconds]
  [driver _ expr]
  (subsecond-unix-timestamp->honeysql driver expr 1000000000))

(defn- default-select
  [driver {[from] :from}]
  (let [table-identifier (if (sequential? from)
                           (first (second from))
                           from)
        [raw-identifier] (when table-identifier
                           (sql.qp/format-honeysql driver table-identifier))
        expr             (if (seq raw-identifier)
                           [:raw (format "%s.*" raw-identifier)]
                           :*)]
    [[expr]]))

(defn- select-with-top
  [select value]
  (with-meta (vec select) (assoc (meta select) :top value)))

(defmethod sql.qp/apply-top-level-clause [:teradata :limit]
  [driver _ honeysql-form {value :limit}]
  (let [deduped-select (sql.u/select-clause-deduplicate-aliases (:select honeysql-form))
        select         (if (seq deduped-select)
                         deduped-select
                         (default-select driver honeysql-form))]
    (assoc honeysql-form :select (select-with-top select value))))

(defmethod sql.qp/preprocess :teradata
  [driver mbql5-query]
  (let [parent-method (get-method sql.qp/preprocess :sql)]
    (sql.qp/fix-order-bys-in-subqueries (parent-method driver mbql5-query))))

(defn- format-qualify [_clause qualify-sql] [qualify-sql])

;; Register the ::qualify clause to appear after :order-by in the SQL output.
(sql/register-clause! ::qualify #'format-qualify :order-by)

(defmethod sql.qp/apply-top-level-clause [:teradata :page] [_ _ honeysql-form {{:keys [items page]} :page}]
  (let [order-by-sql (first (sql/format (select-keys honeysql-form [:order-by])
                                        {:quoted true}))]
    (assoc honeysql-form ::qualify (format "QUALIFY ROW_NUMBER() OVER (%s) BETWEEN %d AND %d"
                                           order-by-sql
                                           (inc (* items (dec page)))
                                           (* items page)))))

(def ^:private excluded-schemas
  #{"SystemFe" "SYSLIB" "LockLogShredder" "Sys_Calendar" "SYSBAR" "SYSUIF"
    "dbcmngr" "tdwm" "TDStats" "TDQCD" "SQLJ" "SysAdmin" "SYSSPATIAL" "DBC" "Crashdumps" "External_AP" "TDPUSER"})

(defmethod sql-jdbc.sync/excluded-schemas :teradata [_]
  excluded-schemas)

;; Teradata integer division truncates, so we cast the numerator to float for `:share`.
(defmethod sql.qp/->honeysql [:teradata :share]
  [driver [_ pred]]
  [:/ (sql.qp/->float driver (sql.qp/->honeysql driver (sql.qp/mbql-clause driver :count-where pred))) :%count.*])

;; Teradata uses ByteInt with values `1`/`0` for boolean `TRUE`/`FALSE`.
(defmethod sql.qp/->honeysql [:teradata Boolean]
  [_ bool]
  (if bool 1 0))

(defn- get-tables
  "Fetch a JDBC Metadata ResultSet of tables in the DB, optionally limited to ones belonging to a given schema."
  ^ResultSet [^DatabaseMetaData metadata, ^String schema-or-nil]
  (jdbc/result-set-seq (.getTables metadata nil schema-or-nil "%" ; tablePattern "%" = match all tables
                                   (into-array String ["TABLE", "VIEW", "FOREIGN TABLE"]))))

(defn- fast-active-tables
  "Teradata, fast implementation of `fast-active-tables` to support inclusion list."
  [_driver, ^DatabaseMetaData metadata, {{:keys [dbnames]} :details, :as _database}]
  (let [all-schemas (set (map :table_schem (jdbc/result-set-seq (.getSchemas metadata))))
        dbs (dbnames-set dbnames)
        schemas     (if (empty? dbs)
                      (set/difference all-schemas excluded-schemas) ; use default exclusion list
                      (set/intersection all-schemas dbs))] ; use defined inclusion list
    (set (for [schema schemas
               table-name (mapv :table_name (get-tables metadata schema))]
           {:name   table-name
            :schema schema}))))

;; Overridden to have access to the database with the configured property dbnames (inclusion list)
;; which will be used to filter the schemas.
(defmethod driver/describe-database :teradata [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [^Connection conn]
     {:tables (fast-active-tables driver (.getMetaData conn) database)})))

;; We can't use getObject(int, Class) as the underlying Resultset used by the Teradata jdbc driver is based on jdk6.
(defmethod sql-jdbc.execute/read-column-thunk [:teradata Types/TIMESTAMP]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [^java.sql.Timestamp value (.getTimestamp rs i)]
      (.toLocalDateTime value))))

(defmethod sql-jdbc.execute/read-column-thunk [:teradata Types/TIMESTAMP_WITH_TIMEZONE]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [value (.getString rs i)]
      (OffsetDateTime/parse value))))

(defmethod sql-jdbc.execute/read-column-thunk [:teradata Types/DATE]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [^java.sql.Date value (.getDate rs i)]
      (.toLocalDate value))))

(defmethod sql-jdbc.execute/read-column-thunk [:teradata Types/TIME]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [^java.sql.Time value (.getTime rs i)]
      (.toLocalTime value))))

(defmethod sql-jdbc.execute/read-column-thunk [:teradata Types/TIME_WITH_TIMEZONE]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [^java.sql.Time value (.getTime rs i)]
      (OffsetTime/parse value))))

;; TODO: use metabase.driver.sql-jdbc.execute.legacy-impl instead of re-implementing everything here
(defmethod sql-jdbc.execute/set-parameter [:teradata OffsetDateTime]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [cal (Calendar/getInstance (TimeZone/getTimeZone (t/zone-id t)))
        t   (t/sql-timestamp t)]
    (.setTimestamp ps i t cal)))

(defn- cleanup-query
  "Remove the OFFSET keyword."
  [query]
  (update-in query [:native :query] (fn [value] (str/replace value "OFFSET" ""))))

(defmethod driver/execute-reducible-query :teradata
  [driver query context respond]
  ((get-method driver/execute-reducible-query :sql-jdbc) driver (cleanup-query query) context respond))

(defmethod sql.qp/current-datetime-honeysql-form :teradata [_] now)

;; Overridden to customise the C3P0 properties which can be used to avoid the high number of logins against Teradata
;; In case of such problem increase the value of acquireRetryDelay
;; https://github.com/metabase/metabase/blob/master/src/metabase/driver/sql_jdbc/connection.clj#L42
;; https://www.mchange.com/projects/c3p0/#acquireRetryDelay
(defmethod sql-jdbc.conn/data-warehouse-connection-pool-properties :teradata
  [driver database]
  {"acquireRetryAttempts"         (if driver-api/is-test? 1 0)
   "acquireRetryDelay"            1000
   "acquireIncrement"             1
   "maxIdleTime"                  (* 6 60 60) ; 6 hours
   "minPoolSize"                  1
   "initialPoolSize"              1
   "maxPoolSize"                  (driver.settings/jdbc-data-warehouse-max-connection-pool-size)
   "testConnectionOnCheckout"     true
   "maxIdleTimeExcessConnections" (* 5 60)
   "checkoutTimeout"              300000 ; 300 seconds (increase this if needed)
   "idleConnectionTestPeriod"     300   ; Test idle connections every 5 minutes
   "maxConnectionAge"             (* 6 60 60) ; 6 hours
   "dataSourceName"               (format "db-%d-%s-%s" (u/the-id database) (name driver) (let [details (:details database)]
                                                                                            (or (some-> (:dbnames details) (str/split #",") first)
                                                                                                (:user details))))})

;; Teradata does not support boolean expressions (BETWEEN, AND, >=, etc.) in SELECT —
;; only in WHERE / CASE WHEN context. When a predicate expression appears in :fields,
;; wrap it in CASE WHEN expr THEN 1 ELSE 0 END.  Same pattern as SQL Server (#53805).
(defmethod sql.qp/apply-top-level-clause [:teradata :fields]
  [driver _ honeysql-form query]
  (let [parent-method (get-method sql.qp/apply-top-level-clause [:sql-jdbc :fields])
        maybe-wrap    #(cond-> %
                         (sql.qp.boolean-to-comparison/predicate-expression-clause? %)
                         (driver-api/assoc-field-options ::sql.qp/wrap-in-case true))]
    (->> (update query :fields (fn [fields] (mapv maybe-wrap fields)))
         (parent-method driver :fields honeysql-form))))

(defmethod sql.qp/->honeysql [:teradata ::sql.qp/wrap-in-case]
  [driver [_tag expr]]
  [:case (sql.qp/->honeysql driver expr) [:inline 1] :else [:inline 0]])

(defmethod sql.qp/->honeysql [:teradata :log]
  [driver [_ field]]
  [:log (sql.qp/->honeysql driver field)])
