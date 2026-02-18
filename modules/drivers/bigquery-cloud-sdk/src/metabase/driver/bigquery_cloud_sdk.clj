(ns metabase.driver.bigquery-cloud-sdk
  (:refer-clojure :exclude [mapv some empty? not-empty get-in])
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
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as driver.sql-jdbc]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.like-escape-char-built-in :as-alias like-escape-char-built-in]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv some empty? not-empty get-in]]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentList)
   (com.google.api.gax.rpc FixedHeaderProvider)
   (com.google.auth.oauth2 ImpersonatedCredentials ServiceAccountCredentials)
   (com.google.cloud Identity Role)
   (com.google.cloud.bigquery
    Acl Acl$Role Acl$User
    BigQuery
    BigQuery$DatasetDeleteOption
    BigQuery$DatasetListOption
    BigQuery$DatasetOption
    BigQuery$IAMOption
    BigQuery$JobOption
    BigQuery$QueryResultsOption
    BigQuery$TableDataListOption
    BigQuery$TableOption
    BigQueryException
    BigQueryOptions BigQueryOptions$Builder
    Dataset
    DatasetId DatasetInfo
    Field
    Field$Mode
    FieldValue
    FieldValueList
    InsertAllRequest
    InsertAllRequest$RowToInsert
    JobInfo
    QueryJobConfiguration
    Schema
    Table
    TableDefinition$Type
    TableId
    TableResult)
   (com.google.cloud.http HttpTransportOptions)
   (com.google.cloud.iam.admin.v1 IAMClient IAMSettings)
   (com.google.cloud.resourcemanager.v3 ProjectsClient ProjectsSettings)
   (com.google.common.collect ImmutableMap)
   (com.google.gson JsonParser)
   (com.google.iam.admin.v1 CreateServiceAccountRequest DeleteServiceAccountRequest ServiceAccount)
   (com.google.iam.v1 Binding Policy SetIamPolicyRequest GetIamPolicyRequest)
   (java.io ByteArrayInputStream)
   (java.util Iterator)))

(set! *warn-on-reflection* true)

(driver/register! :bigquery-cloud-sdk, :parent #{:sql
                                                 ::like-escape-char-built-in/like-escape-char-built-in})

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
  (let [base-creds   (bigquery.common/database-details->service-account-credential details)
        ;; Check if we should impersonate a different service account
        ;; ImpersonatedCredentials automatically refreshes tokens before expiration,
        ;; so the 1-hour lifetime is just the initial token validity period.
        ;; Each query creates a fresh client, and the credentials handle refresh internally.
        final-creds  (if-let [target-sa (:impersonate-service-account details)]
                       (do
                         (log/debugf "Creating impersonated credentials for service account: %s" target-sa)
                         (ImpersonatedCredentials/create
                          (.createScoped base-creds bigquery-scopes)
                          target-sa
                          nil  ;; delegates (not needed)
                          (java.util.ArrayList. bigquery-scopes)
                          3600))  ;; 1 hour token lifetime
                       (.createScoped base-creds bigquery-scopes))
        mb-version   (:tag driver-api/mb-version-info)
        run-mode     (name driver-api/run-mode)
        user-agent   (format "Metabase/%s (GPN:Metabase; %s)" mb-version run-mode)
        header-provider (FixedHeaderProvider/create
                         (ImmutableMap/of "user-agent" user-agent))
        read-timeout-ms driver.settings/*query-timeout-ms*
        transport-options (-> (HttpTransportOptions/newBuilder)
                              (.setReadTimeout read-timeout-ms)
                              (.build))
        bq-bldr      (doto (BigQueryOptions/newBuilder)
                       (.setCredentials final-creds)
                       (.setHeaderProvider header-provider)
                       (.setTransportOptions transport-options))]
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

(defn- get-table*
  [^BigQuery client project-id dataset-id table-id]
  (if project-id
    (.getTable client (TableId/of project-id dataset-id table-id) empty-table-options)
    (.getTable client dataset-id table-id empty-table-options)))

(mu/defn- get-table :- (driver-api/instance-of-class Table)
  (^Table [{{:keys [project-id]} :details, :as database} dataset-id table-id]
   (get-table (database-details->client (:details database)) project-id dataset-id table-id))

  (^Table [^BigQuery client :- (driver-api/instance-of-class BigQuery)
           project-id       :- [:maybe driver-api/schema.common.non-blank-string]
           dataset-id       :- driver-api/schema.common.non-blank-string
           table-id         :- driver-api/schema.common.non-blank-string]
   (get-table* client project-id dataset-id table-id)))

(defmethod driver/table-exists? :bigquery-cloud-sdk
  [_ {:keys [details] :as _database} {table-id :name, dataset-id :schema :as _table}]
  (let [client     (database-details->client details)
        project-id (get-project-id details)]
    (boolean
     (get-table* client project-id dataset-id table-id))))

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

(defmethod driver/describe-database* :bigquery-cloud-sdk
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

(defmulti ^:private type->database-type
  "Internal type->database-type multimethod for BigQuery that dispatches on type."
  {:arglists '([type])}
  identity)

;; we can't recover the parameterized types
(defmethod type->database-type :type/Array [_] [[:raw "JSON"]])
(defmethod type->database-type :type/Dictionary [_] [[:raw "JSON"]])

(defmethod type->database-type :type/Boolean [_] [[:raw "BOOL"]])
(defmethod type->database-type :type/Float [_] [[:raw "FLOAT64"]])
(defmethod type->database-type :type/Integer [_] [[:raw "INT"]])
(defmethod type->database-type :type/Number [_] [[:raw "INT"]])
(defmethod type->database-type :type/Text [_] [[:raw "STRING"]])
(defmethod type->database-type :type/TextLike [_] [[:raw "STRING"]])
(defmethod type->database-type :type/Date [_] [[:raw "DATE"]])
(defmethod type->database-type :type/DateTime [_] [[:raw "DATETIME"]])
(defmethod type->database-type :type/DateTimeWithTZ [_] [[:raw "TIMESTAMP"]])
(defmethod type->database-type :type/Time [_] [[:raw "TIME"]])
(defmethod type->database-type :type/JSON [_] [[:raw "JSON"]])
(defmethod type->database-type :type/SerializedJSON [_] [[:raw "JSON"]])
(defmethod type->database-type :type/Decimal [_] [[:raw "BIGDECIMAL"]])

(defmethod driver/type->database-type :bigquery-cloud-sdk
  [_driver base-type]
  (type->database-type base-type))

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
  "This is also a pseudo-column, similar to [[partitioned-time-field-name]].
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
        (update-in accum [(:table-name col) (:nfc-path col)] (fnil conj []) col)))
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
                 (->> (describe-dataset-rows (get nested-column-lookup table-name) dataset-id table-name table-rows)
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
;;;     - Either throws appropriate exceptions or takes the initial page `TableResult` to the next step.
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
        job (.create client (JobInfo/of request) (u/varargs BigQuery$JobOption))
        job-id (.getJobId job)
        query-future (future
                       ;; ensure the classloader is available within the future.
                       (driver-api/the-classloader)
                       (try
                         (*page-callback*)
                         (let [result-options (if *page-size* [(BigQuery$QueryResultsOption/pageSize *page-size*)] [])
                               result (.getQueryResults job (u/varargs BigQuery$QueryResultsOption result-options))]
                           (if result
                             (deliver result-promise [:ready result])
                             (throw (ex-info "Null response from query" {}))))
                         (catch Throwable t
                           (deliver result-promise [:error t]))))]

    ;; This `go` is responsible for cancelling the *initial* job execution.
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
        :cancel (try
                  (.cancel client job-id)
                  (catch Throwable t
                    (log/warnf t "Couldn't cancel job %s" job-id))
                  (finally
                    (throw-cancelled sql parameters)))
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
  ;; Apply any swapped connection details (e.g., for workspace isolation)
  (let [details (driver/maybe-swap-details (:id database) (:details database))
        thunk   (fn []
                  (execute-bigquery
                   respond
                   details
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

(doseq [[feature supported?] {:convert-timezone                 true
                              :create-or-replace-table          true
                              :database-routing                 true
                              :datetime-diff                    true
                              :describe-fields                  true
                              :expression-literals              true
                              :expressions                      true
                              :expressions/date                 true
                              :expressions/float                true
                              :expressions/integer              true
                              :expressions/text                 true
                              :identifiers-with-spaces          true
                              :metadata/key-constraints         false
                              :metadata/table-existence-check   true
                              :nested-fields                    true
                              :now                              true
                              :percentile-aggregations          true
                              :regex/lookaheads-and-lookbehinds false
                              ;; we can't support `alter table .. rename ..` in general since it won't work for
                              ;; streaming tables
                              :rename                           false
                              ;; BigQuery uses timezone operators and arguments on calls like extract() and
                              ;; timezone_trunc() rather than literally using SET TIMEZONE, but we need to flag it as
                              ;; supporting set-timezone anyway so that reporting timezones are returned and used, and
                              ;; tests expect the converted values.
                              :set-timezone                     true
                              :split-part                       true
                              :transforms/python                true
                              :transforms/table                 true
                              ;; Workspace isolation using service account impersonation
                              :workspace                        false}]
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

  Returns the passed `database` parameter with the aforementioned changes having been made and persisted."
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
                     " be automatically migrated to the newer driver (since it *requires* service-account-json instead);"
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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Transforms Support                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- get-table-str [table]
  (let [qn #(sql.u/quote-name :bigquery-cloud-sdk :table %)]
    (if (namespace table)
      (format "%s.%s" (qn (namespace table)) (qn (name table)))
      (qn (name table)))))

(defmethod driver/compile-transform :bigquery-cloud-sdk
  [_driver {:keys [query output-table]}]
  (let [{sql-query :query sql-params :params} query
        table-str (get-table-str output-table)]
    [(format "CREATE OR REPLACE TABLE %s AS %s" table-str sql-query)
     sql-params]))

(defmethod driver/compile-insert :bigquery-cloud-sdk
  [_driver {:keys [query output-table]}]
  (let [{sql-query :query sql-params :params} query
        table-str (get-table-str output-table)]
    [(format "INSERT INTO %s %s" table-str sql-query)
     sql-params]))

(defmethod driver/compile-drop-table :bigquery-cloud-sdk
  [_driver table]
  (let [table-str (get-table-str table)]
    [(str "DROP TABLE IF EXISTS " table-str)]))

(defmethod driver/create-table! :bigquery-cloud-sdk
  [driver database-id table-name column-definitions & {:keys [primary-key]}]
  (let [sql (#'driver.sql-jdbc/create-table!-sql driver table-name column-definitions :primary-key primary-key)]
    (driver/execute-raw-queries! driver (t2/select-one :model/Database database-id) [sql])))

(defmethod driver/drop-table! :bigquery-cloud-sdk
  [driver database-id table-name]
  (let [sql (driver/compile-drop-table driver table-name)]
    (driver/execute-raw-queries! driver (t2/select-one :model/Database database-id) [sql])))

(defn- convert-value-for-insertion
  [base-type value]
  (condp #(isa? %2 %1) base-type
    :type/JSON
    (.toString (JsonParser/parseString value))

    :type/Dictionary
    (JsonParser/parseString value)

    :type/Array
    (JsonParser/parseString value)

    :type/Integer
    (parse-long value)

    :type/Float
    (parse-double value)

    :type/Boolean
    (parse-boolean value)

    :type/Numeric
    (bigdec value)

    :type/Decimal
    (bigdec value)

    :type/Date
    (u.date/format (u.date/parse value))

    :type/DateTime
    (u.date/format :iso-local-date-time (u.date/parse value))

    :type/DateTimeWithLocalTZ
    (u.date/format (u.date/parse value))

    value))

(defmethod driver/insert-col->val [:bigquery-cloud-sdk :jsonl-file]
  [_driver _ column-def v]
  (if (string? v)
    (convert-value-for-insertion (:type column-def) v)
    v))

(defmethod driver/insert-from-source! [:bigquery-cloud-sdk :rows]
  [_driver db-id {table-name :name :keys [columns]} {:keys [data]}]
  (let [col-names (map :name columns)
        {:keys [details]} (t2/select-one :model/Database db-id)

        client (database-details->client details)
        project-id (get-project-id details)

        dataset-id (namespace table-name)
        table-name (name table-name)

        table-id (.getTableId (get-table client project-id dataset-id table-name))

        prepared-rows (map #(into {} (map vector col-names %)) data)]
    (doseq [chunk (partition-all (or driver/*insert-chunk-rows* 1000) prepared-rows)]
      (let [insert-request-builder (InsertAllRequest/newBuilder table-id)]
        (doseq [^java.util.Map row chunk]
          (.addRow insert-request-builder (InsertAllRequest$RowToInsert/of row)))
        (let [insert-request (.build insert-request-builder)
              response (.insertAll client insert-request)]
          (when (.hasErrors response)
            (let [errors (.getInsertErrors response)]
              (throw (ex-info "BigQuery insert failed"
                              {:errors (into [] (map str errors))})))))))))

(defmethod driver/execute-raw-queries! :bigquery-cloud-sdk
  [_driver connection-details queries]
  ;; connection-details is either database details directly (from transforms)
  ;; or a database map with :details key (from other contexts)
  (let [details (get connection-details :details connection-details)
        client (database-details->client details)]
    (try
      (doall
       (for [query queries]
         (let [[sql params] (if (string? query) [query] query)
               _ (log/debugf "Executing BigQuery DDL: %s" sql)
               job-config (-> (QueryJobConfiguration/newBuilder sql)
                              (bigquery.params/set-parameters! params)
                              (.setUseLegacySql false)
                              (.build))
               table-result (.query client job-config (into-array BigQuery$JobOption []))]
           (or (and table-result (.getTotalRows table-result))
               0))))
      (catch Exception e
        (log/error e "Error executing BigQuery DDL")
        (throw e)))))

(defmethod driver/drop-transform-target! [:bigquery-cloud-sdk :table]
  [driver database {:keys [name schema] :as _target}]
  (let [qualified-name (if schema
                         (keyword schema name)
                         (keyword name))
        drop-sql (first (driver/compile-drop-table driver qualified-name))]
    (driver/execute-raw-queries! driver database [drop-sql])
    nil))

(defmethod driver/connection-spec :bigquery-cloud-sdk
  [_driver database]
  ;; Return the database details directly since we don't use a JDBC spec for bigquery
  (driver/maybe-swap-details (:id database) (:details database)))

(defmethod driver.sql/default-schema :bigquery-cloud-sdk
  [_]
  nil)

(defmethod driver/create-schema-if-needed! :bigquery-cloud-sdk
  [driver conn-spec schema]
  ;; Check if dataset exists using the BigQuery API before trying to create.
  ;; This is important for workspace isolation where the impersonated SA has
  ;; access to an existing isolated dataset but cannot create new datasets.
  (let [details    (get conn-spec :details conn-spec)
        client     (database-details->client details)
        project-id (get-project-id details)
        dataset-id (DatasetId/of project-id schema)]
    (when-not (.getDataset client dataset-id (u/varargs BigQuery$DatasetOption))
      ;; Dataset doesn't exist, try to create it
      (let [sql [[(format "CREATE SCHEMA IF NOT EXISTS `%s`;" schema)]]]
        (driver/execute-raw-queries! driver conn-spec sql)))))

(defmethod driver/schema-exists? :bigquery-cloud-sdk
  [_driver db-id schema]
  (driver-api/with-metadata-provider db-id
    (->> (driver-api/metadata-provider)
         driver-api/database
         :details
         list-datasets
         (some #{schema}))))

(defmethod driver/table-name-length-limit :bigquery-cloud-sdk
  [_driver]
  ;; https://cloud.google.com/bigquery/docs/tables
  1024)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Workspace Isolation                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; BigQuery workspace isolation uses service account impersonation instead of SQL GRANT statements.
;;; Each workspace gets its own service account (created automatically) with table-level read permissions.
;;;
;;; Required GCP setup for the main service account:
;;; - Roles: `roles/bigquery.admin`, `roles/iam.serviceAccountAdmin`, `roles/resourcemanager.projectIamAdmin`
;;; - APIs: `bigquery.googleapis.com`, `iam.googleapis.com`, `cloudresourcemanager.googleapis.com`

(defn- ws-service-account-credentials
  "Parse ServiceAccountCredentials from database details."
  ^ServiceAccountCredentials [{:keys [service-account-json]}]
  (ServiceAccountCredentials/fromStream
   (ByteArrayInputStream. (.getBytes ^String service-account-json))))

(defn- ws-database-details->client
  "Create a BigQuery client from database details for workspace isolation."
  ^BigQuery [details]
  (let [creds (.createScoped (ws-service-account-credentials details)
                             (doto (java.util.ArrayList.)
                               (.add "https://www.googleapis.com/auth/bigquery")))]
    (-> (BigQueryOptions/newBuilder)
        ^BigQueryOptions$Builder (.setCredentials creds)
        ^BigQueryOptions (.build)
        (.getService))))

(defn- ws-database-details->iam-client
  "Create an IAM Admin client from database details."
  ^IAMClient [details]
  (let [creds (.createScoped (ws-service-account-credentials details)
                             (doto (java.util.ArrayList.)
                               (.add "https://www.googleapis.com/auth/cloud-platform")))]
    (IAMClient/create
     (-> (IAMSettings/newBuilder)
         (.setCredentialsProvider (reify com.google.api.gax.core.CredentialsProvider
                                    (getCredentials [_] creds)))
         ^IAMSettings (.build)))))

(defn- ws-service-account-id
  "Generate the service account ID for a workspace (max 30 chars, lowercase, alphanumeric + hyphens)."
  [workspace]
  ;; Format: mb-ws-{workspace-id} truncated to 30 chars
  (let [ws-id (str (:id workspace))
        sa-id (str "mb-ws-" ws-id)]
    (-> sa-id
        (subs 0 (min 30 (count sa-id)))
        u/lower-case-en)))

(defn- ws-service-account-exists?
  "Check if a service account exists."
  [^IAMClient iam-client ^String project-id ^String sa-email]
  (try
    (.getServiceAccount iam-client (format "projects/%s/serviceAccounts/%s" project-id sa-email))
    true
    (catch com.google.api.gax.rpc.NotFoundException _
      false)))

(defn- ws-create-service-account!
  "Create a service account for a workspace if it doesn't exist.
   Returns the service account email."
  [^IAMClient iam-client ^String project-id workspace]
  (let [sa-id        (ws-service-account-id workspace)
        sa-email     (format "%s@%s.iam.gserviceaccount.com" sa-id project-id)
        project-name (format "projects/%s" project-id)]
    ;; Check if already exists first
    (if (ws-service-account-exists? iam-client project-id sa-email)
      (log/debugf "Service account already exists: %s" sa-email)
      (do
        (log/infof "Creating service account %s in project %s" sa-id project-id)
        (let [request (-> (CreateServiceAccountRequest/newBuilder)
                          (.setName project-name)
                          (.setAccountId sa-id)
                          (.setServiceAccount
                           (-> (ServiceAccount/newBuilder)
                               (.setDisplayName (format "Metabase Workspace %s" (:id workspace)))
                               (.setDescription "Auto-created by Metabase for workspace isolation")
                               (.build)))
                          (.build))]
          (.createServiceAccount iam-client request)
          (log/infof "Created service account: %s" sa-email))))
    sa-email))

(defn- ws-delete-service-account!
  "Delete a service account for a workspace. Idempotent - does nothing if SA doesn't exist."
  [^IAMClient iam-client ^String project-id workspace]
  (let [sa-id    (ws-service-account-id workspace)
        sa-email (format "%s@%s.iam.gserviceaccount.com" sa-id project-id)
        sa-name  (format "projects/%s/serviceAccounts/%s" project-id sa-email)]
    (when (ws-service-account-exists? iam-client project-id sa-email)
      (log/infof "Deleting service account %s" sa-email)
      (let [request (-> (DeleteServiceAccountRequest/newBuilder)
                        (.setName sa-name)
                        (.build))]
        (.deleteServiceAccount iam-client request)
        (log/infof "Deleted service account: %s" sa-email)))))

(defn- ws-has-role-binding?
  "Check if a policy already has a binding for the given role and member."
  [^Policy policy ^String role ^String member]
  (some (fn [^Binding binding]
          (and (= (.getRole binding) role)
               (some #(= % member) (.getMembersList binding))))
        (.getBindingsList policy)))

(defn- ws-grant-impersonation-permission!
  "Grant the main service account permission to impersonate the workspace service account."
  [^IAMClient iam-client ^String project-id ^String main-sa-email ^String workspace-sa-email]
  (let [resource (format "projects/%s/serviceAccounts/%s" project-id workspace-sa-email)
        role     "roles/iam.serviceAccountTokenCreator"
        member   (format "serviceAccount:%s" main-sa-email)]
    (try
      ;; Get current policy
      (let [current-policy (.getIamPolicy iam-client resource)]
        ;; Only add if not already granted
        (when-not (ws-has-role-binding? current-policy role member)
          (let [new-binding    (-> (Binding/newBuilder)
                                   (.setRole role)
                                   (.addMembers member)
                                   (.build))
                updated-policy (-> (Policy/newBuilder current-policy)
                                   (.addBindings new-binding)
                                   (.build))
                request        (-> (SetIamPolicyRequest/newBuilder)
                                   (.setResource resource)
                                   (.setPolicy updated-policy)
                                   (.build))]
            (.setIamPolicy iam-client request)
            (log/infof "Granted impersonation permission on %s to %s" workspace-sa-email main-sa-email))))
      (catch Exception e
        (log/warn e "Failed to grant impersonation permission (may already exist)")))))

(defn- ws-grant-project-role!
  "Grant a project-level IAM role to a service account.
   This is needed for roles like bigquery.jobUser that must be granted at project level."
  [details ^String project-id ^String service-account-email ^String role]
  (log/infof "Granting project role %s to %s" role service-account-email)
  (let [creds          (.createScoped (ws-service-account-credentials details)
                                      (doto (java.util.ArrayList.)
                                        (.add "https://www.googleapis.com/auth/cloud-platform")))
        settings       (-> (ProjectsSettings/newBuilder)
                           (.setCredentialsProvider (reify com.google.api.gax.core.CredentialsProvider
                                                      (getCredentials [_] creds)))
                           ^ProjectsSettings (.build))
        projects-client (ProjectsClient/create settings)
        resource       (format "projects/%s" project-id)
        member         (format "serviceAccount:%s" service-account-email)]
    (try
      ;; Get current policy
      (let [get-request    (-> (GetIamPolicyRequest/newBuilder)
                               (.setResource resource)
                               (.build))
            current-policy (.getIamPolicy projects-client get-request)]
        ;; Only add if not already granted
        (when-not (ws-has-role-binding? current-policy role member)
          (let [new-binding    (-> (Binding/newBuilder)
                                   (.setRole role)
                                   (.addMembers member)
                                   (.build))
                updated-policy (-> (Policy/newBuilder current-policy)
                                   (.addBindings new-binding)
                                   (.build))
                set-request    (-> (SetIamPolicyRequest/newBuilder)
                                   (.setResource resource)
                                   (.setPolicy updated-policy)
                                   (.build))]
            (.setIamPolicy projects-client set-request)
            (log/infof "Granted %s on project %s to %s" role project-id service-account-email))))
      (finally
        (.close projects-client)))))

(defn- ws-wait-for-impersonation-ready!
  "Poll until impersonation is working. GCP IAM changes can take up to 60 seconds to propagate.
   Tests by actually creating impersonated credentials and making a simple API call."
  [details ^String target-sa-email & {:keys [max-attempts interval-ms]
                                      :or   {max-attempts 120
                                             interval-ms  1000}}]
  (log/info "Waiting for IAM impersonation to be ready...")
  (let [base-creds  (.createScoped (ws-service-account-credentials details)
                                   (doto (java.util.ArrayList.)
                                     (.add "https://www.googleapis.com/auth/bigquery")))
        project-id  (get-project-id details)]
    (loop [attempt 1]
      (log/debugf "Checking impersonation readiness (attempt %d/%d)" attempt max-attempts)
      (let [result (try
                     ;; Try to create impersonated credentials and use them
                     (let [impersonated (ImpersonatedCredentials/create
                                         base-creds
                                         target-sa-email
                                         nil  ;; delegates
                                         (doto (java.util.ArrayList.)
                                           (.add "https://www.googleapis.com/auth/bigquery"))
                                         3600)
                           client       (-> (BigQueryOptions/newBuilder)
                                            ^BigQueryOptions$Builder (.setCredentials impersonated)
                                            ^BigQueryOptions (.build)
                                            ^BigQuery (.getService))]
                       ;; Try a simple operation - list datasets (limited to 1)
                       (.listDatasets client project-id (into-array BigQuery$DatasetListOption []))
                       :ready)
                     (catch Exception e
                       (if (or (str/includes? (str (ex-message e)) "permission")
                               (str/includes? (str (ex-message e)) "403")
                               (str/includes? (str (ex-message e)) "Access Denied"))
                         :not-ready
                         (do
                           (log/debugf "Unexpected error checking impersonation: %s" (ex-message e))
                           :not-ready))))]
        (cond
          (= result :ready)
          (log/info "IAM impersonation is ready")

          (>= attempt max-attempts)
          (throw (ex-info "Timeout waiting for IAM impersonation to propagate"
                          {:target-sa target-sa-email
                           :attempts  attempt}))

          :else
          (do
            (Thread/sleep ^long interval-ms)
            (recur (inc attempt))))))))

(defn- ws-role-name->acl-role
  "Convert a BigQuery IAM role name to an Acl$Role."
  ^Acl$Role [^String role-name]
  (case role-name
    "roles/bigquery.dataEditor" Acl$Role/WRITER
    "roles/bigquery.dataViewer" Acl$Role/READER
    "roles/bigquery.dataOwner"  Acl$Role/OWNER
    (throw (ex-info (str "Unknown role: " role-name) {:role role-name}))))

(defn- ws-has-acl-entry?
  "Check if an ACL list already has an entry for the given entity and role."
  [acl-list ^Acl$User entity ^Acl$Role role]
  (some (fn [^Acl acl]
          (and (= (.getEntity acl) entity)
               (= (.getRole acl) role)))
        acl-list))

(defn- ws-grant-dataset-acl!
  "Grant an ACL role on a dataset to a service account."
  [^BigQuery client ^DatasetId dataset-id ^String service-account-email ^String role-name]
  (log/debugf "Granting %s on dataset %s to %s" role-name dataset-id service-account-email)
  (let [dataset     ^Dataset (.getDataset client dataset-id
                                          ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                                          (into-array BigQuery$DatasetOption []))
        current-acl (into [] (.getAcl dataset))
        acl-role    (ws-role-name->acl-role role-name)
        acl-user    (Acl$User. service-account-email)]
    ;; Only add if not already granted
    (when-not (ws-has-acl-entry? current-acl acl-user acl-role)
      (let [new-acl-entry   (Acl/of acl-user acl-role)
            updated-acl     (conj current-acl new-acl-entry)
            updated-dataset (-> (.toBuilder dataset)
                                (.setAcl ^"clojure.lang.PersistentVector" updated-acl)
                                (.build))]
        (.update client updated-dataset
                 ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                 (into-array BigQuery$DatasetOption []))))))

(defn- ws-has-table-iam-binding?
  "Check if a table IAM policy already has a binding for the given role and identity."
  [^com.google.cloud.Policy policy ^Role role ^Identity identity]
  (let [bindings (.getBindings policy)
        identity-set (clojure.core/get bindings role)]
    (and identity-set (.contains ^java.util.Set identity-set identity))))

(defn- ws-grant-table-read-access!
  "Grant read access on a specific table to a service account using table-level IAM."
  [^BigQuery client ^TableId table-id ^String service-account-email]
  (log/debugf "Granting read access on table %s to %s" table-id service-account-email)
  (let [current-policy (.getIamPolicy client table-id (into-array BigQuery$IAMOption []))
        role           (Role/of "roles/bigquery.dataViewer")
        sa-identity    (Identity/serviceAccount service-account-email)]
    ;; Only add if not already granted
    (when-not (ws-has-table-iam-binding? current-policy role sa-identity)
      (let [updated-policy (-> current-policy
                               (.toBuilder)
                               (.addIdentity role sa-identity (into-array Identity []))
                               (.build))]
        (.setIamPolicy client table-id updated-policy (into-array BigQuery$IAMOption []))))))

(defmethod driver/init-workspace-isolation! :bigquery-cloud-sdk
  [_driver database workspace]
  (let [details       (:details database)
        client        (ws-database-details->client details)
        iam-client    (ws-database-details->iam-client details)
        project-id    (get-project-id details)
        main-sa-email (.getClientEmail (ws-service-account-credentials details))
        dataset-name  (driver.u/workspace-isolation-namespace-name workspace)]

    (try
      ;; Create the workspace service account (or get existing)
      (let [ws-sa-email (ws-create-service-account! iam-client project-id workspace)
            dataset-id  (DatasetId/of project-id dataset-name)]

        (log/infof "Initializing BigQuery workspace isolation: dataset=%s, service-account=%s"
                   dataset-name ws-sa-email)

        ;; Grant main SA permission to impersonate workspace SA
        (ws-grant-impersonation-permission! iam-client project-id main-sa-email ws-sa-email)

        ;; Grant the workspace SA permission to run BigQuery jobs (queries) at project level
        ;; Note: We intentionally do NOT grant project-level dataEditor as that would give
        ;; access to all datasets. The workspace SA only gets dataEditor on its isolated dataset.
        (ws-grant-project-role! details project-id ws-sa-email "roles/bigquery.jobUser")

        ;; Wait for IAM permissions to propagate by polling until impersonation works
        (ws-wait-for-impersonation-ready! details ws-sa-email)

        ;; Create the isolated dataset if it doesn't exist (using main SA credentials, not impersonated)
        (when-not (.getDataset client dataset-id
                               ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                               (into-array BigQuery$DatasetOption []))
          (let [dataset-info (-> (DatasetInfo/newBuilder dataset-id)
                                 (.setDescription (format "Metabase workspace isolation for workspace %s" (:id workspace)))
                                 (.build))]
            (.create client dataset-info
                     ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                     (into-array BigQuery$DatasetOption []))))

        ;; Grant the workspace service account dataEditor role on the isolated dataset
        ;; dataEditor allows: create/update/delete tables, insert/update/delete data
        (ws-grant-dataset-acl! client dataset-id ws-sa-email "roles/bigquery.dataEditor")

        ;; Return workspace connection details for impersonation
        ;; :user is used by grant-read-access-to-tables! to know which SA to grant access to
        ;; :impersonate-service-account is used by the connection swap to use impersonated credentials
        {:schema           dataset-name
         :database_details {:user                        ws-sa-email
                            :impersonate-service-account ws-sa-email}})
      (finally
        (.close iam-client)))))

(defmethod driver/grant-workspace-read-access! :bigquery-cloud-sdk
  [_driver database workspace tables]
  ;; For BigQuery, the workspace contains the service account email in database_details
  (let [ws-sa-email (-> workspace :database_details :impersonate-service-account)
        details     (:details database)
        client      (ws-database-details->client details)
        project-id  (get-project-id details)]

    (log/debugf "Granting read access to %d tables for %s" (count tables) ws-sa-email)

    ;; Grant dataViewer at table level for each table - proper isolation
    (doseq [{:keys [schema name]} tables]
      (let [table-id (TableId/of project-id schema name)]
        (ws-grant-table-read-access! client table-id ws-sa-email)))))

(def ^:private perm-check-workspace-id "00000000-0000-0000-0000-000000000000")

(defmethod driver/check-isolation-permissions :bigquery-cloud-sdk
  [driver database test-table]
  ;; BigQuery uses GCP IAM APIs instead of SQL, so we can't use transaction rollback.
  ;; We run the actual init/grant/destroy operations and clean up immediately.
  (let [test-workspace {:id   perm-check-workspace-id
                        :name "_mb_perm_check_"}]
    (try
      (let [init-result (try
                          (driver/init-workspace-isolation! driver database test-workspace)
                          (catch Exception e
                            (throw (ex-info (format "Failed to initialize workspace isolation: %s" (ex-message e))
                                            {:step :init} e))))
            workspace-with-details (merge test-workspace init-result)]
        (when test-table
          (try
            (driver/grant-workspace-read-access! driver database workspace-with-details [test-table])
            (catch Exception e
              (throw (ex-info (format "Failed to grant read access to table %s.%s: %s"
                                      (:schema test-table) (:name test-table) (ex-message e))
                              {:step :grant :table test-table} e)))))
        (try
          (driver/destroy-workspace-isolation! driver database workspace-with-details)
          (catch Exception e
            (throw (ex-info (format "Failed to destroy workspace isolation: %s" (ex-message e))
                            {:step :destroy} e)))))
      nil
      (catch Exception e
        (ex-message e))
      (finally
        (try
          (driver/destroy-workspace-isolation! driver database test-workspace)
          (catch Exception _ nil))))))

(defmethod driver/destroy-workspace-isolation! :bigquery-cloud-sdk
  [_driver database workspace]
  (let [details      (:details database)
        client       (ws-database-details->client details)
        iam-client   (ws-database-details->iam-client details)
        project-id   (get-project-id details)
        dataset-name (driver.u/workspace-isolation-namespace-name workspace)
        dataset-id   (DatasetId/of project-id dataset-name)]
    (try
      (log/infof "Destroying BigQuery workspace isolation: dataset=%s" dataset-name)

      ;; Delete the dataset if it exists (deleteContents=true removes all tables)
      (when (.getDataset client dataset-id
                         ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                         (into-array BigQuery$DatasetOption []))
        (log/infof "Deleting dataset %s" dataset-name)
        (.delete client dataset-id
                 ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetDeleteOption;"
                 (into-array BigQuery$DatasetDeleteOption [(BigQuery$DatasetDeleteOption/deleteContents)]))
        (log/infof "Deleted dataset %s" dataset-name))

      ;; Delete the service account (this also removes its IAM bindings)
      (ws-delete-service-account! iam-client project-id workspace)

      {:success true}
      (finally
        (.close iam-client)))))

(defmethod driver/llm-sql-dialect-resource :bigquery-cloud-sdk [_]
  "llm/prompts/dialects/bigquery.md")
