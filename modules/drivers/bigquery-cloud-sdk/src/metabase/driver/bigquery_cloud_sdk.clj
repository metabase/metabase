(ns metabase.driver.bigquery-cloud-sdk
  (:require [clojure.core.async :as a]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
            [metabase.driver.bigquery-cloud-sdk.params :as bigquery.params]
            [metabase.driver.bigquery-cloud-sdk.query-processor :as bigquery.qp]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import [com.google.cloud.bigquery BigQuery BigQuery$DatasetOption BigQuery$JobOption BigQuery$TableListOption
                                      BigQuery$TableOption BigQueryException BigQueryOptions DatasetId Field Field$Mode FieldValue
                                      FieldValueList QueryJobConfiguration Schema Table TableId TableResult]
           java.util.Collections))

(driver/register! :bigquery-cloud-sdk, :parent :sql)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Client                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private bigquery-scope
  "The scope to use for executing BigQuery requests; see:
  `https://cloud.google.com/bigquery/docs/samples/bigquery-auth-drive-scope`.
  Unclear if this can be sourced from the `com.google.cloud.bigquery` package directly."
  "https://www.googleapis.com/auth/bigquery")

(defn- ^BigQuery database->client
  [database]
  (let [creds   (bigquery.common/database-details->service-account-credential (:details database))
        bq-bldr (doto (BigQueryOptions/newBuilder)
                  (.setCredentials (.createScoped creds (Collections/singletonList bigquery-scope))))]
    (.. bq-bldr build getService)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Sync                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ^Iterable list-tables
  "Fetch all tables (new pages are loaded automatically by the API)."
  (^Iterable [{{:keys [project-id dataset-id]} :details, :as database}]
    (let [bq (database->client database)]
      (list-tables bq project-id dataset-id)))

  (^Iterable [^BigQuery client, ^String project-id ^String dataset-id]
    {:pre [client (not (str/blank? dataset-id))]}
    (.iterateAll (.listTables client (DatasetId/of project-id dataset-id) (u/varargs BigQuery$TableListOption)))))

(defmethod driver/describe-database :bigquery-cloud-sdk
  [_ database]
  (let [tables (list-tables database)]
    {:tables (set (for [^Table table tables]
                    {:schema nil, :name (.. table getTableId getTable)}))}))

(defmethod driver/can-connect? :bigquery-cloud-sdk
  [_ {:keys [project-id dataset-id] :as details-map}]
  ;; check whether we can connect by seeing whether we have at least one Table in the iterator
  (let [^BigQuery bq     (database->client {:details details-map})
        ^DatasetId ds-id (if (some? project-id)
                           (DatasetId/of project-id dataset-id)
                           (DatasetId/of dataset-id))]
    (some? (.getDataset bq ds-id (u/varargs BigQuery$DatasetOption)))))

(def ^:private empty-table-options
  (u/varargs BigQuery$TableOption))

(s/defn get-table :- Table
  ([{{:keys [project-id dataset-id]} :details, :as database} table-id]
   (get-table (database->client database) project-id dataset-id table-id))

  ([client :- BigQuery, project-id :- (s/maybe su/NonBlankString), dataset-id :- su/NonBlankString, table-id :- su/NonBlankString]
   (if project-id
     (.getTable client (TableId/of project-id dataset-id table-id) empty-table-options)
     (.getTable client dataset-id table-id empty-table-options))))

(defn- bigquery-type->base-type
  "Returns the base type for the given BigQuery field's `field-mode` and `field-type`. In BQ, an ARRAY of INTEGER has
  \"REPEATED\" as the mode, and \"INTEGER\" as the type name.

  If/when we are able to represent complex types more precisely, we may want to capture that information separately.
  For now, though, we will check if the `field-mode` is \"REPEATED\" and return our :type/Array for that case, then
  proceed to check the `field-type` otherwise."
  [field-mode field-type]
  (if (= Field$Mode/REPEATED field-mode)
    :type/Array
    (case field-type
      "BOOLEAN"    :type/Boolean
      "FLOAT"      :type/Float
      "INTEGER"    :type/Integer
      "RECORD"     :type/Dictionary ; RECORD -> field has a nested schema
      "STRING"     :type/Text
      "DATE"       :type/Date
      "DATETIME"   :type/DateTime
      "TIMESTAMP"  :type/DateTimeWithLocalTZ
      "TIME"       :type/Time
      "NUMERIC"    :type/Decimal
      "BIGNUMERIC" :type/Decimal
      :type/*)))

(s/defn ^:private table-schema->metabase-field-info
  [schema :- Schema]
  (for [[idx ^Field field] (m/indexed (.getFields schema))]
    (let [type-name (.. field getType name)
          f-mode    (.getMode field)]
      {:name              (.getName field)
       :database-type     type-name
       :base-type         (bigquery-type->base-type f-mode type-name)
       :database-position idx})))

(defmethod driver/describe-table :bigquery-cloud-sdk
  [_ database {table-name :name}]
  {:schema nil
   :name   table-name
   :fields (set (table-schema->metabase-field-info (.. (get-table database table-name) getDefinition getSchema)))})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Running Queries                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^:dynamic ^Long *page-size*
  "Maximum number of rows to return per page in a query. Leave unset (i.e. falling to the library default) by default,
  but override for testing."
  nil)

(def ^:private ^:dynamic *page-callback*
  "Callback to execute when a new page is retrieved, used for testing"
  nil)

(defn- throw-invalid-query [e sql parameters]
  (throw (ex-info (tru "Error executing query")
           {:type error-type/invalid-query, :sql sql, :parameters parameters}
           e)))

(defn- ^TableResult execute-bigquery
  [^BigQuery client ^String sql parameters cancel-chan cancel-requested?]
  {:pre [client (not (str/blank? sql))]}
  (try
    (let [request (doto (QueryJobConfiguration/newBuilder sql)
                    ;; if the query contains a `#legacySQL` directive then use legacy SQL instead of standard SQL
                    (.setUseLegacySql (str/includes? (str/lower-case sql) "#legacysql"))
                    (bigquery.params/set-parameters! parameters)
                    ;; .setMaxResults is very misleading; it's actually the page size, and it only takes
                    ;; effect for RPC (a.k.a. "fast") calls
                    ;; there is no equivalent of .setMaxRows on a JDBC Statement; we rely on our middleware to stop
                    ;; realizing more rows as per the maximum result size
                    (.setMaxResults *page-size*))
          ;; as long as we don't set certain additional QueryJobConfiguration options, our queries *should* always be
          ;; following the fast query path (i.e. RPC)
          ;; check out com.google.cloud.bigquery.QueryRequestInfo.isFastQuerySupported for full details
          res-fut (future (.query client (.build request) (u/varargs BigQuery$JobOption)))]
      (when cancel-chan
        (future ; this needs to run in a separate thread, because the <!! operation blocks forever
          (when (a/<!! cancel-chan)
            (log/debugf "Received a message on the cancel channel; attempting to stop the BigQuery query execution")
            (reset! cancel-requested? true) ; signal the page iteration fn to stop
            (if-not (or (future-cancelled? res-fut) (future-done? res-fut))
              ;; somehow, even the FIRST page hasn't come back yet (i.e. the .query call above), so cancel the future to
              ;; interrupt the thread waiting on that response to come back
              ;; unfortunately, with this particular overload of .query, we have no access to (nor the ability to control)
              ;; the jobId, so we have no way to use the BigQuery client to cancel any job that might be running
              (future-cancel res-fut)
              (if (future-done? res-fut) ; canceled received after it was finished; may as well return it
                @res-fut)))))
      @res-fut)
    (catch BigQueryException e
      (if (.isRetryable e)
        (throw (ex-info (tru "BigQueryException executing query")
                 {:retryable? (.isRetryable e), :sql sql, :parameters parameters}
                 e))
        (throw-invalid-query e sql parameters)))
    (catch Throwable e
      (throw-invalid-query e sql parameters))))

(defn- ^TableResult execute-bigquery-on-db
  [database sql parameters cancel-chan cancel-requested?]
  (execute-bigquery
    (database->client database)
    sql
    parameters
    cancel-chan
    cancel-requested?))

(defn- fetch-page [^TableResult response cancel-requested?]
  (when response
    (when *page-callback*
      (*page-callback*))
    (lazy-cat
      (.getValues response)
      (when (some? (.getNextPageToken response))
        (if @cancel-requested?
          (do (log/debug "Cancellation requested; terminating fetching of BigQuery pages")
              [])
          (fetch-page (.getNextPage response) cancel-requested?))))))

(defn- post-process-native
  "Parse results of a BigQuery query. `respond` is the same function passed to
  `metabase.driver/execute-reducible-query`, and has the signature

    (respond results-metadata rows)"
  [database respond ^TableResult resp cancel-requested?]
  (let [^Schema schema
        (.getSchema resp)

        parsers
        (doall
          (for [^Field field (.getFields schema)
                :let                    [column-type (.. field getType name)
                                         column-mode (.getMode field)
                                         method (get-method bigquery.qp/parse-result-of-type column-type)]]
            (partial method column-type column-mode bigquery.common/*bigquery-timezone-id*)))

        columns
        (for [column (table-schema->metabase-field-info schema)]
          (-> column
            (set/rename-keys {:base-type :base_type})
            (dissoc :database-type :database-position)))]
    (respond
      {:cols columns}
      (for [^FieldValueList row (fetch-page resp cancel-requested?)]
        (for [[^FieldValue cell, parser] (partition 2 (interleave row parsers))]
          (when-let [v (.getValue cell)]
            ;; There is a weird error where everything that *should* be NULL comes back as an Object.
            ;; See https://jira.talendforge.org/browse/TBD-1592
            ;; Everything else comes back as a String luckily so we can proceed normally.
            (when-not (= (class v) Object)
              (parser v))))))))

(defn- process-native* [respond database sql parameters cancel-chan]
  {:pre [(map? database) (map? (:details database))]}
  ;; automatically retry the query if it times out or otherwise fails. This is on top of the auto-retry added by
  ;; `execute`
  (let [cancel-requested? (atom false)
        thunk             (fn []
                            (post-process-native database
                                                 respond
                                                 (execute-bigquery-on-db
                                                  database
                                                  sql
                                                  parameters
                                                  cancel-chan
                                                  cancel-requested?)
                                                 cancel-requested?))]
    (try
      (thunk)
      (catch Throwable e
        (let [ex-data (u/all-ex-data e)]
          (if (or (:retryable? e) (not (error-type/client-error? (:type ex-data))))
            (thunk)
            (throw e)))))))

(defn- effective-query-timezone-id [database]
  (if (get-in database [:details :use-jvm-timezone])
    (qp.timezone/system-timezone-id)
    "UTC"))

(defmethod driver/execute-reducible-query :bigquery-cloud-sdk
  [_ {{sql :query, :keys [params]} :native, :as outer-query} context respond]
  (let [database (qp.store/database)]
    (binding [bigquery.common/*bigquery-timezone-id* (effective-query-timezone-id database)]
      (log/tracef "Running BigQuery query in %s timezone" bigquery.common/*bigquery-timezone-id*)
      (let [sql (if (get-in database [:details :include-user-id-and-hash] true)
                  (str "-- " (qputil/query->remark :bigquery-cloud-sdk outer-query) "\n" sql)
                  sql)]
        (process-native* respond database sql params (context/canceled-chan context))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Other Driver Method Impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/supports? [:bigquery-cloud-sdk :percentile-aggregations] [_ _] true)

(defmethod driver/supports? [:bigquery-cloud-sdk :expressions] [_ _] true)

(defmethod driver/supports? [:bigquery-cloud-sdk :foreign-keys] [_ _] true)

;; BigQuery is always in UTC
(defmethod driver/db-default-timezone :bigquery-cloud-sdk [_ _]
  "UTC")

(defmethod driver/db-start-of-week :bigquery-cloud-sdk
  [_]
  :sunday)


(defmethod driver/notify-database-updated :bigquery-cloud-sdk
  [_ database]
  (bigquery.common/populate-project-id-from-credentials! database))
