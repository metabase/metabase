(ns metabase.driver.athena
  (:refer-clojure :exclude [second])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [honeysql.core :as hsql]
   [honeysql.format :as hformat]
   [java-time :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.athena.query-processor :as athena.qp]
   [metabase.driver.athena.schema-parser :as athena.schema-parser]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.models.field :as field :refer [Field]]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honeysql-extensions :as hx]
   [metabase.util.i18n :refer [trs]])
  (:import
   (java.sql DatabaseMetaData Timestamp)
   (java.time OffsetDateTime ZonedDateTime)))

(set! *warn-on-reflection* true)

(driver/register! :athena, :parent #{:sql-jdbc})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          metabase.driver method impls                                          |
;;; +----------------------------------------------------------------------------------------------------------------+


(defmethod driver/supports? [:athena :foreign-keys] [_ _] true)

(defmethod driver/supports? [:athena :nested-fields] [_ _] false #_true) ; huh? Not sure why this was `true`. Disabled
                                                                         ; for now.

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     metabase.driver.sql-jdbc method impls                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ---------------------------------------------- sql-jdbc.connection -----------------------------------------------

(defn endpoint-for-region
  "Returns the endpoint URL for a specific region"
  [region]
  (cond
    (str/starts-with? region "cn-") ".amazonaws.com.cn"
    :else ".amazonaws.com"))

(defmethod sql-jdbc.conn/connection-details->spec :athena
  [_driver {:keys [region access_key secret_key s3_staging_dir workgroup catalog], :as details}]
  (-> (merge
       {:classname      "com.simba.athena.jdbc.Driver"
        :subprotocol    "awsathena"
        :subname        (str "//athena." region (endpoint-for-region region) ":443")
        :user           access_key
        :password       secret_key
        :s3_staging_dir s3_staging_dir
        :workgroup      workgroup
        :AwsRegion      region}
       (when (str/blank? access_key)
         {:AwsCredentialsProviderClass "com.simba.athena.amazonaws.auth.DefaultAWSCredentialsProviderChain"})
       (when-not (str/blank? catalog)
         {:MetadataRetrievalMethod "ProxyAPI"
          :Catalog                 catalog})
       ;; `:metabase.driver.athena/schema` is just a gross hack for testing so we can treat multiple tests datasets as
       ;; different DBs -- see [[metabase.driver.athena/fast-active-tables]]. Not used outside of tests.
       (dissoc details :db :catalog :metabase.driver.athena/schema))
      (sql-jdbc.common/handle-additional-options details, :seperator-style :semicolon)))

(defmethod sql-jdbc.conn/data-source-name :athena
  [_driver {:keys [catalog], s3-results-bucket :s3_staging_dir}]
  ;; we're sort of in a pickle here since catalog is optional. We'll use that if it's present, otherwise use something
  ;; based on the s3 results bucket name (ick)
  (or (not-empty catalog)
      (when (seq s3-results-bucket)
        (u/slugify (str/replace s3-results-bucket #"^s3://" "")))))

;;; ------------------------------------------------- sql-jdbc.sync --------------------------------------------------

;; Map of column types -> Field base types
;; https://s3.amazonaws.com/athena-downloads/drivers/JDBC/SimbaAthenaJDBC_2.0.5/docs/Simba+Athena+JDBC+Driver+Install+and+Configuration+Guide.pdf
(defmethod sql-jdbc.sync/database-type->base-type :athena
  [_driver database-type]
  ({:array      :type/Array
    :bigint     :type/BigInteger
    :binary     :type/*
    :varbinary  :type/*
    :boolean    :type/Boolean
    :char       :type/Text
    :date       :type/Date
    :decimal    :type/Decimal
    :double     :type/Float
    :float      :type/Float
    :integer    :type/Integer
    :int        :type/Integer
    :map        :type/*
    :smallint   :type/Integer
    :string     :type/Text
    :struct     :type/Dictionary
    :time       :type/Time ; Athena sort of has a time type, sort of does not. You can specify it in literals but I don't think you can store it.
    :timestamp  :type/DateTime
    :tinyint    :type/Integer
    :varchar    :type/Text} database-type))

;;; ------------------------------------------------ sql-jdbc execute ------------------------------------------------

(defmethod sql-jdbc.execute/read-column-thunk [:athena java.sql.Types/VARCHAR]
  [driver ^java.sql.ResultSet rs ^java.sql.ResultSetMetaData rsmeta ^Integer i]
  ;; since TIME is not really a real type (or at least not one you can store) it comes back in a weird way -- it comes
  ;; back as a string, but the database type is `time`. In that case we can use `.getObject` to get a
  ;; `java.time.LocalTime` and it seems to work like we'd expect.
  (if (= (u/lower-case-en (.getColumnTypeName rsmeta i)) "time")
    (fn read-string-as-LocalTime [] (.getObject rs i java.time.LocalTime))
    ((get-method sql-jdbc.execute/read-column-thunk [:sql-jdbc java.sql.Types/VARCHAR]) driver rs rsmeta i)))

;;; ------------------------------------------------- date functions -------------------------------------------------

(defmethod unprepare/unprepare-value [:athena OffsetDateTime]
  [_driver t]
  #_(format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-offset t))
  ;; Timestamp literals do not support offsets, or at least they don't in `INSERT INTO ...` statements. I'm not 100%
  ;; sure what the correct thing to do here is then. The options are either:
  ;;
  ;; 1. Normalize to UTC
  ;; 2. Ignore offset and just consider local date/time
  ;; 3. Normalize to the report timezone
  ;;
  ;; For now I went with option (1) because it SEEMS like that's what Athena is doing. Not sure about this tho. We can
  ;; do something better when we figure out what's actually going on. -- Cam
  (let [t (u.date/with-time-zone-same-instant t (t/zone-id "UTC"))]
    (format "timestamp '%s %s'" (t/local-date t) (t/local-time t))))

(defmethod unprepare/unprepare-value [:athena ZonedDateTime]
  [driver t]
  #_(format "timestamp '%s %s' at time zone '%s'" (t/local-date t) (t/local-time t) (t/zone-id t))
  (unprepare/unprepare-value driver (t/offset-date-time t)))

;;; for some evil reason Athena expects `OFFSET` *before* `LIMIT`, unlike every other database in the known universe; so
;;; we'll have to have a custom implementation of `:page` here and do our own version of `:offset` that comes before
;;; `LIMIT`.

(hformat/register-clause! ::offset (dec (get hformat/default-clause-priorities :limit)))

(defmethod hformat/format-clause ::offset
  [[_clause n] honeysql-map]
  ;; this has to be a map entry, otherwise HoneySQL has a fit
  (hformat/format-clause (java.util.Map/entry :offset n) honeysql-map))

(defmethod sql.qp/apply-top-level-clause [:athena :page]
  [_driver _top-level-clause honeysql-form {{:keys [items page]} :page}]
  ;; this is identical to the normal version except for the `::offset` instead of `:offset`
  (assoc honeysql-form
         :limit items
         ::offset (* items (dec page))))

;;; Helper function for truncating dates - currently unused
#_(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) expr))

;;; Example of handling report timezone
;;; (defn- date-trunc
;;;   "date_trunc('interval', timezone, timestamp): truncates a timestamp to a given interval"
;;;   [unit expr]
;;;   (let [timezone (get-in sql.qp/*query* [:settings :report-timezone])]
;;;     (if (nil? timezone)
;;;       (hsql/call :date_trunc (hx/literal unit) expr)
;;;       (hsql/call :date_trunc (hx/literal unit) timezone expr))))

(defmethod driver/db-start-of-week :athena
  [_driver]
  :monday)

;;;; Datetime truncation functions

(defn- expr->literal
  "Helper function to cast `expr` to a timestamp if necessary."
  [expr]
  (if (instance? Timestamp expr)
    expr
    (hx/cast :timestamp expr)))

;;; If `expr` is a date, we need to cast it to a timestamp before we can truncate to a finer granularity Ideally, we
;;; should make this conditional. There's a generic approach above, but different use cases should b tested.
(defmethod sql.qp/date [:athena :minute]  [_driver _unit expr] (hsql/call :date_trunc (hx/literal :minute) (expr->literal expr)))
(defmethod sql.qp/date [:athena :hour]    [_driver _unit expr] (hsql/call :date_trunc (hx/literal :hour) (expr->literal expr)))
(defmethod sql.qp/date [:athena :day]     [_driver _unit expr] (hsql/call :date_trunc (hx/literal :day) expr))
(defmethod sql.qp/date [:athena :month]   [_driver _unit expr] (hsql/call :date_trunc (hx/literal :month) expr))
(defmethod sql.qp/date [:athena :quarter] [_driver _unit expr] (hsql/call :date_trunc (hx/literal :quarter) expr))
(defmethod sql.qp/date [:athena :year]    [_driver _unit expr] (hsql/call :date_trunc (hx/literal :year) expr))

(defmethod sql.qp/date [:athena :week]
  [driver _ expr]
  (sql.qp/adjust-start-of-week driver (partial hsql/call :date_trunc (hx/literal :week)) expr))

;;;; Datetime extraction functions

(defmethod sql.qp/date [:athena :minute-of-hour]  [_driver _unit expr] (hsql/call :minute expr))
(defmethod sql.qp/date [:athena :hour-of-day]     [_driver _unit expr] (hsql/call :hour expr))
(defmethod sql.qp/date [:athena :day-of-month]    [_driver _unit expr] (hsql/call :day_of_month expr))
(defmethod sql.qp/date [:athena :day-of-year]     [_driver _unit expr] (hsql/call :day_of_year expr))
(defmethod sql.qp/date [:athena :month-of-year]   [_driver _unit expr] (hsql/call :month expr))
(defmethod sql.qp/date [:athena :quarter-of-year] [_driver _unit expr] (hsql/call :quarter expr))

(defmethod sql.qp/date [:athena :day-of-week]
  [driver _ expr]
  (sql.qp/adjust-day-of-week driver (hsql/call :day_of_week expr)))

;;; FIXME (deprecated)
(defmethod sql.qp/->honeysql [:athena (class Field)]
  [driver field]
  (athena.qp/->honeysql driver field))

(defmethod sql.qp/unix-timestamp->honeysql [:athena :seconds]
  [_driver _seconds-or-milliseconds expr]
  (hsql/call :from_unixtime expr))

(defmethod sql.qp/add-interval-honeysql-form :athena
  [_driver hsql-form amount unit]
  (hsql/call :date_add
             (hx/literal (name unit))
             (hsql/raw (int amount))
             (hx/->timestamp hsql-form)))

(defmethod sql.qp/cast-temporal-string [:athena :Coercion/ISO8601->DateTime]
  [_driver _semantic-type expr]
  (hx/->timestamp expr))

(defmethod sql.qp/cast-temporal-string [:athena :Coercion/ISO8601->Date]
  [_driver _semantic-type expr]
  (hx/->date expr))

(defmethod sql.qp/cast-temporal-string [:athena :Coercion/ISO8601->Time]
  [_driver _semantic-type expr]
  (hx/->time expr))


;; fix to allow integer division to be cast as double (float is not supported by athena)
(defmethod sql.qp/->float :athena
  [_ value]
  (hx/cast :double value))

;; Support for median/percentile functions
(defmethod sql.qp/->honeysql [:athena :median]
  [driver [_ arg]]
  (hsql/call :approx_percentile (sql.qp/->honeysql driver arg) 0.5))

(defmethod sql.qp/->honeysql [:athena :percentile]
  [driver [_ arg p]]
  (hsql/call :approx_percentile (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver p)))

(defmethod sql.qp/->honeysql [:athena :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_extract (sql.qp/->honeysql driver arg) pattern))

;; keyword function converts database-type variable to a symbol, so we use symbols above to map the types
(defn- database-type->base-type-or-warn
  "Given a `database-type` (e.g. `VARCHAR`) return the mapped Metabase type (e.g. `:type/Text`)."
  [driver database-type]
  (or (sql-jdbc.sync/database-type->base-type driver (keyword database-type))
      (do (log/warn (format "Don't know how to map column type '%s' to a Field base_type, falling back to :type/*."
                            database-type))
          :type/*)))

(defn- run-query
  "Workaround for avoiding the usage of 'advance' jdbc feature that are not implemented by the driver yet.
   Such as prepare statement"
  [database query]
  (log/infof "Running Athena query : '%s'..." query)
  (try
    (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database) (str/replace query ";" " ") {:raw? true})
    (catch Exception e
      (log/error (u/format-color 'red "Failed to execute query: %s %s" query (.getMessage e))))))

(defn- describe-database->clj
  "Workaround for wrong getColumnCount response by the driver"
  [rs]
  {:name (str/trim (:col_name rs))
   :type (str/trim (:data_type rs))})

(defn remove-invalid-columns
  [result]
  (->> result
       (remove #(= (:col_name %) ""))
       (remove #(= (:col_name %) nil))
       (remove #(= (:data_type %) nil))
       (remove #(str/starts-with? (:col_name %) "#")) ; remove comment
       (distinct) ; driver can return twice the partitioning fields
       (map describe-database->clj)))

(defn sync-table-with-nested-field [database schema table-name]
  (->> (run-query database (str "DESCRIBE `" schema "`.`" table-name "`;"))
       remove-invalid-columns
       (map-indexed #(merge %2 {:database-position %1}))
       (map athena.schema-parser/parse-schema)
       doall
       set))

(defn sync-table-without-nested-field [driver columns]
  (set
   (for [[idx {database-type :type_name
               column-name   :column_name
               remarks       :remarks}] (m/indexed columns)]
     (merge
      {:name              column-name
       :database-type     database-type
       :base-type         (database-type->base-type-or-warn driver database-type)
       :database-position idx}
      (when (not (str/blank? remarks))
        {:field-comment remarks})))))
;; Not all tables in the Data Catalog are guaranted to be compatible with Athena
;; If an exception is thrown, log and throw an error

(defn table-has-nested-fields [columns]
  (some #(= "struct" (:type_name %)) columns))

(defn describe-table-fields
  "Returns a set of column metadata for `schema` and `table-name` using `metadata`. "
  [^DatabaseMetaData metadata database driver {^String schema :schema, ^String table-name :name}, & [^String db-name-or-nil]]
  (try
    (with-open [rs (.getColumns metadata db-name-or-nil schema table-name nil)]
      (let [columns (jdbc/metadata-result rs)]
        (if (table-has-nested-fields columns)
          (sync-table-with-nested-field database schema table-name)
          (sync-table-without-nested-field driver columns))))
    (catch Throwable e
      (log/error e (trs "Error retreiving fields for DB {0}.{1}" schema table-name))
      (throw e))))

;; Becuse describe-table-fields might fail, we catch the error here and return an empty set of columns

(defmethod driver/describe-table :athena
  [driver {{:keys [catalog]} :details, :as database} table]
  (jdbc/with-db-metadata [metadata (sql-jdbc.conn/db->pooled-connection-spec database)]
    (->> (assoc (select-keys table [:name :schema])
                :fields (try
                          (describe-table-fields metadata database driver table catalog)
                          (catch Throwable e (set nil)))))))

(defn- get-tables
  "Athena can query EXTERNAL and MANAGED tables."
  [^DatabaseMetaData metadata, ^String schema-or-nil, ^String db-name-or-nil]
  ;; tablePattern "%" = match all tables
  (with-open [rs (.getTables metadata db-name-or-nil schema-or-nil "%"
                             (into-array String ["EXTERNAL_TABLE"
                                                 "EXTERNAL TABLE"
                                                 "EXTERNAL"
                                                 "TABLE"
                                                 "VIEW"
                                                 "VIRTUAL_VIEW"
                                                 "FOREIGN TABLE"
                                                 "MATERIALIZED VIEW"
                                                 "MANAGED_TABLE"]))]
    (vec (jdbc/metadata-result rs))))

(defn- fast-active-tables
  "Required because we're calling our own custom private get-tables method to support Athena.

  `:metabase.driver.athena/schema` is an icky hack that's in here to force it to only try to sync a single schema,
  used by the tests when loading test data. We're not expecting users to specify it at this point in time. I'm not
  really sure how this is really different than `catalog`, which they can specify -- in the future when we understand
  Athena better maybe we can have a better way to do this -- Cam."
  [driver ^DatabaseMetaData metadata {:keys [catalog], ::keys [schema]}]
  ;; TODO: Catch errors here so a single exception doesn't fail the entire schema
  ;;
  ;; Also we're creating a set here, so even if we set "ProxyAPI", we'll miss dupe database names
  (with-open [rs (.getSchemas metadata)]
    ;; it seems like `table_catalog` is ALWAYS `AwsDataCatalog`. `table_schem` seems to correspond to the Database name,
    ;; at least for stuff we create with the test data extensions?? :thinking_face:
    (let [all-schemas (set (cond->> (jdbc/metadata-result rs)
                             catalog (filter #(= (:table_catalog %) catalog))
                             schema  (filter #(= (:table_schem %) schema))))
          schemas     (set/difference all-schemas (sql-jdbc.sync/excluded-schemas driver))]
      (set (for [schema schemas
                 table  (get-tables metadata (:table_schem schema) (:table_catalog schema))]
             (let [remarks (:remarks table)]
               {:name        (:table_name table)
                :schema      (:table_schem schema)
                :description (when-not (str/blank? remarks)
                               remarks)}))))))

;; You may want to exclude a specific database - this can be done here
; (defmethod sql-jdbc.sync/excluded-schemas :athena [_]
;   #{"database_name"})

; If we want to limit the initial connection to a specific database/schema, I think we'd have to do that here...
(defmethod driver/describe-database :athena
  [driver {details :details, :as database}]
  {:tables (jdbc/with-db-metadata [metadata (sql-jdbc.conn/db->pooled-connection-spec database)]
             (fast-active-tables driver metadata details))})

; Unsure if this is the right way to approach building the parameterized query...but it works
(defn- prepare-query [driver {query :native, :as outer-query}]
  (cond-> outer-query
    (seq (:params query))
    (merge {:native {:params nil
                     :query (unprepare/unprepare driver (cons (:query query) (:params query)))}})))

(defmethod driver/execute-reducible-query :athena
  [driver query context respond]
  ((get-method driver/execute-reducible-query :sql-jdbc) driver (prepare-query driver, query) context respond))
