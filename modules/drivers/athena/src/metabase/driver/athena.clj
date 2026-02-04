(ns metabase.driver.athena
  (:refer-clojure :exclude [some select-keys mapv empty? not-empty get-in])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.athena.schema-parser :as athena.schema-parser]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [some select-keys mapv empty? not-empty get-in]])
  (:import
   (java.sql Connection DatabaseMetaData Date ResultSet Time Types)
   (java.time OffsetDateTime ZonedDateTime)
   (java.util UUID)))

(set! *warn-on-reflection* true)

(driver/register! :athena, :parent #{:sql-jdbc})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          metabase.driver method impls                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(doseq [[feature supported?] {:connection/multiple-databases    true
                              :database-routing                 true
                              :datetime-diff                    true
                              :expression-literals              true
                              :identifiers-with-spaces          false
                              :metadata/key-constraints         false
                              :nested-fields                    false
                              :regex/lookaheads-and-lookbehinds false
                              :test/jvm-timezone-setting        false
                              :uuid-type                        true}]
  (defmethod driver/database-supports? [:athena feature] [_driver _feature _db] supported?))

(defmethod driver/database-supports? [:athena :schemas]
  [_driver _feature db]
  (not (seq (:dbname (:details db)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     metabase.driver.sql-jdbc method impls                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ---------------------------------------------- sql-jdbc.connection -----------------------------------------------

(defn- endpoint-for-region
  "Returns the endpoint URL for a specific region"
  [region]
  (str "//athena." region ".amazonaws.com" (when (str/starts-with? region "cn-") ".cn") ":443"))

(defmethod sql-jdbc.conn/connection-details->spec :athena
  [_driver {:keys [region access_key secret_key s3_staging_dir workgroup catalog dbname hostname], :as details}]
  (-> (merge
       {:classname      "com.amazon.athena.jdbc.AthenaDriver"
        :subprotocol    "athena"
        :subname       (if (str/blank? hostname)
                         (endpoint-for-region region)
                         (str "//" hostname ":443"))
        :User           access_key
        :Password       secret_key
        :OutputLocation s3_staging_dir
        :WorkGroup      workgroup
        :Region      region}
       (when dbname
         {:database dbname})
       (when (and (not (driver-api/is-hosted?)) (str/blank? access_key))
         {:CredentialsProvider "DefaultChain"})
       (when-not (str/blank? catalog)
         {:MetadataRetrievalMethod "ProxyAPI"
          :Catalog                 catalog})
       (dissoc details
               ;; Remove 2.x jdbc driver version options from details.
               ;; They are mapped to appropriate 3.x keys on preceding lines
               :db :dbname :catalog :region :access_key :secret_key :s3_staging_dir :workgroup :hostname))
      (sql-jdbc.common/handle-additional-options details, :seperator-style :semicolon)))

(defmethod sql-jdbc.conn/data-source-name :athena
  [_driver {:keys [catalog], s3-results-bucket :s3_staging_dir}]
  ;; we're sort of in a pickle here since catalog is optional. We'll use that if it's present, otherwise use something
  ;; based on the s3 results bucket name (ick)
  (or (not-empty catalog)
      (when (seq s3-results-bucket)
        (u/slugify (str/replace s3-results-bucket #"^s3://" "")))))

;;; ------------------------------------------------- sql-jdbc.sync --------------------------------------------------

(def ^:private db-type->base-type
  {:array                               :type/Array
   :bigint                              :type/BigInteger
   :binary                              :type/*
   :varbinary                           :type/*
   :boolean                             :type/Boolean
   :char                                :type/Text
   :date                                :type/Date
   :decimal                             :type/Decimal
   :double                              :type/Float
   :float                               :type/Float
   :integer                             :type/Integer
   :int                                 :type/Integer
   :uuid                                :type/UUID
   :map                                 :type/*
   :smallint                            :type/Integer
   :string                              :type/Text
   :struct                              :type/Dictionary
   ;; Athena sort of has a time type, sort of does not. You can specify it in literals but I don't think you can store
   ;; it.
   :time                                :type/Time
   :timestamp                           :type/DateTime
   ;; Same for timestamp with time zone... the type sort of exists. You can't store it AFAIK but you can create one
   ;; from a literal or by converting a `timestamp` column, e.g. with the `with_timezone` function.
   (keyword "timestamp with time zone") :type/DateTimeWithZoneID
   :tinyint                             :type/Integer
   :varchar                             :type/Text})

;; Map of column types -> Field base types
;; https://s3.amazonaws.com/athena-downloads/drivers/JDBC/SimbaAthenaJDBC_2.0.5/docs/Simba+Athena+JDBC+Driver+Install+and+Configuration+Guide.pdf
(defmethod sql-jdbc.sync/database-type->base-type :athena
  [_driver database-type]
  ;; Most databases have a canonical spelling for the types returned by JDBC, and ignore the upper/lower case you type
  ;; in eg. `CREATE TABLE` statements. However, Athena has an admin interface where the case typed by the user is what
  ;; gets returned by JDBC calls. Therefore, lower-case the incoming `database-type` and then look up its `base-type`.
  (-> database-type name u/lower-case-en keyword db-type->base-type))

;;; ------------------------------------------------ sql-jdbc execute ------------------------------------------------

(defmethod sql-jdbc.execute/read-column-thunk [:athena Types/OTHER]
  [driver ^java.sql.ResultSet rs ^java.sql.ResultSetMetaData rsmeta ^Integer i]
  (case (u/lower-case-en (.getColumnTypeName rsmeta i))

    "uuid"
    (fn read-column-as-UUID []
      (when-let [s (.getObject rs i)]
        (try
          (UUID/fromString s)
          (catch IllegalArgumentException _
            s))))

    ((get-method sql-jdbc.execute/read-column-thunk [:sql-jdbc Types/OTHER]) driver rs rsmeta i)))

(defmethod sql.qp/->honeysql [:athena ::sql.qp/cast-to-text]
  [driver [_ expr]]
  (sql.qp/->honeysql driver [::sql.qp/cast expr "varchar"]))

(defmethod sql-jdbc.execute/read-column-thunk [:athena Types/TIMESTAMP_WITH_TIMEZONE]
  [_driver ^ResultSet rs _rs-meta ^Long i]
  (let [results-timezone (driver-api/results-timezone-id)]
    (fn []
      ;; always get the timestamp as a string because the underlying JDBC implementation parses strings to
      ;; `java.sql.Timestamp` anyway and it barfs if it has a nanosecond component.
      (when-some [t (some-> (.getString rs i) u.date/parse)]
        ;; Using ZonedDateTime if available to conform tests first. OffsetDateTime if former is not available.
        (try
          (u.date/with-time-zone-same-instant t results-timezone)
          (catch Throwable _
            (log/warnf "Failed to construct ZonedDateTime from `%s` using `%s` timezone."
                       (pr-str t)
                       (pr-str results-timezone))
            t))))))

(defmethod sql-jdbc.execute/read-column-thunk [:athena Types/TIMESTAMP]
  [_driver ^ResultSet rs _rs-meta ^Long i]
  (fn []
    (some-> (.getString rs i) u.date/parse)))

(defmethod sql-jdbc.execute/read-column-thunk [:athena Types/DATE]
  [_driver ^ResultSet rs _rs-meta ^Long i]
  (fn [] (some-> ^Date (.getObject rs i Date)
                 (t/local-date))))

(defmethod sql-jdbc.execute/read-column-thunk [:athena Types/TIME]
  [_driver ^ResultSet rs _rs-meta ^Long i]
  (fn [] (some-> ^Time (.getObject rs i Time)
                 (t/local-time))))

;;; ------------------------------------------------- date functions -------------------------------------------------

(def ^:dynamic *loading-data*
  "HACK! Whether we're loading data (e.g. in [[metabase.test.data.athena]]). We can't use `timestamp with time zone`
  literals when loading data because Athena doesn't let you use a `timestamp with time zone` value for a `timestamp`
  column, and you can only have `timestamp` columns when actually creating them."
  false)

(defmethod sql.qp/inline-value [:athena OffsetDateTime]
  [_driver t]
  ;; Timestamp literals do not support offsets, or at least they don't in `INSERT INTO ...` statements. I'm not 100%
  ;; sure what the correct thing to do here is then. The options are either:
  ;;
  ;; 1. Normalize to UTC
  ;; 2. Ignore offset and just consider local date/time
  ;; 3. Normalize to the report timezone
  ;;
  ;; For now I went with option (1) because it SEEMS like that's what Athena is doing. Not sure about this tho. We can
  ;; do something better when we figure out what's actually going on. -- Cam
  (if *loading-data*
    (let [t (u.date/with-time-zone-same-instant t (t/zone-id "UTC"))]
      (format "timestamp '%s %s'" (t/local-date t) (t/local-time t)))
    ;; when not loading data we can actually use timestamp with offset info.
    (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-offset t))))

(defmethod sql.qp/inline-value [:athena ZonedDateTime]
  [driver t]
  ;; This format works completely fine for literals e.g.
  ;;
  ;;    SELECT timestamp '2022-11-16 04:21:00 US/Pacific'
  ;;
  ;; is the coolest thing in the world as far as Athena is concerned and will return a TIMESTAMP WITH TIME ZONE. However
  ;; you most certainly cannot try to load one of these into a TIMESTAMP column when loading test data. That's probably
  ;; fine, I think we're skipping those tests anyway, right? Hard to say since the Athena code doesn't recreate datasets
  ;; that have already been created for performance reasons. If you add a new dataset and it should work for
  ;; Athena (despite Athena only partially supporting TIMESTAMP WITH TIME ZONE) then you can use the commented out impl
  ;; to do it. That should work ok because it converts it to a UTC then to a LocalDateTime. -- Cam
  (if *loading-data*
    (sql.qp/inline-value driver (t/offset-date-time t))
    (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-id t))))

(defmethod sql.qp/inline-value [:athena UUID]
  [_driver uuid]
  ;; since we inline, we need to cast to string to uuid
  (format "cast('%s' as uuid)" uuid))

;;; for some evil reason Athena expects `OFFSET` *before* `LIMIT`, unlike every other database in the known universe; so
;;; we'll have to have a custom implementation of `:page` here and do our own version of `:offset` that comes before
;;; `LIMIT`.

(sql/register-clause! ::offset :offset :limit)

(defmethod sql.qp/apply-top-level-clause [:athena :page]
  [_driver _top-level-clause honeysql-form {{:keys [items page]} :page}]
  ;; this is identical to the normal version except for the `::offset` instead of `:offset`
  (assoc honeysql-form
         :limit (sql.qp/inline-num items)
         ::offset (sql.qp/inline-num (* items (dec page)))))

(defn- date-trunc [unit expr] [:date_trunc (h2x/literal unit) expr])

;;; Example of handling report timezone
;;; (defn- date-trunc
;;;   "date_trunc('interval', timezone, timestamp): truncates a timestamp to a given interval"
;;;   [unit expr]
;;;   (let [timezone (get-in sql.qp/*query* [:settings :report-timezone])]
;;;     (if (nil? timezone)
;;;       (hx/call :date_trunc (hx/literal unit) expr)
;;;       (hx/call :date_trunc (hx/literal unit) timezone expr))))

(defmethod driver/db-start-of-week :athena
  [_driver]
  :monday)

;;;; Datetime truncation functions

;;; If `expr` is a date, we need to cast it to a timestamp before we can truncate to a finer granularity Ideally, we
;;; should make this conditional. There's a generic approach above, but different use cases should be tested.
(defmethod sql.qp/date [:athena :minute]  [_driver _unit expr] [:date_trunc (h2x/literal :minute) expr])
(defmethod sql.qp/date [:athena :hour]    [_driver _unit expr] [:date_trunc (h2x/literal :hour) expr])
(defmethod sql.qp/date [:athena :day]     [_driver _unit expr] [:date_trunc (h2x/literal :day) expr])
(defmethod sql.qp/date [:athena :month]   [_driver _unit expr] [:date_trunc (h2x/literal :month) expr])
(defmethod sql.qp/date [:athena :quarter] [_driver _unit expr] [:date_trunc (h2x/literal :quarter) expr])
(defmethod sql.qp/date [:athena :year]    [_driver _unit expr] [:date_trunc (h2x/literal :year) expr])

(defmethod sql.qp/date [:athena :week]
  [driver _ expr]
  (sql.qp/adjust-start-of-week driver (partial conj [:date_trunc] (h2x/literal :week)) expr))

;;;; Datetime extraction functions

(defmethod sql.qp/date [:athena :minute-of-hour]  [_driver _unit expr] [:minute expr])
(defmethod sql.qp/date [:athena :hour-of-day]     [_driver _unit expr] [:hour expr])
(defmethod sql.qp/date [:athena :day-of-month]    [_driver _unit expr] [:day_of_month expr])
(defmethod sql.qp/date [:athena :day-of-year]     [_driver _unit expr] [:day_of_year expr])
(defmethod sql.qp/date [:athena :month-of-year]   [_driver _unit expr] [:month expr])
(defmethod sql.qp/date [:athena :quarter-of-year] [_driver _unit expr] [:quarter expr])

(defmethod sql.qp/date [:athena :day-of-week]
  [driver _ expr]
  (sql.qp/adjust-day-of-week driver [:day_of_week expr]))

(defmethod sql.qp/unix-timestamp->honeysql [:athena :seconds]
  [_driver _precision expr]
  (-> [:from_unixtime expr]
      (h2x/with-database-type-info "timestamp")))

(defn- from-unixtime-nanos [expr]
  (-> [:from_unixtime_nanos expr]
      (h2x/with-database-type-info "timestamp")))

(defmethod sql.qp/unix-timestamp->honeysql [:athena :milliseconds]
  [_driver _precision expr]
  (from-unixtime-nanos (h2x/* expr 1000000)))

(defmethod sql.qp/unix-timestamp->honeysql [:athena :microseconds]
  [_driver _precision expr]
  (from-unixtime-nanos (h2x/* expr 1000)))

(defmethod sql.qp/unix-timestamp->honeysql [:athena :nanoseconds]
  [_driver _precision expr]
  (from-unixtime-nanos expr))

(defmethod sql.qp/add-interval-honeysql-form :athena
  [_driver hsql-form amount unit]
  [:date_add
   (h2x/literal (name unit))
   [:raw (int amount)]
   hsql-form])

(defmethod sql.qp/cast-temporal-string [:athena :Coercion/ISO8601->DateTime]
  [_driver _semantic-type expr]
  (h2x/->timestamp [:replace expr "T" " "]))

(defmethod sql.qp/cast-temporal-string [:athena :Coercion/ISO8601->Date]
  [_driver _semantic-type expr]
  (h2x/->date expr))

(defmethod sql.qp/cast-temporal-string [:athena :Coercion/ISO8601->Time]
  [_driver _semantic-type expr]
  (h2x/->time expr))

(defmethod sql.qp/cast-temporal-string [:athena :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  [:date_parse expr (h2x/literal "%Y%m%d%H%i%S")])

(defmethod sql.qp/->honeysql [:athena :datetime-diff]
  [driver [_ x y unit]]
  (let [x (sql.qp/->honeysql driver x)
        y (sql.qp/->honeysql driver y)]
    (case unit
      (:year :month :quarter :week :day)
      [:date_diff (h2x/literal unit) (date-trunc :day x) (date-trunc :day y)]
      (:hour :minute :second)
      [:date_diff (h2x/literal unit) (h2x/->timestamp x) (h2x/->timestamp y)])))

;; Support for median/percentile functions
(defmethod sql.qp/->honeysql [:athena :median]
  [driver [_ arg]]
  [:approx_percentile (sql.qp/->honeysql driver arg) 0.5])

(defmethod sql.qp/->honeysql [:athena :percentile]
  [driver [_ arg p]]
  [:approx_percentile (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver p)])

(defmethod sql.qp/->honeysql [:athena :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_extract (sql.qp/->honeysql driver arg) pattern])

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
  "Workaround for wrong getColumnCount response by the driver (huh?)"
  [column-metadata]
  {:name (str/trim (:col_name column-metadata))
   :type (str/trim (:data_type column-metadata))})

(defn- remove-invalid-columns
  "Returns a transducer."
  []
  (comp (remove #(= (:col_name %) ""))
        (remove #(= (:col_name %) nil))
        (remove #(= (:data_type %) nil))
        (remove #(str/starts-with? (:col_name %) "#")) ; remove comment
        (distinct)                                     ; driver can return twice the partitioning fields
        (map describe-database->clj)))

(defn- normalize-field-info
  "Normalize values [[describe-table-fields-with-nested-fields]]. The JDBC driver of version 3.3 returns results of
  `DESCRIBE...` as {:_col0 \"<name>\t<typename>\t<remark>\"}."
  [raw-field-info]
  (let [field-info-str (:_col0 raw-field-info)
        components (map (comp not-empty str/trim) (str/split field-info-str #"\t"))
        field-info (zipmap [:col_name :data_type :remark] components)]
    (log/tracef "DESCRIBE result: %s" (pr-str field-info-str))
    (into {} (remove (fn [[_ v]] (nil? v))) field-info)))

(defn- describe-table-fields-with-nested-fields [database schema table-name]
  (into #{}
        (comp (map normalize-field-info)
              (remove-invalid-columns)
              (map-indexed (fn [i column-metadata]
                             (assoc column-metadata :database-position i)))
              (map athena.schema-parser/parse-schema))
        (run-query database (format "DESCRIBE `%s`.`%s`;" schema table-name))))

(defn- describe-table-fields-without-nested-fields [driver schema table-name columns]
  (set
   (for [[idx {database-type :type_name
               column-name   :column_name
               remarks       :remarks}] (m/indexed columns)]
     (merge
      {:name              column-name
       :database-type     database-type
       :base-type         (sql-jdbc.sync/database-type->base-type-or-warn driver
                                                                          [schema table-name column-name]
                                                                          database-type)
       :database-position idx}
      (when (not (str/blank? remarks))
        {:field-comment remarks})))))

;; Not all tables in the Data Catalog are guaranteed to be compatible with Athena
;; If an exception is thrown, log and throw an error

(defn- table-has-nested-fields? [columns]
  (some #(= "struct" (:type_name %)) columns))

(defn- get-columns
  [^DatabaseMetaData metadata catalog schema table-name]
  (try
    (with-open [rs (.getColumns metadata catalog schema table-name nil)]
      (jdbc/metadata-result rs))
    (catch Throwable e
      (log/warnf "`.getColumns` failed for catalog `%s`, schema `%s`, table name `%s` with message: `%s`"
                 catalog schema table-name (ex-message e))
      #{})))

(defn describe-table-fields
  "Returns a set of column metadata for `schema` and `table-name` using `metadata`. "
  [^DatabaseMetaData metadata database driver {^String schema :schema, ^String table-name :name} catalog dbname]
  (let [schema (or schema dbname)]
    (try
      (let [columns (get-columns metadata catalog schema table-name)
            duplicates? (and (seq columns)
                             (not (apply distinct? (map :column_name columns))))]
        (when (empty? columns)
          (log/trace "Falling back to DESCRIBE due to #43980"))
        (when duplicates?
          (log/trace "Falling back to DESCRIBE due to duplicate column names (#58441)"
                     (into {} (keep (fn [[col-name cols]]
                                      (when (next cols)
                                        [col-name (mapv :type_name cols)])))
                           (group-by :column_name columns))))
        (if (or (table-has-nested-fields? columns)
                  ; If `.getColumns` returns an empty result, try to use DESCRIBE, which is slower
                  ; but doesn't suffer from the bug in the JDBC driver as metabase#43980
                (empty? columns)
                duplicates?)
          (describe-table-fields-with-nested-fields database schema table-name)
          (describe-table-fields-without-nested-fields driver schema table-name columns)))
      (catch Throwable e
        (log/errorf e "Error retrieving fields for DB %s.%s" schema table-name)
        (throw e)))))

;; Because describe-table-fields might fail, we catch the error here and return an empty set of columns

(defmethod driver/describe-table :athena
  [driver {{:keys [catalog dbname]} :details, :as database} table]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [^Connection conn]
     (let [metadata (.getMetaData conn)]
       (assoc (select-keys table [:name :schema])
              :fields (try
                        (describe-table-fields metadata database driver table catalog dbname)
                        (catch Throwable _
                          (set nil))))))))

(defn- get-tables
  [^DatabaseMetaData metadata, ^String schema-or-nil, ^String db-name-or-nil]
  ;; tablePattern "%" = match all tables
  (with-open [rs (.getTables metadata db-name-or-nil schema-or-nil "%"
                             (into-array String ["TABLE"
                                                 "VIEW"]))]
    (vec (jdbc/metadata-result rs))))

#_:clj-kondo/ignore
(comment
  ;; Script on following lines was used to get available table types, used in the `get-tables` implementation.
  (with-open [conn (clojure.java.jdbc/get-connection
                    (sql-jdbc.conn/connection-details->spec
                     :athena
                     (metabase.test.data.interface/dbdef->connection-details
                      :athena :server (metabase.test.data.interface/get-dataset-definition
                                       metabase.test.data.dataset-definitions/test-data))))]
    (let [db-meta-rs (.getMetaData conn)]
      (with-open [table-types (.getTableTypes db-meta-rs)]
        (let [table-types-meta (.getMetaData table-types)
              columns (mapv (fn [idx]
                              {:column-name (.getColumnName table-types-meta idx)
                               :column-label (.getColumnLabel table-types-meta idx)})
                            (map inc (range (.getColumnCount table-types-meta))))
              rows (loop [rows []]
                     (.next table-types)
                     (if (.isAfterLast table-types)
                       rows
                       (recur (conj rows (mapv (fn [idx]
                                                 (.getObject table-types idx))
                                               (map inc (range (.getColumnCount table-types-meta))))))))]
          [columns rows])))))

(defn- fast-active-tables
  "Required because we're calling our own custom private get-tables method to support Athena."
  [driver ^DatabaseMetaData metadata {:keys [catalog dbname]}]
  ;; TODO: Catch errors here so a single exception doesn't fail the entire schema
  ;; Also we're creating a set here, so even if we set "ProxyAPI", we'll miss dupe database names
  (with-open [rs (if catalog (.getSchemas metadata catalog "%") (.getSchemas metadata))]
    ;; it seems like `table_catalog` is ALWAYS `AwsDataCatalog`. `table_schem` seems to correspond to the Database name,
    ;; at least for stuff we create with the test data extensions?? :thinking_face:
    (let [all-schemas (set (cond->> (jdbc/metadata-result rs)
                             catalog (filter #(= (:table_catalog %) catalog))
                             dbname  (filter #(= (:table_schem %) dbname))))
          schemas     (set/difference all-schemas (sql-jdbc.sync/excluded-schemas driver))]
      (set (for [schema schemas
                 table  (get-tables metadata (:table_schem schema) (:table_catalog schema))]
             (let [remarks (:remarks table)]
               {:name        (:table_name table)
                :schema      (when-not dbname (:table_schem schema))
                :description (when-not (str/blank? remarks)
                               remarks)}))))))

(defmethod driver/describe-database* :athena
  [driver {details :details, :as database}]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [^Connection conn]
     (let [metadata (.getMetaData conn)]
       {:tables (fast-active-tables driver metadata details)}))))

(defmethod sql.qp/format-honeysql :athena
  [driver honeysql-form]
  (binding [driver/*compile-with-inline-parameters* true]
    ((get-method sql.qp/format-honeysql :sql) driver honeysql-form)))

(defmethod driver/execute-reducible-query :athena
  [driver query context respond]
  (assert (empty? (get-in query [:native :params]))
          "Athena queries should not be parameterized; they should have been compiled with metabase.driver/*compile-with-inline-parameters*")
  ((get-method driver/execute-reducible-query :sql-jdbc) driver query context respond))

(defmethod driver/llm-sql-dialect-resource :athena [_]
  "llm/prompts/dialects/athena.md")
