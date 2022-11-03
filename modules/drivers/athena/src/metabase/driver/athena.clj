(ns metabase.driver.athena
  (:refer-clojure :exclude [second])
  (:require [metabase.driver.schema-parser :as schema-parser]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as string]
            [clojure.tools.logging :as log]
            [clojure.set :as set]
            [medley.core :as m]
            [metabase.query-processor]
            [metabase.models
             [field :as field :refer [Field]]]
            [metabase.driver.query-processor :as qp]
            [honeysql
             [core :as hsql]]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql-jdbc.execute.legacy-impl :as legacy]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :refer [trs]]]
            [metabase.util :as u])
  (:import [java.sql DatabaseMetaData Timestamp]
           (java.time OffsetDateTime ZonedDateTime)))

(driver/register! :athena, :parent #{:sql-jdbc, ::legacy/use-legacy-classes-for-read-and-set})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          metabase.driver method impls                                          |
;;; +----------------------------------------------------------------------------------------------------------------+


(defmethod driver/supports? [:athena :foreign-keys] [_ _] true)

(defmethod driver/supports? [:athena :nested-fields] [_ _] true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     metabase.driver.sql-jdbc method impls                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ---------------------------------------------- sql-jdbc.connection -----------------------------------------------

(defn endpoint-for-region
  "Returns the endpoint URL for a specific region"
  [region]
  (cond
    (string/starts-with? region "cn-") ".amazonaws.com.cn"
    :else ".amazonaws.com"))

(defmethod sql-jdbc.conn/connection-details->spec :athena [_ {:keys [region access_key secret_key s3_staging_dir workgroup db catalog], :as details}]
  (-> (merge
       {:classname        "com.simba.athena.jdbc.Driver"
        :subprotocol      "awsathena"
        :subname          (str "//athena." region (endpoint-for-region region) ":443")
        :user             access_key
        :password         secret_key
        :s3_staging_dir   s3_staging_dir
        :workgroup        workgroup
        :AwsRegion        region
        }
       (when (string/blank? access_key)
         {:AwsCredentialsProviderClass "com.simba.athena.amazonaws.auth.DefaultAWSCredentialsProviderChain"})
       (when-not (string/blank? catalog)
         {:MetadataRetrievalMethod "ProxyAPI"
          :Catalog catalog})
       (dissoc details :db :catalog))
      (sql-jdbc.common/handle-additional-options details, :seperator-style :semicolon)))

;;; ------------------------------------------------- sql-jdbc.sync --------------------------------------------------

;; Map of column types -> Field base types
;; https://s3.amazonaws.com/athena-downloads/drivers/JDBC/SimbaAthenaJDBC_2.0.5/docs/Simba+Athena+JDBC+Driver+Install+and+Configuration+Guide.pdf
(defmethod sql-jdbc.sync/database-type->base-type :athena [_ database-type]
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
    :timestamp  :type/DateTime
    :tinyint    :type/Integer
    :varchar    :type/Text} database-type))

;;; ------------------------------------------------- date functions -------------------------------------------------

(defmethod unprepare/unprepare-value [:athena OffsetDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-offset t)))

(defmethod unprepare/unprepare-value [:athena ZonedDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-id t)))

; Helper function for truncating dates - currently unused
(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) expr))

; Example of handling report timezone
; (defn- date-trunc
;   "date_trunc('interval', timezone, timestamp): truncates a timestamp to a given interval"
;   [unit expr]
;   (let [timezone (get-in sql.qp/*query* [:settings :report-timezone])]
;     (if (nil? timezone)
;       (hsql/call :date_trunc (hx/literal unit) expr)
;       (hsql/call :date_trunc (hx/literal unit) timezone expr))))

; Helper function to cast `expr` to a timestamp if necessary
(defn- expr->literal [expr]
  (if (instance? Timestamp expr)
    expr
    (hx/cast :timestamp expr)))

; If `expr` is a date, we need to cast it to a timestamp before we can truncate to a finer granularity
; Ideally, we should make this conditional. There's a generic approach above, but different use cases should b tested.
(defmethod sql.qp/date [:athena :minute]          [_ _ expr] (hsql/call :date_trunc (hx/literal :minute) (expr->literal expr)))
(defmethod sql.qp/date [:athena :hour]            [_ _ expr] (hsql/call :date_trunc (hx/literal :hour) (expr->literal expr)))
(defmethod sql.qp/date [:athena :day]             [_ _ expr] (hsql/call :date_trunc (hx/literal :day) expr))
(defmethod sql.qp/date [:athena :week]            [_ _ expr] (hsql/call :date_trunc (hx/literal :week) expr))
(defmethod sql.qp/date [:athena :month]           [_ _ expr] (hsql/call :date_trunc (hx/literal :month) expr))
(defmethod sql.qp/date [:athena :quarter]         [_ _ expr] (hsql/call :date_trunc (hx/literal :quarter) expr))
(defmethod sql.qp/date [:athena :year]            [_ _ expr] (hsql/call :date_trunc (hx/literal :year) expr))

; Extraction functions
(defmethod sql.qp/date [:athena :minute-of-hour]  [_ _ expr] (hsql/call :minute expr))
(defmethod sql.qp/date [:athena :hour-of-day]     [_ _ expr] (hsql/call :hour expr))
(defmethod sql.qp/date [:athena :day-of-week]     [_ _ expr] (hsql/call :day_of_week expr))
(defmethod sql.qp/date [:athena :day-of-month]    [_ _ expr] (hsql/call :day_of_month expr))
(defmethod sql.qp/date [:athena :day-of-year]     [_ _ expr] (hsql/call :day_of_year expr))
(defmethod sql.qp/date [:athena :week-of-year]    [_ _ expr] (hsql/call :week_of_year expr))
(defmethod sql.qp/date [:athena :month-of-year]   [_ _ expr] (hsql/call :month expr))
(defmethod sql.qp/date [:athena :quarter-of-year] [_ _ expr] (hsql/call :quarter expr))

(defmethod sql.qp/->honeysql [:athena (class Field)] [driver field] (qp/->honeysql driver field))

(defmethod sql.qp/unix-timestamp->honeysql [:athena :seconds] [_ _ expr] (hsql/call :from_unixtime expr))

(defmethod sql.qp/add-interval-honeysql-form :athena [_ hsql-form amount unit]
  (hsql/call :date_add
             (hx/literal (name unit))
             (hsql/raw (int amount))
             (hx/->timestamp hsql-form)))

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
    (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database) (string/replace query ";" " ") {:raw? true})
    (catch Exception e
      (log/error (u/format-color 'red "Failed to execute query: %s %s" query (.getMessage e))))))

(defn- describe-database->clj
  "Workaround for wrong getColumnCount response by the driver"
  [rs]
  {:name (string/trim (:col_name rs))
   :type (string/trim (:data_type rs))})

(defn remove-invalid-columns
  [result]
  (->> result
       (remove #(= (:col_name %) ""))
       (remove #(= (:col_name %) nil))
       (remove #(= (:data_type %) nil))
       (remove #(string/starts-with? (:col_name %) "#")) ; remove comment
       (distinct) ; driver can return twice the partitioning fields
       (map describe-database->clj)))

(defn sync-table-with-nested-field [database schema table-name]
  (->> (run-query database (str "DESCRIBE `" schema "`.`" table-name "`;"))
       (remove-invalid-columns)
       (map-indexed #(merge %2 {:database-position %1}))
       (map schema-parser/parse-schema)
       (doall)
       (set)))

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
      (when (not (string/blank? remarks))
        {:field-comment remarks})))))
;; Not all tables in the Data Catalog are guaranted to be compatible with Athena
;; If an exception is thrown, log and throw an error

(defn table-has-nested-fields [columns]
  (some #(= "struct" (:type_name %)) columns))

(defn describe-table-fields
  "Returns a set of column metadata for `schema` and `table-name` using `metadata`. "
  [^DatabaseMetaData metadata, database,  driver, {^String schema :schema, ^String table-name :name}, & [^String db-name-or-nil]]
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


(defmethod driver/describe-table :athena [driver {{:keys [catalog] :as details} :details :as database} table]
  (jdbc/with-db-metadata [metadata (sql-jdbc.conn/db->pooled-connection-spec database)]
    (->> (assoc (select-keys table [:name :schema])
                :fields (try
                          (describe-table-fields metadata database driver table catalog)
                          (catch Throwable e (set nil)))))))

;; Athena can query EXTERNAL and MANAGED tables
(defn- get-tables [^DatabaseMetaData metadata, ^String schema-or-nil, ^String db-name-or-nil]
  ;; tablePattern "%" = match all tables
  (with-open [rs (.getTables metadata db-name-or-nil schema-or-nil "%"
                             (into-array String ["EXTERNAL_TABLE", "EXTERNAL TABLE", "EXTERNAL", "TABLE", "VIEW", "VIRTUAL_VIEW", "FOREIGN TABLE", "MATERIALIZED VIEW", "MANAGED_TABLE"]))]
    (vec (jdbc/metadata-result rs))))

;; Required because we're calling our own custom private get-tables method to support Athena
(defn- fast-active-tables [driver, ^DatabaseMetaData metadata, & [db-name-or-nil]]
  ;; TODO: Catch errors here so a single exception doesn't fail the entire schema

  ;; Also we're creating a set here, so even if we set "ProxyAPI", we'll miss dupe database names
  (with-open [rs (.getSchemas metadata)]
    (let [all-schemas (if db-name-or-nil (filter #(= (:table_catalog %) db-name-or-nil) (jdbc/metadata-result rs)) (jdbc/metadata-result rs))
          schemas     (set/difference all-schemas (sql-jdbc.sync/excluded-schemas driver))]
      (set (for [schema schemas
                 table  (get-tables metadata (:table_schem schema) (:table_catalog schema))]
             (let [remarks (:remarks table)]
               {:name        (:table_name table)
                :schema      (:table_schem schema)
                :description (when-not (string/blank? remarks)
                               remarks)}))))))

;; You may want to exclude a specific database - this can be done here
; (defmethod sql-jdbc.sync/excluded-schemas :athena [_]
;   #{"database_name"})

; If we want to limit the initial connection to a specific database/schema, I think we'd have to do that here...
(defmethod driver/describe-database :athena [driver {{:keys [catalog schema] :as details} :details :as database}]
  {:tables (jdbc/with-db-metadata [metadata (sql-jdbc.conn/db->pooled-connection-spec database)]
             (fast-active-tables driver metadata catalog))})

; Unsure if this is the right way to approach building the parameterized query...but it works
(defn- prepare-query [driver {:keys [database settings], query :native, :as outer-query}]
  (cond-> outer-query
    (seq (:params query))
    (merge {:native {:params nil
                     :query (unprepare/unprepare driver (cons (:query query) (:params query)))}})))

(defmethod driver/execute-reducible-query :athena
  [driver query context respond]
  ((get-method driver/execute-reducible-query :sql-jdbc) driver (prepare-query driver, query) context respond))
