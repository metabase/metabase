(ns metabase.driver.bigquery-cloud-sdk
  (:require
   [clojure.core.async :as a]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.driver.bigquery-cloud-sdk.params :as bigquery.params]
   [metabase.driver.bigquery-cloud-sdk.query-processor :as bigquery.qp]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sync :as driver.s]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentList)
   (com.google.api.gax.rpc FixedHeaderProvider)
   (com.google.cloud.bigquery
    BigQuery
    BigQuery$DatasetListOption
    BigQuery$JobOption
    BigQuery$TableDataListOption
    BigQuery$TableOption
    BigQueryException
    BigQueryOptions
    Dataset
    Field
    Field$Mode
    FieldValue
    FieldValueList
    QueryJobConfiguration
    Schema
    Table
    TableDefinition$Type
    TableId
    TableResult)
   (com.google.common.collect ImmutableMap)
   (java.util Iterator)))

(set! *warn-on-reflection* true)

(driver/register! :bigquery-cloud-sdk, :parent :sql)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Client                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^PersistentList bigquery-scopes
  "The scopes to use for executing BigQuery requests; see:
  `https://cloud.google.com/bigquery/docs/samples/bigquery-auth-drive-scope`.
  Unclear if this can be sourced from the `com.google.cloud.bigquery` package directly.  We use the standard bigquery
  scope, as well as the drive scope (allowing for configured Drive external tables to be queried, as per
  `https://cloud.google.com/bigquery/external-data-drive`)."
  '("https://www.googleapis.com/auth/bigquery"
    "https://www.googleapis.com/auth/drive"))

(mu/defn- database-details->client
  ^BigQuery [details :- :map]
  (let [creds   (bigquery.common/database-details->service-account-credential details)
        mb-version (:tag driver-api/mb-version-info)
        run-mode   (name driver-api/run-mode)
        user-agent (format "Metabase/%s (GPN:Metabase; %s)" mb-version run-mode)
        header-provider (FixedHeaderProvider/create
                         (ImmutableMap/of "user-agent" user-agent))
        bq-bldr (doto (BigQueryOptions/newBuilder)
                  (.setCredentials (.createScoped creds bigquery-scopes))
                  (.setHeaderProvider header-provider))]
    (when-let [host (not-empty (:host details))]
      (.setHost bq-bldr host))
    (.. bq-bldr build getService)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Transducing Query Results                                              |
;;; +----------------------------------------------------------------------------------------------------------------+
(def ^:private ^:dynamic *page-callback*
  "Callback to execute when a new page is retrieved, used for testing"
  (constantly nil))

(defn- values-iterator ^Iterator [^TableResult page]
  (.iterator (.getValues page)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Sync                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- get-project-id
  [{:keys [project-id] :as details}]
  (or project-id (bigquery.common/database-details->credential-project-id details)))

(defn- list-datasets
  "Fetch all datasets given database `details`, applying dataset filters if specified."
  [{:keys [dataset-filters-type dataset-filters-patterns] :as details} & {:keys [logging-schema-exclusions?]}]
  (let [client (database-details->client details)
        project-id (get-project-id details)
        datasets (.listDatasets client project-id (u/varargs BigQuery$DatasetListOption))
        inclusion-patterns (when (= "inclusion" dataset-filters-type) dataset-filters-patterns)
        exclusion-patterns (when (= "exclusion" dataset-filters-type) dataset-filters-patterns)]
    (for [^Dataset dataset (.iterateAll datasets)
          :let [dataset-id (.. dataset getDatasetId getDataset)]
          :when ((if logging-schema-exclusions?
                   sql-jdbc.describe-database/include-schema-logging-exclusion
                   driver.s/include-schema?) inclusion-patterns
                                             exclusion-patterns
                                             dataset-id)]
      dataset-id)))

(defmethod driver/can-connect? :bigquery-cloud-sdk
  [_ details]
  ;; check whether we can connect by seeing whether listing datasets succeeds
  (let [[success? datasets] (try [true (list-datasets details)]
                                 (catch Exception e
                                   (log/error e "Exception caught in :bigquery-cloud-sdk can-connect?")
                                   [false nil]))]
    (cond
      (not success?)
      false
      ;; if the datasets are filtered and we don't find any matches, throw an exception with a message that we can show
      ;; to the user
      (and (not= (:dataset-filters-type details) "all")
           (nil? (first datasets)))
      (throw (Exception. (tru "Looks like we cannot find any matching datasets.")))
      :else
      true)))

(def ^:private empty-table-options
  (u/varargs BigQuery$TableOption))

(mu/defn- get-table :- (driver-api/instance-of-class Table)
  (^Table [{{:keys [project-id]} :details, :as database} dataset-id table-id]
   (get-table (database-details->client (:details database)) project-id dataset-id table-id))

  (^Table [^BigQuery client :- (driver-api/instance-of-class BigQuery)
           project-id       :- [:maybe driver-api/schema.common.non-blank-string]
           dataset-id       :- driver-api/schema.common.non-blank-string
           table-id         :- driver-api/schema.common.non-blank-string]
   (if project-id
     (.getTable client (TableId/of project-id dataset-id table-id) empty-table-options)
     (.getTable client dataset-id table-id empty-table-options))))

(declare ^:dynamic *process-native*)

(defn- information-schema-table [project-id dataset-id table]
  (keyword (format "%s.%s.INFORMATION_SCHEMA.%s" project-id dataset-id table)))

(defn- query-honeysql
  "Query database with honeysql. Returns rows as maps with column names"
  [driver database honeysql-form]
  (let [[sql & params] (sql.qp/format-honeysql
                        driver
                        honeysql-form)]

    (*process-native*
     (fn [cols results]
       (let [col-names (map (comp keyword :name) (:cols cols))]
         (eduction (map #(zipmap col-names %)) results)))
     database
     sql
     params
     nil)))

(defn- describe-database-tables
  [driver database]
  (let [project-id (get-project-id (:details database))
        query-dataset (fn [dataset-id]
                        (query-honeysql
                         driver
                         database
                         {:select [:table_name :table_type
                                   [{:select [[[:= :option_value "true"]]]
                                     :from [[(information-schema-table project-id dataset-id "TABLE_OPTIONS") :o]]
                                     :where [:and
                                             [:= :o.table_name :t.table_name]
                                             [:= :o.option_name "require_partition_filter"]]}
                                    :require_partition_filter]]
                          :from [[(information-schema-table project-id dataset-id "TABLES") :t]]}))
        table-info (fn [dataset-id {table-name :table_name table-type :table_type require-partition-filter :require_partition_filter}]
                     {:schema dataset-id
                      :name table-name
                      :database_require_filter
                      (boolean (and
                                ;; Materialized views can be partitioned, and whether the view require a filter or not is based
                                ;; on the base table it selects from, without parsing the view query we can't find out the base table,
                                ;; thus we can't know whether the view require a filter or not.
                                ;; Maybe this is something we can do once we can parse sql
                                (= "BASE TABLE" table-type)
                                require-partition-filter))})]
    (->> (list-datasets (:details database) :logging-schema-exclusions? true)
         (eduction (mapcat (fn [dataset-id] (eduction (map #(table-info dataset-id %)) (query-dataset dataset-id))))))))

(defmethod driver/describe-database :bigquery-cloud-sdk
  [driver database]
  {:tables (into #{} (describe-database-tables driver database))})

(defn- database-type->base-type
  [database-type]
  (case database-type
    "ARRAY"      :type/Array
    "BOOLEAN"    :type/Boolean
    "FLOAT"      :type/Float
    "INTEGER"    :type/Integer
    "RECORD"     :type/Dictionary ; RECORD -> field has a nested schema
    "STRING"     :type/Text
    "DATE"       :type/Date
    "DATETIME"   :type/DateTime
    "TIMESTAMP"  :type/DateTimeWithLocalTZ
    "TIME"       :type/Time
    "JSON"       :type/JSON
    "NUMERIC"    :type/Decimal
    "BIGNUMERIC" :type/Decimal
    :type/*))

(defn- field->database+base-type
  "Returns a normalized `database-type` and its `base-type` for a type from BigQuery Field type.

   In BQ, an ARRAY of INTEGER has \"REPEATED\" as the mode, and \"INTEGER\" as the type name."
  [^Field field]
  (let [field-type (.. field getType name)
        field-mode (.getMode field)
        database-type (if (= Field$Mode/REPEATED field-mode)
                        "ARRAY"
                        field-type)]
    [database-type (database-type->base-type database-type)]))

(defn- raw-type->database+base-type
  "Returns a normalized `database-type` and its `base-type` for a type from `INFORMATION_SCHEMA.COLUMNS.data_type`."
  [raw-data-type]
  (let [database-type (cond
                        (str/starts-with? raw-data-type "ARRAY") "ARRAY" ;; ARRAY<INT64>
                        (str/starts-with? raw-data-type "STRUCT") "RECORD" ;; STRUCT<INT64, FLOAT64>
                        (str/starts-with? raw-data-type "INT") "INTEGER" ;; INT64
                        (str/starts-with? raw-data-type "FLOAT") "FLOAT" ;; FLOAT 64
                        (str/starts-with? raw-data-type "STRING") "STRING" ;; STRING(255)
                        (str/starts-with? raw-data-type "BYTES") "BYTES" ;; BYTES(255)
                        (str/starts-with? raw-data-type "NUMERIC") "NUMERIC" ;; NUMERIC(255)
                        (str/starts-with? raw-data-type "BIGNUMERIC") "BIGNUMERIC" ;; BIGNUMERIC(255)
                        (= raw-data-type "BOOL") "BOOLEAN"
                        :else raw-data-type)]
    [database-type (database-type->base-type database-type)]))

(mu/defn- fields->metabase-field-info
  ([fields]
   (fields->metabase-field-info nil nil fields))
  ([database-position nfc-path fields]
   (into
    []
    (map
     (fn [[idx ^Field field]]
       (let [database-position (or database-position idx)
             field-name (.getName field)
             repeated? (= Field$Mode/REPEATED (.getMode field))
             [database-type base-type] (field->database+base-type field)]
         (into
          (cond-> {:name              field-name
                   :database-type     database-type
                   :base-type         base-type
                   :database-position database-position}
            nfc-path (assoc :nfc-path nfc-path)
            (and (not repeated?) (= :type/Dictionary base-type)) (assoc :nested-fields (set (fields->metabase-field-info
                                                                                             database-position
                                                                                             (conj (vec nfc-path) field-name)
                                                                                             (.getSubFields field)))))))))
    (m/indexed fields))))

(def ^:private partitioned-time-field-name
  "The name of pseudo-column for tables that are partitioned by ingestion time.
  See https://cloud.google.com/bigquery/docs/partitioned-tables#ingestion_time"
  "_PARTITIONTIME")

(def ^:private partitioned-date-field-name
  "This is also a pseudo-column, similiar to [[partitioned-time-field-name]].
  In fact _PARTITIONDATE is _PARTITIONTIME truncated to DATE.
  See https://cloud.google.com/bigquery/docs/querying-partitioned-tables#query_an_ingestion-time_partitioned_table"
  "_PARTITIONDATE")

(defn- get-nested-columns-for-tables
  "Returns nested columns for a specific set of tables"
  [driver database project-id dataset-id table-names]
  (let [results (try (query-honeysql
                      driver
                      database
                      {:select [:table_name :column_name :data_type :field_path]
                       :from [[(information-schema-table project-id dataset-id "COLUMN_FIELD_PATHS") :c]]
                       :where [:and
                               [:in :table_name table-names]
                               ;; we're only interested in nested fields
                               [:> [:strpos :field_path "."] 0]]})
                     (catch Throwable e
                       (log/warnf e "error in get-nested-columns-for-tables for dataset: %s" dataset-id)))
        nested-column-info (fn [{data-type :data_type field-path-str :field_path table-name :table_name}]
                             (let [field-path (str/split field-path-str #"\.")
                                   [database-type base-type] (raw-type->database+base-type data-type)]
                               (when-let [nfc-path (not-empty (pop field-path))]
                                 {:name (peek field-path)
                                  :table-name table-name
                                  :table-schema dataset-id
                                  :database-type database-type
                                  :base-type base-type
                                  :nfc-path nfc-path})))]
    (transduce
     (keep nested-column-info)
     (completing
      (fn [accum col]
        (update accum (:nfc-path col) (fnil conj []) col)))
     {}
     results)))

(defn- maybe-add-nested-fields [nested-column-lookup col nfc-path root-database-position]
  (let [new-path (conj (or nfc-path []) (:name col))
        nested-fields (get nested-column-lookup new-path)]
    (cond-> (assoc col :database-position root-database-position)
      (and (= :type/Dictionary (:base-type col)) nested-fields)
      (assoc :nested-fields (into #{}
                                  (map #(maybe-add-nested-fields nested-column-lookup % new-path root-database-position))
                                  nested-fields)
             :visibility-type :details-only))))

(defn- describe-dataset-rows [nested-column-lookup dataset-id table-name table-rows]
  (let [max-position (transduce (keep :ordinal_position) max -1 table-rows)]
    (mapcat
     (fn [{column-name :column_name
           data-type :data_type
           database-position :ordinal_position
           partitioned? :partitioned}]
       (let [database-position (or (some-> database-position dec) max-position)
             [database-type base-type] (raw-type->database+base-type data-type)]
         (cond-> [(maybe-add-nested-fields
                   nested-column-lookup
                   {:name column-name
                    :table-name table-name
                    :table-schema dataset-id
                    :database-type database-type
                    :base-type base-type
                    :database-partitioned partitioned?
                    :database-position database-position}
                   nil
                   database-position)]
           ;; _PARTITIONDATE does not appear so add it in if we see _PARTITIONTIME
           (= column-name partitioned-time-field-name)
           (conj {:name partitioned-date-field-name
                  :table-name table-name
                  :table-schema dataset-id
                  :database-type "DATE"
                  :base-type :type/Date
                  :database-position (inc database-position)
                  :database-partitioned true}))))
     table-rows)))

(defn- describe-dataset-fields-reducible
  [driver database project-id dataset-id table-names]
  (assert (seq table-names))
  (let [named-rows-query {:select [:table_name :column_name :data_type :ordinal_position
                                   [[:= :is_partitioning_column "YES"] :partitioned]]
                          :from [[(information-schema-table project-id dataset-id "COLUMNS") :c]]
                          :where [:in :table_name table-names]
                          :order-by [:table_name]}
        named-rows (try (query-honeysql driver database named-rows-query)
                        (catch Throwable e
                          (log/warnf e "error in describe-fields for dataset: %s" dataset-id)))
        nested-column-lookup (get-nested-columns-for-tables driver database project-id dataset-id table-names)]
    (eduction
     (partition-by :table_name)
     (mapcat (fn [table-rows]
               (let [table-name (:table_name (first table-rows))]
                 (->> (describe-dataset-rows nested-column-lookup dataset-id table-name table-rows)
                      (sort-by (juxt :table-name :database-position :name))))))
     named-rows)))

;; we redef this in a test, don't make `^:const`!
(def ^:private num-table-partitions
  "Number of tables to batch for describe-fields. Too low and we'll do too many queries, which is slow.
   Too high and we'll hold too many fields of a dataset in memory, which risks causing OOMs."
  1024)

(defn- list-table-names [driver database project-id dataset-id]
  (try
    (eduction (map :table_name)
              (query-honeysql driver database
                              {:select [:table_name]
                               :from [[(information-schema-table project-id dataset-id "TABLES") :t]]
                               :order-by [:table_name]}))
    (catch Throwable e
      (log/warnf e "error in list-table-names for dataset: %s" dataset-id))))

(defmethod driver/describe-fields :bigquery-cloud-sdk
  [driver database & {:keys [schema-names table-names]}]
  (let [project-id (get-project-id (:details database))
        dataset-ids (or schema-names (list-datasets (:details database)))]

    ;; The contract of [[driver/describe-fields]] requires results ordered by:
    ;; `table-schema`, `table-name`, `database-position`
    ;;
    ;; To build an efficient eduction without realizing all results in memory for sorting,
    ;; we must ensure ordering at each level of composition of the partitioned eduction:
    ;; 1. Sort `dataset-ids` at the outer level
    ;; 2. For `table-names` within each dataset:
    ;;    - If provided via `:table-names` arg, eagerly sort them here
    ;;    - If retrieved via [[list-table-names]], they're already sorted by the `:order-by` in the query
    ;; 3. The inner query in [[[describe-dataset-fields-reducible]] preserves ordering of the batch
    ;;    by `table-name`, and ordering of `database-position` with a final eager `sort-by` over the fully
    ;;    realized collection

    (eduction
     (mapcat (fn [dataset-id]
               (let [table-names (or (seq (sort table-names)) (list-table-names driver database project-id dataset-id))]
                 (eduction
                  (partition-all num-table-partitions)
                  (mapcat #(describe-dataset-fields-reducible driver database project-id dataset-id %))
                  table-names))))
     (sort dataset-ids))))

(defn- get-field-parsers [^Schema schema]
  (let [default-parser (get-method bigquery.qp/parse-result-of-type :default)]
    (into []
          (map (fn [^Field field]
                 (let [column-type (.. field getType name)
                       column-mode (.getMode field)
                       method      (get-method bigquery.qp/parse-result-of-type column-type)]
                   (when (= method default-parser)
                     (let [column-name (.getName field)]
                       (log/warnf "Warning: missing type mapping for parsing BigQuery results column %s of type %s."
                                  column-name column-type)))
                   (partial method column-type column-mode bigquery.common/*bigquery-timezone-id* field))))
          (.getFields schema))))

(defn- parse-field-value [^FieldValue cell parser]
  (when-let [v (.getValue cell)]
    ;; There is a weird error where everything that *should* be NULL comes back as an Object.
    ;; See https://jira.talendforge.org/browse/TBD-1592
    ;; Everything else comes back as a String luckily so we can proceed normally.
    (when-not (= (class v) Object)
      (parser v))))

(defn- extract-fingerprint [field-idxs parsers ^FieldValueList values]
  (map (fn [^Integer idx parser]
         (parse-field-value (.get values idx) parser))
       field-idxs parsers))

(declare reducible-bigquery-results)

(defn- sample-table
  "Process a sample of rows of fields corresponding to the Metabase fields
  `fields` from the BigQuery table `bq-table` using the query result reducing
  function `rff`.

  `.getSchema` returns nil if called on the result of `.list`, so we have to
  match fields by position. Here it is assumed that :database_position in
  `fields` represents the positions of the columns in the BigQuery table and
  that `.list` returns the fields in that order. The first assumption could be
  lifted by matching the names in `fields` to the names in the table schema."
  [^Table bq-table fields rff]
  (let [field-idxs  (mapv :database_position fields)
        all-parsers (get-field-parsers (.. bq-table getDefinition getSchema))
        parsers     (mapv all-parsers field-idxs)
        page        (.list bq-table (u/varargs BigQuery$TableDataListOption))]
    (transduce
     (comp (take table-rows-sample/max-sample-rows)
           (map (partial extract-fingerprint field-idxs parsers)))
      ;; Instead of passing on fields, we could recalculate the
      ;; metadata from the schema, but that probably makes no
      ;; difference and currently the metadata is ignored anyway.
     (rff {:cols fields})
     (reducible-bigquery-results page nil (constantly nil)))))

(defn- ingestion-time-partitioned-table?
  [table-id]
  (t2/exists? :model/Field :table_id table-id :name partitioned-time-field-name :database_partitioned true :active true))

(defmethod driver/table-rows-sample :bigquery-cloud-sdk
  [driver {table-name :name, dataset-id :schema :as table} fields rff opts]
  (let [database (driver-api/table->database table)
        bq-table (get-table database dataset-id table-name)]
    (if (or (#{TableDefinition$Type/MATERIALIZED_VIEW TableDefinition$Type/VIEW
               ;; We couldn't easily test if the following two can show up as
               ;; tables and if `.list` is supported for them, so they are here
               ;; to make sure we don't break existing instances.
               TableDefinition$Type/EXTERNAL TableDefinition$Type/SNAPSHOT}
             (.. bq-table getDefinition getType))
            ;; if the table is partitioned by ingestion time, using .list or .listTableData won't return values for
            ;; the _PARTITIONTIME field, so we need to fall back to using sql
            (ingestion-time-partitioned-table? (:id table)))
      (do (log/debugf "%s.%s is a view or a table partitioned by ingestion time, so we cannot use the list API; falling back to regular query"
                      dataset-id table-name)
          ((get-method driver/table-rows-sample :sql-jdbc) driver table fields rff opts))
      (sample-table bq-table fields rff))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Running Queries                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; BigQuery Execution
;;; 1. `execute-reducible-query`
;;;     - Is given the `respond` callback which is ultimately what the QP is waiting for.
;;;     - Sets timezone based on queried DB
;;;     - Adds remarks to sql.
;;;     - Execution passes to `*process-native*`
;;; 2. `*process-native*`
;;;     - Responsible for retrying queries that BigQuery tells us to retry
;;;     - Execution passes to `execute-bigquery`
;;; 3. `execute-bigquery`
;;;     - Makes the initial query and checks `cancel-chan` in case the browser cancels execution.
;;;     - Either throws approriate exceptions or takes the initial page `TableResult` to the next step.
;;;     - Execution passes to `execute-bigquery`
;;; 4. `bigquery-execute-response`
;;;     - Builds `cols` metadata response.
;;;     - Builds an `eduction` around the `TableResult` page using `reducible-bigquery-results`
;;;     - Calls `respond`
;;;
;;; The stack unwinds here, but the `reducible-bigquery-results` passed to `respond` *still* has references to the `TableResult`.
;;; As the result is reduced within the QP, `(.next it)` `(.getNextPage page)`  will be called to produce the next values for `rf`.
;;;
;;; So it is important to think of getting all the results out of BQ in two parts:
;;; 1. The initial query done by `execute-bigquery` where the `.query` call can be shortcircuited by `cancel-chan`.
;;; 2. The "lazy" iteration of `TableResult` done by the QP. Any exceptions, or `cancel-chan` checking will be done in the context of the pipeline, solely around the code in `reducible-bigquery-results`.

(def ^:private ^:dynamic ^Long *page-size*
  "Maximum number of rows to return per page in a query. Leave unset (i.e. falling to the library default) by default,
  but override for testing."
  nil)

(defn- throw-invalid-query [e sql parameters]
  (throw (ex-info (tru "Error executing query: {0}" (ex-message e))
                  {:type driver-api/qp.error-type.invalid-query, :sql sql, :parameters parameters}
                  e)))

(defn- throw-cancelled [sql parameters]
  (throw (ex-info (tru "Query cancelled")
                  {:sql sql :parameters parameters})))

(defn- handle-bigquery-exception [^Throwable t ^String sql parameters]
  (condp instance? t
    java.util.concurrent.CancellationException
    (throw-cancelled sql parameters)

    BigQueryException
    (let [bqe ^BigQueryException t]
      (if (.isRetryable bqe)
        (throw (ex-info (tru "BigQueryException executing query")
                        {:retryable? (.isRetryable bqe)
                         :sql        sql
                         :parameters parameters}
                        bqe))
        (throw-invalid-query bqe sql parameters)))

    Throwable
    (throw-invalid-query t sql parameters)))

(defn- effective-query-timezone-id [database]
  (if (get-in database [:details :use-jvm-timezone])
    (driver-api/system-timezone-id)
    "UTC"))

(defn- build-bigquery-request [^String sql parameters]
  (.build
   (doto (QueryJobConfiguration/newBuilder sql)
      ;; if the query contains a `#legacySQL` directive then use legacy SQL instead of standard SQL
     (.setUseLegacySql (str/includes? (u/lower-case-en sql) "#legacysql"))
     (bigquery.params/set-parameters! parameters)
      ;; .setMaxResults is very misleading; it's actually the page size, and it only takes
      ;; effect for RPC (a.k.a. "fast") calls
      ;; there is no equivalent of .setMaxRows on a JDBC Statement; we rely on our middleware to stop
      ;; realizing more rows as per the maximum result size
     (.setMaxResults *page-size*))))

(defn- reducible-bigquery-results
  [^TableResult page cancel-chan attempt-job-cancel-fn]
  (reify
    clojure.lang.IReduceInit
    (reduce [_ rf init]
      ;; TODO: Once we're confident that the memory/thread leaks in BigQuery are resolved, we can remove some of this
      ;; logging, and certainly remove the `n` counter.
      ;; NOTE: Page can be nil in various situations, some are understood (early cancel) and some are not. (#47339)
      (try
        (loop [^TableResult page page
               it                (some-> page values-iterator)
               acc               init
               n                 0]
          (cond
            ;; Early exit. This happens in middleware/limit `(take max)`
            (reduced? acc)
            (do (log/tracef "BigQuery: Early exit from reducer after %d rows" n)
                (attempt-job-cancel-fn)
                (unreduced acc))

            ;; While middleware is processing rows, check for browser initiated cancel.
            (some-> cancel-chan a/poll!)
            (throw (ex-info (tru "Query cancelled") {:page n}))

            ;; Clear to send: if there's more in `it`, then send it and recur.
            (some-> it .hasNext)
            (let [acc' (try
                         (rf acc (.next it))
                         (catch Throwable e
                           (log/errorf e "error in reducible-bigquery-results! %d rows" n)
                           (throw e)))]
              (recur page it acc' (inc n)))

            ;; This page is exhausted - check for another page and keep processing.
            (some-> page .hasNextPage)
            (let [_        (log/tracef "BigQuery: Fetching new page after %d rows" n)
                  _        (*page-callback*)
                  new-page (.getNextPage page)]
              (if-let [new-iter (some-> new-page values-iterator)]
                (do
                  (log/trace "BigQuery: New page returned")
                  (recur new-page new-iter acc (inc n)))
                (throw (ex-info "Cannot get next page from BigQuery" {:page n}))))

            ;; All pages exhausted, so just return.
            :else
            (do (log/tracef "BigQuery: All rows consumed (%d)" n)
                acc)))
        (catch Throwable t
          (attempt-job-cancel-fn)
          (throw t))))))

(defn- bigquery-execute-response
  "Given the initial query page, respond with metadata and a lazy reducible that will page through the rest of the data."
  [^TableResult page ^BigQuery client respond cancel-chan]
  (let [job-id (.getJobId page)
        attempt-job-cancel-fn #(try
                                 (.cancel client job-id)
                                 (catch Throwable e
                                   ;; Just log exception if it can't be cancelled.
                                   (log/debugf e "Could not cancel job-id: %s" job-id)))
        ^Schema schema (some-> page .getSchema)
        parsers (some-> schema get-field-parsers)
        columns (for [column (some-> schema .getFields fields->metabase-field-info)]
                  (-> column
                      (set/rename-keys {:base-type :base_type})
                      (dissoc :database-type :database-position)))
        cols {:cols columns}
        results (eduction (map (fn [^FieldValueList row]
                                 (mapv parse-field-value row parsers)))
                          (reducible-bigquery-results page cancel-chan attempt-job-cancel-fn))]
    (respond cols results)))

(defn- execute-bigquery
  [respond database-details ^String sql parameters cancel-chan]
  {:pre [(not (str/blank? sql))]}
  ;; Kicking off two async jobs:
  ;; - Waiting for the cancel-chan to get either a cancel message or to be closed.
  ;; - Running the BigQuery execution in another thread, since it's blocking.
  (let [^BigQuery client (database-details->client database-details)
        result-promise (promise)
        request (build-bigquery-request sql parameters)
        query-future (future
                       ;; ensure the classloader is available within the future.
                       (driver-api/the-classloader)
                       (try
                         (*page-callback*)
                         (if-let [result (.query client request (u/varargs BigQuery$JobOption))]
                           (deliver result-promise [:ready result])
                           (throw (ex-info "Null response from query" {})))
                         (catch Throwable t
                           (deliver result-promise [:error t]))))]

    ;; This `go` is responsible for cancelling the *initial* .query call.
    ;; Future pages may still not be fetched and so the reducer needs to check `cancel-chan` as well.
    (when cancel-chan
      (a/go
        (when-let [cancelled (a/<! cancel-chan)]
          (deliver result-promise [:cancel cancelled])
          (some-> query-future future-cancel))))

    ;; Now block the original thread on that promise.
    ;; It will receive either [:ready [& respond-args]], [:error Throwable], or [:cancel truthy].
    (let [[status result] @result-promise]
      (case status
        :error  (handle-bigquery-exception result sql parameters)
        :cancel (throw-cancelled sql parameters)
        :ready  (bigquery-execute-response result client respond cancel-chan)))))

(mu/defn- ^:dynamic *process-native*
  [respond  :- fn?
   database :- [:map [:details :map]]
   sql
   parameters
   cancel-chan]
  {:pre [(map? database) (map? (:details database))]}
  ;; automatically retry the query if it times out or otherwise fails. This is on top of the auto-retry added by
  ;; `execute`
  (let [thunk (fn []
                (execute-bigquery
                 respond
                 (:details database)
                 sql
                 parameters
                 cancel-chan))]
    (try
      (thunk)
      (catch Throwable e
        (let [ex-data (u/all-ex-data e)]
          (if (:retryable? ex-data)
            (thunk)
            (throw e)))))))

(defmethod driver/execute-reducible-query :bigquery-cloud-sdk
  [_driver {{sql :query, :keys [params]} :native, :as outer-query} _context respond]
  (let [database (driver-api/database (driver-api/metadata-provider))]
    (binding [bigquery.common/*bigquery-timezone-id* (effective-query-timezone-id database)]
      (log/tracef "Running BigQuery query in %s timezone" bigquery.common/*bigquery-timezone-id*)
      (let [sql (if (get-in database [:details :include-user-id-and-hash] true)
                  (str "-- " (driver-api/query->remark :bigquery-cloud-sdk outer-query) "\n" sql)
                  sql)]
        (*process-native* respond database sql params (driver-api/canceled-chan))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Other Driver Method Impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(doseq [[feature supported?] {:convert-timezone         true
                              :describe-fields          true
                              :nested-fields            true
                              :datetime-diff            true
                              :expressions              true
                              :now                      true
                              :percentile-aggregations  true
                              :metadata/key-constraints false
                              :identifiers-with-spaces  true
                              :expressions/integer      true
                              :expressions/float        true
                              :expressions/date         true
                              :expressions/text         true
                              :split-part               true
                              ;; BigQuery uses timezone operators and arguments on calls like extract() and
                              ;; timezone_trunc() rather than literally using SET TIMEZONE, but we need to flag it as
                              ;; supporting set-timezone anyway so that reporting timezones are returned and used, and
                              ;; tests expect the converted values.
                              :set-timezone             true
                              :expression-literals      true
                              :database-routing         false}]
  (defmethod driver/database-supports? [:bigquery-cloud-sdk feature] [_driver _feature _db] supported?))

;; BigQuery is always in UTC
(defmethod driver/db-default-timezone :bigquery-cloud-sdk [_ _]
  "UTC")

(defmethod driver/db-start-of-week :bigquery-cloud-sdk
  [_]
  :sunday)

(defmethod driver/notify-database-updated :bigquery-cloud-sdk
  [_ database]
  (bigquery.common/populate-project-id-from-credentials! database))

(defn- convert-dataset-id-to-filters!
  "Converts a bigquery-cloud-sdk db-details having the outdated `dataset-id` connection parameter, into one where that
  same value is set as the (only) dataset inclusion filter pattern. Also updated model objects to reflect the new
  structure:

  * any associated Table instances will be updated to have schema set (to the dataset-id value)
  * the Database model itself will be updated to persist this change to db-details back to the app DB

  Returns the passed `database` parameter with the aformentioned changes having been made and persisted."
  [database dataset-id]
  (let [db-id (u/the-id database)]
    (log/infof "DB %s had hardcoded dataset-id; changing to an inclusion pattern and updating table schemas"
               (pr-str db-id))
    (try
      (t2/query-one {:update (t2/table-name :model/Table)
                     :set    {:schema dataset-id}
                     :where  [:and
                              [:= :db_id db-id]
                              [:or
                               [:= :schema nil]
                               [:not= :schema dataset-id]]]})
      ;; if we are upgrading to the sdk driver after having downgraded back to the old driver we end up with
      ;; duplicated tables with nil schema. Happily only in the "dataset-id" schema and not all schemas. But just
      ;; leave them with nil schemas and they will get deactivated in sync.
      (catch Exception _e))
    (let [updated-db (-> (assoc-in database [:details :dataset-filters-type] "inclusion")
                         (assoc-in [:details :dataset-filters-patterns] dataset-id)
                         (m/dissoc-in [:details :dataset-id]))]
      (t2/update! :model/Database db-id {:details (:details updated-db)})
      updated-db)))

;; TODO: THIS METHOD SHOULD NOT BE UPDATING THE APP-DB (which it does in [convert-dataset-id-to-filters!])
;; Issue: https://github.com/metabase/metabase/issues/39392
(defmethod driver/normalize-db-details :bigquery-cloud-sdk
  [_driver {:keys [details] :as database}]
  (when-not (empty? (filter some? ((juxt :auth-code :client-id :client-secret) details)))
    (log/errorf (str "Database ID %d, which was migrated from the legacy :bigquery driver to :bigquery-cloud-sdk, has"
                     " one or more OAuth style authentication scheme parameters saved to db-details, which cannot"
                     " be automatically migrated to the newer driver (since it *requires* service-account-json intead);"
                     " this database must therefore be updated by an administrator (by adding a service-account-json)"
                     " before sync and queries will work again")
                (u/the-id database)))
  (if-let [dataset-id (get details :dataset-id)]
    (when-not (str/blank? dataset-id)
      (convert-dataset-id-to-filters! database dataset-id))
    database))

(defmethod driver/prettify-native-form :bigquery-cloud-sdk
  [_ native-form]
  (sql.u/format-sql-and-fix-params :mysql native-form))
