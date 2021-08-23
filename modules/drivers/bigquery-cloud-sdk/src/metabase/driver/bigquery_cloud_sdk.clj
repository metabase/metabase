(ns metabase.driver.bigquery-cloud-sdk
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
            [metabase.driver.bigquery-cloud-sdk.params :as bigquery.params]
            [metabase.driver.bigquery-cloud-sdk.query-processor :as bigquery.qp]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import com.google.auth.oauth2.ServiceAccountCredentials
           [com.google.cloud.bigquery BigQuery BigQuery$DatasetOption BigQuery$JobOption BigQuery$TableListOption
                                      BigQuery$TableOption BigQueryOptions DatasetId EmptyTableResult Field FieldValue
                                      FieldValueList QueryJobConfiguration Schema Table TableId TableResult]
           java.io.ByteArrayInputStream
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

(defn- database->service-account-credential
  "Returns a `ServiceAccountCredentials` (not scoped) for the given DB, from its service account JSON."
  ^ServiceAccountCredentials [{{:keys [^String service-account-json]} :details
                               :as             db}]
  {:pre [(map? db) (seq service-account-json)]}
  (ServiceAccountCredentials/fromStream (ByteArrayInputStream. (.getBytes service-account-json))))

(defn- ^BigQuery database->client
  [database]
  (let [creds   (database->service-account-credential database)
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

(defn- bigquery-type->base-type [field-type]
  (case field-type
    "BOOLEAN"   :type/Boolean
    "FLOAT"     :type/Float
    "INTEGER"   :type/Integer
    "RECORD"    :type/Dictionary ; RECORD -> field has a nested schema
    "STRING"    :type/Text
    "DATE"      :type/Date
    "DATETIME"  :type/DateTime
    "TIMESTAMP" :type/DateTimeWithLocalTZ
    "TIME"      :type/Time
    "NUMERIC"   :type/Decimal
    :type/*))

(s/defn ^:private table-schema->metabase-field-info
  [schema :- Schema]
  (for [[idx ^Field field] (m/indexed (.getFields schema))]
    (let [type-name (.. field getType name)]
      {:name              (.getName field)
       :database-type     type-name
       :base-type         (bigquery-type->base-type type-name)
       :database-position idx})))

(defmethod driver/describe-table :bigquery-cloud-sdk
  [_ database {table-name :name}]
  {:schema nil
   :name   table-name
   :fields (set (table-schema->metabase-field-info (.. (get-table database table-name) getDefinition getSchema)))})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Running Queries                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^:dynamic ^Integer *query-timeout-seconds* 60)

(def ^:private ^:dynamic ^Long *max-results-per-page*
  "Maximum number of rows to return per page in a query."
  20000)

(def ^:private ^:dynamic *page-callback*
  "Callback to execute when a new page is retrieved, used for testing"
  nil)

(defprotocol ^:private GetJobComplete
  "A Clojure protocol for the .getJobComplete method on disparate Google BigQuery results"
  (^:private job-complete? [this] "Call .getJobComplete on a BigQuery API response"))

(extend-protocol GetJobComplete
  com.google.api.services.bigquery.model.QueryResponse
  (job-complete? [this] (.getJobComplete ^com.google.api.services.bigquery.model.QueryResponse this))

  com.google.api.services.bigquery.model.GetQueryResultsResponse
  (job-complete? [this] (.getJobComplete ^com.google.api.services.bigquery.model.GetQueryResultsResponse this))

  EmptyTableResult
  (job-complete? [this] true))

(defn do-with-finished-response
  "Impl for `with-finished-response`."
  {:style/indent 1}
  [response f]
  ;; 99% of the time by the time this is called `.getJobComplete` will return `true`. On the off chance it doesn't,
  ;; wait a few seconds for the job to finish.
  (loop [remaining-timeout (double *query-timeout-seconds*)]
    (cond
      (job-complete? response)
      (f response)

      (pos? remaining-timeout)
      (do
        (Thread/sleep 250)
        (recur (- remaining-timeout 0.25)))

      :else
      (throw (ex-info "Query timed out." (into {} response))))))

(defmacro with-finished-response
  "Exeecute `body` with after waiting for `response` to complete. Throws exception if response does not complete before
  `query-timeout-seconds`.

    (with-finished-response [response (execute-bigquery ...)]
      ...)"
  [[response-binding response] & body]
  `(do-with-finished-response
    ~response
    (fn [~response-binding]
      ~@body)))

(defn- ^TableResult execute-bigquery
  [^BigQuery client ^String sql parameters]
  {:pre [client (not (str/blank? sql))]}
  (try
    (let [request        (doto (QueryJobConfiguration/newBuilder sql)
                           (.setJobTimeoutMs (if (> *query-timeout-seconds* 0)
                                               (* *query-timeout-seconds* 1000)
                                               nil))
                           ;; if the query contains a `#legacySQL` directive then use legacy SQL instead of standard SQL
                           (.setUseLegacySql (str/includes? (str/lower-case sql) "#legacysql"))
                           (bigquery.params/set-parameters! parameters)
                           (.setMaxResults *max-results-per-page*))]
      (.query client (.build request) (u/varargs BigQuery$JobOption)))
    (catch Throwable e
      (throw (ex-info (tru "Error executing query")
               {:type error-type/invalid-query, :sql sql, :parameters parameters}
               e)))))

(defn- ^TableResult execute-bigquery-on-db
  [database sql parameters]
  (execute-bigquery
    (database->client database)
    sql
    parameters))

(defn- post-process-native
  "Parse results of a BigQuery query. `respond` is the same function passed to
  `metabase.driver/execute-reducible-query`, and has the signature

    (respond results-metadata rows)"
  [database respond ^TableResult resp]
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
      (letfn [(fetch-page [^TableResult response]
                (when response
                  (when *page-callback*
                    (*page-callback*))
                  (lazy-cat
                    (.getValues response)
                    (when (some? (.getNextPageToken response))
                      (fetch-page (.getNextPage response))))))]
        (for [^FieldValueList row (fetch-page resp)]
          (for [[^FieldValue cell, parser] (partition 2 (interleave row parsers))]
            (when-let [v (.getValue cell)]
              ;; There is a weird error where everything that *should* be NULL comes back as an Object.
              ;; See https://jira.talendforge.org/browse/TBD-1592
              ;; Everything else comes back as a String luckily so we can proceed normally.
              (when-not (= (class v) Object)
                (parser v)))))))))

(defn- process-native* [respond database sql parameters]
  {:pre [(map? database) (map? (:details database))]}
  ;; automatically retry the query if it times out or otherwise fails. This is on top of the auto-retry added by
  ;; `execute`
  (letfn [(thunk []
            (post-process-native database respond (execute-bigquery-on-db database sql parameters)))]
    (try
      (thunk)
      (catch Throwable e
        (if-not (error-type/client-error? (:type (u/all-ex-data e)))
          (thunk)
          (throw e))))))

(defn- effective-query-timezone-id [database]
  (if (get-in database [:details :use-jvm-timezone])
    (qp.timezone/system-timezone-id)
    "UTC"))

(defmethod driver/execute-reducible-query :bigquery-cloud-sdk
  ;; TODO - it doesn't actually cancel queries the way we'd expect
  [_ {{sql :query, :keys [params]} :native, :as outer-query} _ respond]
  (let [database (qp.store/database)]
    (binding [bigquery.common/*bigquery-timezone-id* (effective-query-timezone-id database)]
      (log/tracef "Running BigQuery query in %s timezone" bigquery.common/*bigquery-timezone-id*)
      (let [sql (if (get-in database [:details :include-user-id-and-hash] true)
                  (str "-- " (qputil/query->remark :bigquery-cloud-sdk outer-query) "\n" sql)
                  sql)]
        (process-native* respond database sql params)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Other Driver Method Impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/supports? [:bigquery-cloud-sdk :percentile-aggregations] [_ _] false)

(defmethod driver/supports? [:bigquery-cloud-sdk :expressions] [_ _] false)

(defmethod driver/supports? [:bigquery-cloud-sdk :foreign-keys] [_ _] true)

;; BigQuery is always in UTC
(defmethod driver/db-default-timezone :bigquery-cloud-sdk [_ _]
  "UTC")

(defmethod driver/db-start-of-week :bigquery-cloud-sdk
  [_]
  :sunday)
