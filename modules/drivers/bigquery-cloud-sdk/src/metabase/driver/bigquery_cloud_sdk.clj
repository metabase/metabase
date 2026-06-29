(ns metabase.driver.bigquery-cloud-sdk
  (:refer-clojure :exclude [mapv some empty? not-empty])
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
   ;; Side-effects: registers BigQuery driver multimethods for workspace
   ;; isolation (`init-workspace-isolation!`, `grant-workspace-read-access!`,
   ;; `check-isolation-permissions`, `destroy-workspace-isolation!`).
   [metabase.driver.bigquery-cloud-sdk.workspaces]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as driver.sql-jdbc]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.like-escape-char-built-in :as-alias like-escape-char-built-in]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sync :as driver.s]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv some empty? not-empty]]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentList)
   (com.google.api.gax.rpc FixedHeaderProvider)
   (com.google.auth.oauth2 ImpersonatedCredentials)
   (com.google.cloud.bigquery
    BigQuery
    BigQuery$DatasetListOption
    BigQuery$DatasetOption
    BigQuery$JobOption
    BigQuery$QueryResultsOption
    BigQuery$TableDataListOption
    BigQuery$TableOption
    BigQueryException
    BigQueryOptions
    Dataset
    DatasetId
    Field
    Field$Mode
    FieldValue
    FieldValueList
    Job
    JobInfo
    QueryJobConfiguration
    Schema
    Table
    TableDefinition$Type
    TableId
    TableResult)
   (com.google.cloud.http HttpTransportOptions)
   (com.google.common.collect ImmutableMap)
   (com.google.gson JsonParser)
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
        impersonating? (some? (:impersonate-service-account details))
        final-creds  (if impersonating?
                       (let [target-sa (:impersonate-service-account details)]
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
    ;; `ImpersonatedCredentials` doesn't carry a project id (it derives identity
    ;; from the impersonation target SA, not from a key file), so the Google SDK
    ;; would throw "A project ID is required for this service but could not be
    ;; determined from the builder or the environment" when building the client.
    ;; Fall back to the base SA's project id, which is what every non-impersonated
    ;; call site is implicitly relying on through `getOptions.getProjectId`.
    (when impersonating?
      (when-let [pid (or (:project-id details)
                         (.getProjectId base-creds))]
        (.setProjectId bq-bldr ^String pid)))
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

(defn- list-datasets
  "Fetch all datasets given database `details`, applying dataset filters if specified."
  [{:keys [dataset-filters-type dataset-filters-patterns] :as details} & {:keys [logging-schema-exclusions?]}]
  (let [client (database-details->client details)
        project-id (bigquery.common/get-project-id details)
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
  (^Table [database dataset-id table-id]
   (let [details    (driver.conn/effective-details database)
         project-id (:project-id details)]
     (get-table (database-details->client details) project-id dataset-id table-id)))

  (^Table [^BigQuery client :- (driver-api/instance-of-class BigQuery)
           project-id       :- [:maybe driver-api/schema.common.non-blank-string]
           dataset-id       :- driver-api/schema.common.non-blank-string
           table-id         :- driver-api/schema.common.non-blank-string]
   (get-table* client project-id dataset-id table-id)))

(defmethod driver/table-exists? :bigquery-cloud-sdk
  [_ database {table-id :name, dataset-id :schema :as _table}]
  (when-not (or (str/blank? dataset-id) (str/blank? table-id))
    (let [details    (driver.conn/effective-details database)
          client     (database-details->client details)
          project-id (bigquery.common/get-project-id details)]
      (boolean
       (get-table* client project-id dataset-id table-id)))))

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
  (let [details       (driver.conn/effective-details database)
        project-id    (bigquery.common/get-project-id details)
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
    (->> (list-datasets details :logging-schema-exclusions? true)
         (eduction (mapcat (fn [dataset-id] (eduction (map #(table-info dataset-id %)) (query-dataset dataset-id))))))))

(defmethod driver/describe-database* :bigquery-cloud-sdk
  [driver database]
  {:tables (describe-database-tables driver database)})

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

(defn- column-field-path-row->nested-col
  "Map a `COLUMN_FIELD_PATHS` row to a nested-column map (later keyed by its `:nfc-path`), or `nil` for a top-level
  (non-nested) field."
  [dataset-id {data-type :data_type field-path-str :field_path table-name :table_name}]
  (let [field-path                (str/split field-path-str #"\.")
        [database-type base-type] (raw-type->database+base-type data-type)]
    (when-let [nfc-path (not-empty (pop field-path))]
      {:name          (peek field-path)
       :table-name    table-name
       :table-schema  dataset-id
       :database-type database-type
       :base-type     base-type
       :nfc-path      nfc-path})))

(defn- nested-rows->table-lookup
  "Build a single table's nested-column lookup `{nfc-path [cols]}` from that table's `COLUMN_FIELD_PATHS` rows.
  Returns `{}` when the table has no nested fields (`table-nested-rows` is empty/`nil`)."
  [dataset-id table-nested-rows]
  (transduce
   (keep #(column-field-path-row->nested-col dataset-id %))
   (completing
    (fn [accum col]
      (update accum (:nfc-path col) (fnil conj []) col)))
   {}
   table-nested-rows))

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

(defn- describe-dataset-table
  "Build the field descriptions for a single table from its joined `COLUMNS`/`COLUMN_FIELD_PATHS` rows (see
  [[describe-dataset-fields-reducible]]). Each top-level column appears once per nested leaf, or once with a `nil`
  `:field_path` when it has none, so de-dup the columns by `:column_name` and build the nested-field lookup from
  the rows that carry a `:field_path` (whose leaf type is in `:nested_data_type`)."
  [dataset-id table-rows]
  (let [table-name    (:table_name (first table-rows))
        nested-lookup (nested-rows->table-lookup
                       dataset-id
                       (eduction (filter :field_path)
                                 (map #(assoc % :data_type (:nested_data_type %)))
                                 table-rows))
        ;; de-dup by `:column_name`, not `:ordinal_position`: BigQuery reports a NULL `ordinal_position` for
        ;; pseudo-columns (e.g. `_PARTITIONTIME`), and a table can carry more than one, so keying on position would
        ;; collapse distinct columns into one.
        columns       (into [] (m/distinct-by :column_name) table-rows)]
    (sort-by (juxt :table-name :database-position :name)
             (describe-dataset-rows nested-lookup dataset-id table-name columns))))

(defn- describe-dataset-fields-reducible
  "Reducibly describe the fields (including nested STRUCT fields) of `table-names` within `dataset-id`.

  Runs a single `INFORMATION_SCHEMA` query that LEFT JOINs `COLUMNS` (top-level fields) to `COLUMN_FIELD_PATHS` (nested
  STRUCT leaves) on `(table_name, column_name)`. A non-nested column yields one row with a `nil` `:field_path`; a STRUCT
  column yields one row per nested leaf. Ordering by `table_name` keeps each table's rows contiguous, so we consume the
  live result with a `partition-by` transducer and reconstruct one table at a time (see [[describe-dataset-table]]) --
  never realizing more than a single table's rows. This matters for wide and/or deeply-nested datasets (e.g.
  GA4/Firebase exports, or schemas with thousands of columns per table) where realizing a whole batch's columns would
  spike memory. Each table is emitted exactly once with its fields contiguous (the sync groups fields with `partition-by`
  on `[table-name table-schema]`). The query is a single-pass live result, so the returned reducible is
  single-consumption."
  [driver database project-id dataset-id table-names]
  (assert (seq table-names))
  (let [rows (try
               (query-honeysql driver database
                               {:select    [[:c.table_name :table_name]
                                            [:c.column_name :column_name]
                                            [:c.data_type :data_type]
                                            [:c.ordinal_position :ordinal_position]
                                            [[:= :c.is_partitioning_column "YES"] :partitioned]
                                            [:p.data_type :nested_data_type]
                                            [:p.field_path :field_path]]
                                :from      [[(information-schema-table project-id dataset-id "COLUMNS") :c]]
                                :left-join [[(information-schema-table project-id dataset-id "COLUMN_FIELD_PATHS") :p]
                                            [:and
                                             [:= :c.table_name :p.table_name]
                                             [:= :c.column_name :p.column_name]
                                             ;; only nested leaves -- the top-level entry (field_path = column_name) has
                                             ;; no `.` and is described from the `COLUMNS` side
                                             [:> [:strpos :p.field_path "."] 0]]]
                                :where     [:in :c.table_name table-names]
                                :order-by  [:c.table_name]})
               (catch Throwable e
                 (log/warnf e "error in describe-fields for dataset: %s" dataset-id)))]
    (eduction
     (partition-by :table_name)
     (mapcat #(describe-dataset-table dataset-id %))
     rows)))

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
  (let [details     (driver.conn/effective-details database)
        project-id  (bigquery.common/get-project-id details)
        dataset-ids (or schema-names (list-datasets details))]
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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Sizing sample pages by measurement                                      |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; `tabledata.list` returns whole rows (it can't project columns in this SDK), and the parsed page is held in memory
;;; while we fingerprint it. A wide table, or a narrow one with heavy columns (large text, BYTES, JSON, or nested
;;; RECORD/REPEATED) can make a page huge and OOM sync. Rather than guess a per-row cost from column types (which is
;;; wildly inaccurate -- a TEXT column may hold 5 bytes or 5 MB), we *measure* it: fetch a small probe page, then
;;; recompute the next page size from the average bytes/row actually seen, so each page targets a fixed byte budget.

(def ^:private ^:dynamic *page-byte-budget*
  "Target measured bytes per result page, for both `tabledata.list` sampling and regular query execution. The next
  page size is `budget / measured-bytes-per-row`, clamped to [1, remaining]. Kept well under the server's ~10 MB page
  cap to leave headroom for JVM object expansion when the page is parsed."
  (* 4 1024 1024))

(def ^:private initial-page-rows
  "Rows to request for the *first* result page of every BigQuery fetch -- both `tabledata.list` sampling and regular
  `getQueryResults` query execution (unless [[*page-size*]] is explicitly set). It's a small probe: the library
  otherwise requests an unbounded first page, so a wide/large result (e.g. the `INFORMATION_SCHEMA.COLUMNS` sweep in
  `describe-fields` over a 1000-column dataset, or a heavy sample) materializes hundreds of thousands of `FieldValue`s
  at once and can OOM sync. After this probe, [[adaptive-sample-next-page]]/[[adaptive-query-next-page]] grow each
  subsequent page from the *measured* bytes/row toward [[*page-byte-budget*]]. Small enough to stay within budget even
  for heavy rows, but not 1 -- a handful averages out per-row size variance."
  10)

(def ^:private sample-cell-overhead-bytes
  "Approximate JVM footprint of a single parsed cell beyond its character data (the `FieldValue` wrapper plus boxing).
  Added per cell so the budget tracks in-memory size, not just the wire bytes."
  64)

(defn- field-value-bytes
  "Measured (not type-estimated) in-memory size of one parsed cell. `tabledata.list` returns scalars as Strings, so
  the character count is a faithful proxy; REPEATED/RECORD values (a `FieldValueList`/`List` of cells) are summed
  recursively."
  ^long [^FieldValue cell]
  (let [v (.getValue cell)]
    (cond
      (instance? java.util.List v) (reduce (fn [^long acc c] (+ acc (field-value-bytes c)))
                                           sample-cell-overhead-bytes
                                           v)
      (string? v)                  (+ sample-cell-overhead-bytes (.length ^String v))
      :else                        sample-cell-overhead-bytes)))

(defn- row-bytes
  "Measured in-memory size of one fetched row."
  ^long [^FieldValueList row]
  (reduce (fn [^long acc cell] (+ acc (field-value-bytes cell))) 0 row))

(defn- next-page-size
  "Rows to request for the next page given the average measured bytes/row so far, targeting `budget` bytes/page.
  Clamped to [1, `remaining`]. Shared by the sampler ([[adaptive-sample-next-page]]) and regular query execution
  ([[adaptive-query-next-page]])."
  ^long [^long budget ^long measured-bytes ^long measured-rows ^long remaining]
  (let [avg-row-bytes (max 1 (quot measured-bytes (max 1 measured-rows)))]
    (-> (quot budget avg-row-bytes)
        (max 1)
        (min remaining))))

(defn- list-sample-page
  "Issue a `tabledata.list` request for at most `page-size` rows, continuing from `page-token` when given."
  ^TableResult [^Table bq-table page-size ^String page-token]
  (let [opts (cond-> [(BigQuery$TableDataListOption/pageSize (long page-size))]
               (not (str/blank? page-token)) (conj (BigQuery$TableDataListOption/pageToken page-token)))]
    (.list bq-table (u/varargs BigQuery$TableDataListOption opts))))

(defn- adaptive-sample-next-page
  "A swappable page-advance for [[reducible-bigquery-results]], used when sampling. It measures the just-consumed
  page's real bytes/row and re-issues `.list` from the page token with a size targeting `*page-byte-budget*`
  -- a sliding window that adapts per page to the table's actual data instead of guessing from column types. Returns
  nil once the `max-rows` budget is spent or there are no more pages."
  [^Table bq-table ^long max-rows]
  (let [budget (long *page-byte-budget*)
        seen   (atom {:bytes 0, :rows 0})]
    (fn [^TableResult page]
      (let [token (.getNextPageToken page)]
        (when-not (str/blank? token)
          (let [[page-bytes page-rows] (reduce (fn [[b n] row] [(+ (long b) (row-bytes row)) (inc (long n))])
                                               [0 0]
                                               (.getValues page))
                {:keys [bytes rows]}   (swap! seen (fn [s] {:bytes (+ (long (:bytes s)) (long page-bytes))
                                                            :rows  (+ (long (:rows s)) (long page-rows))}))
                remaining              (- max-rows (long rows))]
            (when (pos? remaining)
              (*page-callback*)
              (list-sample-page bq-table (next-page-size budget bytes rows remaining) token))))))))

(defn- sample-table
  "Process a sample of rows of fields corresponding to the Metabase fields
  `fields` from the BigQuery table `bq-table` using the query result reducing
  function `rff`.

  We fetch a small probe page first and then let [[reducible-bigquery-results]] walk the rest, but with an adaptive
  page-advance ([[adaptive-sample-next-page]]) that re-sizes each page from the *measured* bytes/row so heavy tables
  fetch fewer rows -- without column-type guesses, and reusing the existing cancel/dedup/nil-page handling.

  `.getSchema` returns nil if called on the result of `.list`, so we have to
  match fields by position. Here it is assumed that :database_position in
  `fields` represents the positions of the columns in the BigQuery table and
  that `.list` returns the fields in that order. The first assumption could be
  lifted by matching the names in `fields` to the names in the table schema."
  [^Table bq-table fields rff]
  (let [^Schema schema (.. bq-table getDefinition getSchema)
        field-idxs     (mapv :database_position fields)
        all-parsers    (get-field-parsers schema)
        parsers        (mapv all-parsers field-idxs)
        probe          (list-sample-page bq-table (min (long initial-page-rows) table-rows-sample/max-sample-rows) nil)]
    (transduce
     (comp (take table-rows-sample/max-sample-rows)
           (map (partial extract-fingerprint field-idxs parsers)))
     ;; Instead of passing on fields, we could recalculate the
     ;; metadata from the schema, but that probably makes no
     ;; difference and currently the metadata is ignored anyway.
     (rff {:cols fields})
     (reducible-bigquery-results probe nil (constantly nil)
                                 (adaptive-sample-next-page bq-table table-rows-sample/max-sample-rows)))))

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
  "Maximum number of rows to return per page in a query. Leave unset (falls back to [[initial-page-rows]] for the first
  page, then adaptive sizing) by default, but override for testing."
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
  (if (:use-jvm-timezone (driver.conn/effective-details database))
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

(defn- adaptive-query-next-page
  "Adaptive page-advance for query-job results (the regular execution path), mirroring [[adaptive-sample-next-page]]
  but paging via `getQueryResults` -- the query result's own `.getNextPage` re-uses the original page size and can't
  be re-sized. Measures the just-consumed page's real bytes/row and re-issues the next page with a `pageSize`
  targeting [[*page-byte-budget*]], so a wide or heavy result fetches fewer rows per page instead of holding a
  large parsed page in memory. Returns nil once the result set is exhausted."
  [^Job job]
  (let [budget (long *page-byte-budget*)
        seen   (atom {:bytes 0, :rows 0})]
    (fn [^TableResult page]
      (let [token (.getNextPageToken page)]
        (when-not (str/blank? token)
          (let [[page-bytes page-rows] (reduce (fn [[b n] row] [(+ (long b) (row-bytes row)) (inc (long n))])
                                               [0 0]
                                               (.getValues page))
                {:keys [bytes rows]}   (swap! seen (fn [s] {:bytes (+ (long (:bytes s)) (long page-bytes))
                                                            :rows  (+ (long (:rows s)) (long page-rows))}))]
            (log/trace "BigQuery: Fetching new page")
            (*page-callback*)
            (.getQueryResults job
                              (u/varargs BigQuery$QueryResultsOption
                                [(BigQuery$QueryResultsOption/pageSize
                                  (next-page-size budget bytes rows Long/MAX_VALUE))
                                 (BigQuery$QueryResultsOption/pageToken token)]))))))))

(defn- reducible-bigquery-results
  "Reducible over the rows of `page` and its successors. `next-page` is the adaptive page-advance: given the
  just-exhausted page it measures it and returns the next one (re-sized from the measured bytes/row to a byte budget),
  or nil when done. Adaptive page sizing is the only mode -- callers pass [[adaptive-sample-next-page]] (sampling, via
  `.list`) or [[adaptive-query-next-page]] (query execution, via `getQueryResults`)."
  ([^TableResult page cancel-chan attempt-job-cancel-fn next-page]
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

             ;; This page is exhausted - ask `next-page` for another and keep processing.
             ;; `some->` keeps the old nil-page tolerance (#47339): a nil page yields no next page and falls through
             ;; to the `acc` branch (empty result) instead of NPEing inside `next-page`.
             :else
             (if-let [new-page (some-> page next-page)]
               (if-let [new-iter (some-> new-page values-iterator)]
                 (do
                   (log/trace "BigQuery: New page returned")
                   (recur new-page new-iter acc (inc n)))
                 (throw (ex-info "Cannot get next page from BigQuery" {:page n})))
               (do (log/tracef "BigQuery: All rows consumed (%d)" n)
                   acc))))
         (catch Throwable t
           (attempt-job-cancel-fn)
           (throw t)))))))

(defn- bigquery-execute-response
  "Given the initial query page, respond with metadata and a lazy reducible that will page through the rest of the data."
  [^TableResult page ^Job job ^BigQuery client respond cancel-chan]
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
                          (reducible-bigquery-results page cancel-chan attempt-job-cancel-fn
                                                      (adaptive-query-next-page job)))]
    (respond cols results)))

(defn- execute-bigquery
  [respond database-details ^String sql parameters cancel-chan]
  {:pre [(not (str/blank? sql))]}
  ;; Kicking off two async jobs:
  ;; - Waiting for the cancel-chan to get either a cancel message or to be closed.
  ;; - Running the BigQuery execution in another thread, since it's blocking.
  (let [^BigQuery client (database-details->client database-details)
        result-promise   (promise)
        request          (build-bigquery-request sql parameters)
        _                (driver.conn/track-connection-acquisition! database-details)
        ;; Wrap exception to avoid responding with HTTP 500 and reporting "We're experiencing server issues"
        ;; in the UI. (#71558)
        ^Job job         (try
                           (.create client (JobInfo/of request) (u/varargs BigQuery$JobOption))
                           (catch Throwable t
                             (handle-bigquery-exception t sql parameters)))
        job-id           (.getJobId job)
        query-future     (future
                           ;; ensure the classloader is available within the future.
                           (driver-api/the-classloader)
                           (try
                             (*page-callback*)
                             (let [result-options [(BigQuery$QueryResultsOption/pageSize (or *page-size* initial-page-rows))]
                                   result         (.getQueryResults job (u/varargs BigQuery$QueryResultsOption result-options))]
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
        :ready  (bigquery-execute-response result job client respond cancel-chan)))))

(mu/defn- ^:dynamic *process-native*
  [respond  :- fn?
   database :- [:map [:details :map]]
   sql
   parameters
   cancel-chan]
  {:pre [(map? database) (map? (:details database))]}
  ;; automatically retry the query if it times out or otherwise fails. This is on top of the auto-retry added by
  ;; `execute`
  (let [details (driver.conn/effective-details database)
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
      (let [sql (if (:include-user-id-and-hash (driver.conn/effective-details database) true)
                  (str sql "\n\n-- " (driver-api/query->remark :bigquery-cloud-sdk outer-query))
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
                              ;; This driver reports inaccurate `:rows-affected` counts; the transforms layer
                              ;; falls back to a native `COUNT(*)` on the CTAS path.
                              ;; TODO: fix `execute-raw-queries!` to return accurate row counts for DDL
                              ;; statements by using a different driver-native API for affected-row counts.
                              :transforms/accurate-rows-affected false
                              :transforms/python                true
                              :transforms/table                 true
                              ;; Workspace isolation using service account impersonation
                              ;; Tearing down workspaces is not working right currently
                              :workspace                        false}]
  (defmethod driver/database-supports? [:bigquery-cloud-sdk feature] [_driver _feature _db] supported?))

(defmethod driver/qualified-name-components :bigquery-cloud-sdk
  [_driver]
  ;; BigQuery emits three-part identifiers in compiled SQL: `project.dataset.table`.
  ;; Project is connection-level identity but it appears in the AST as `Table.catalog`,
  ;; so we model it as `:db`. Dataset sits at SQLGlot's `Table.db` position, our `:schema`.
  [:db :schema])

(defmethod driver.sql/table-qualification-style :bigquery-cloud-sdk
  [_driver]
  :table-qualification-style/db-schema-table)

(defmethod driver.sql/db-slot-value :bigquery-cloud-sdk
  [_driver database]
  (:project-id (:details database)))

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
    (let [updated-details (-> (driver.conn/default-details database)
                              (assoc :dataset-filters-type "inclusion")
                              (assoc :dataset-filters-patterns dataset-id)
                              (dissoc :dataset-id))]
      (t2/update! :model/Database db-id {:details updated-details})
      (assoc database :details updated-details))))

;; TODO: THIS METHOD SHOULD NOT BE UPDATING THE APP-DB (which it does in [convert-dataset-id-to-filters!])
;; Issue: https://github.com/metabase/metabase/issues/39392
;; This normalize is a legacy migration (OAuth -> service-account, dataset-id -> filters); it
;; runs only against `:details` because the overlay maps (`:write-data-details`, `:admin-details`)
;; never carry these legacy fields, and `convert-dataset-id-to-filters!` writes side effects
;; specific to the primary details.
(defmethod driver/normalize-db-details :bigquery-cloud-sdk
  [_driver database]
  (let [details (driver.conn/default-details database)]
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
      database)))

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
  (let [sql       (#'driver.sql-jdbc/create-table!-sql driver table-name column-definitions :primary-key primary-key)
        database  (t2/select-one :model/Database database-id)
        conn-spec (driver/connection-spec driver database)]
    (driver/execute-raw-queries! driver conn-spec [sql])))

(defmethod driver/drop-table! :bigquery-cloud-sdk
  [driver database-id table-name]
  (let [sql       (driver/compile-drop-table driver table-name)
        database  (t2/select-one :model/Database database-id)
        conn-spec (driver/connection-spec driver database)]
    (driver/execute-raw-queries! driver conn-spec [sql])))

(defn- convert-value-for-insertion
  [base-type value]
  (condp #(isa? %2 %1) base-type
    :type/JSON
    (bigquery.params/param "JSON" (JsonParser/parseString value))

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
  [driver db-id {table-name :name :keys [columns]} {:keys [data]}]
  ;; Uses SQL inserts instead of the Storage API or the legacy .insertAll API.
  ;; this is because during transforms tables are dropped and re-created, and both these API's do not
  ;; update their metadata caches frequently enough for timely transform runs (or interactive previews).
  ;; rather than waiting many minutes, we trade torward consistency by using SQL DML, whose table metadata
  ;; is consistent, and we do not see cached non-existence and things like that causing trouble.
  (let [database   (t2/select-one :model/Database db-id)
        col-kws    (mapv (comp keyword name :name) columns)
        num-cols   (count col-kws)
        ;; bigquery allows 10k query parameters per request
        max-rows   (max 1 (quot 10000 num-cols))
        chunk-size (min (or driver/*insert-chunk-rows* 1000) max-rows)]
    (doseq [chunk (partition-all chunk-size data)
            :let [lift       #(if (coll? %) [:lift %] %)
                  lift-tuple #(mapv lift %)]]
      (let [[sql & params] (sql.qp/format-honeysql driver {:insert-into table-name
                                                           :columns     col-kws
                                                           :values      (mapv lift-tuple chunk)})]
        (driver/execute-raw-queries! driver database [[sql params]])))))

(defmethod driver/execute-raw-queries! :bigquery-cloud-sdk
  [driver conn-spec queries]
  ;; conn-spec should be flat details (from driver/connection-spec)
  ;; Defensive: multiple callsites used to pass in a database map. If the map has
  ;; :details key, we will call driver/connection-spec on it.
  (let [details (if (:details conn-spec)
                  (driver/connection-spec driver conn-spec)
                  conn-spec)
        client  (database-details->client details)]
    (driver.conn/track-connection-acquisition! details)
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
           {:rows-affected (or (and table-result (.getTotalRows table-result))
                               0)})))
      (catch Exception e
        (log/error e "Error executing BigQuery DDL")
        (throw e)))))

(defmethod driver/drop-transform-target! [:bigquery-cloud-sdk :table]
  [driver database {:keys [name schema] :as _target}]
  (let [qualified-name (if schema
                         (keyword schema name)
                         (keyword name))
        drop-sql       (first (driver/compile-drop-table driver qualified-name))
        conn-spec      (driver/connection-spec driver database)]
    (driver/execute-raw-queries! driver conn-spec [drop-sql])
    nil))

(defmethod driver/connection-spec :bigquery-cloud-sdk
  [_driver database]
  (driver.conn/effective-details database))

(defmethod driver.sql/default-schema :bigquery-cloud-sdk
  [_]
  nil)

(defmethod driver/create-schema-if-needed! :bigquery-cloud-sdk
  [driver conn-spec schema]
  ;; Check if dataset exists using the BigQuery API before trying to create.
  ;; This is important for workspace isolation where the impersonated SA has
  ;; access to an existing isolated dataset but cannot create new datasets.
  (let [client     (database-details->client conn-spec) ;; for bigquery, connection spec *is* the details
        project-id (bigquery.common/get-project-id conn-spec)
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
         driver.conn/effective-details
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

(defmethod driver/llm-sql-dialect-resource :bigquery-cloud-sdk [_]
  "metabot/prompts/dialects/bigquery.md")
