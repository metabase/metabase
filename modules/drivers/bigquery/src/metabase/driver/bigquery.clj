(ns metabase.driver.bigquery
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.bigquery.common :as bigquery.common]
            [metabase.driver.bigquery.params :as bigquery.params]
            [metabase.driver.bigquery.query-processor :as bigquery.qp]
            [metabase.driver.google :as google]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import com.google.api.client.googleapis.auth.oauth2.GoogleCredential
           com.google.api.client.http.HttpRequestInitializer
           [com.google.api.services.bigquery Bigquery Bigquery$Builder BigqueryScopes]
           [com.google.api.services.bigquery.model GetQueryResultsResponse QueryRequest QueryResponse Table TableCell TableFieldSchema TableList TableList$Tables TableReference TableRow TableSchema]
           java.util.Collections))

(driver/register! :bigquery, :parent #{:google :sql})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Client                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ^Bigquery credential->client [^GoogleCredential credential]
  (.build (doto (Bigquery$Builder.
                 google/http-transport
                 google/json-factory
                 (reify HttpRequestInitializer
                   (initialize [this httpRequest]
                     (.initialize credential httpRequest)
                     (.setConnectTimeout httpRequest 0)
                     (.setReadTimeout httpRequest 0))))
            (.setApplicationName google/application-name))))

(def ^:private ^{:arglists '([database])} ^GoogleCredential database->credential
  (partial google/database->credential (Collections/singleton BigqueryScopes/BIGQUERY)))

(def ^:private ^{:arglists '([database])} ^Bigquery database->client
  (comp credential->client database->credential))

(defn find-project-id
  "Select the user specified project-id or the one from the credential, in the case of a service account"
  [project-id ^GoogleCredential credential]
  (or project-id
      (.getServiceAccountProjectId credential)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Sync                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ^TableList list-tables
  "Fetch a page of Tables. By default, fetches the first page; page size is 50. For cases when more than 50 Tables are
  present, you may fetch subsequent pages by specifying the `page-token`; the token for the next page is returned with a
  page when one exists."
  ([database]
   (list-tables database nil))

  ([{{:keys [project-id dataset-id]} :details, :as database}, ^String page-token-or-nil]
   ;; RAR 2020-May-11 - this gets messy, because this function is used to determine if we
   ;; can connect to the database. If a service account JSON is being used, the project ID
   ;; field isn't required in the admin page because it's embedded in that JSON. During the
   ;; initial save, the database entry doesn't exist yet, so we haven't pulled the project ID
   ;; from that JSON. In this case, we need to go look it up in the credentials.
   ;; TODO: maybe handle this better in `driver/can-connect? :bigquery`
   (let [db-client (database->client database)
         proj-id (find-project-id project-id (database->credential database))]
    (list-tables db-client proj-id dataset-id page-token-or-nil)))

  ([^Bigquery client, ^String project-id, ^String dataset-id, ^String page-token-or-nil]
   {:pre [client (seq project-id) (seq dataset-id)]}
   (google/execute (u/prog1 (.list (.tables client) project-id dataset-id)
                     (.setPageToken <> page-token-or-nil)))))

(defmethod driver/describe-database :bigquery
  [_ database]
  ;; first page through all the 50-table pages until we stop getting "next page tokens"
  (let [tables (loop [tables [], ^TableList table-list (list-tables database)]
                 (let [tables (concat tables (.getTables table-list))]
                   (if-let [next-page-token (.getNextPageToken table-list)]
                     (recur tables (list-tables database next-page-token))
                     tables)))]
    ;; after that convert the results to MB format
    {:tables (set (for [^TableList$Tables table tables
                        :let [^TableReference tableref (.getTableReference table)]]
                    {:schema nil, :name (.getTableId tableref)}))}))

(defmethod driver/can-connect? :bigquery
  [_ details-map]
  ;; check whether we can connect by just fetching the first page of tables for the database. If that succeeds we're
  ;; g2g
  (boolean (list-tables {:details details-map})))

(s/defn get-table :- Table
  ([{{:keys [project-id dataset-id]} :details, :as database} table-id]
   (get-table (database->client database) (find-project-id project-id (database->credential database)) dataset-id table-id))

  ([client :- Bigquery, project-id :- su/NonBlankString, dataset-id :- su/NonBlankString, table-id :- su/NonBlankString]
   (google/execute (.get (.tables client) project-id dataset-id table-id))))

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
  [schema :- TableSchema]
  (for [[idx ^TableFieldSchema field] (m/indexed (.getFields schema))]
    {:name              (.getName field)
     :database-type     (.getType field)
     :base-type         (bigquery-type->base-type (.getType field))
     :database-position idx}))

(defmethod driver/describe-table :bigquery
  [_ database {table-name :name}]
  {:schema nil
   :name   table-name
   :fields (set (table-schema->metabase-field-info (.getSchema (get-table database table-name))))})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Running Queries                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^:const ^Integer query-timeout-seconds 60)

(def ^:private ^:dynamic ^Long max-results-per-page
  "Maximum number of rows to return per page in a query."
  20000)

(def ^:private ^:dynamic page-callback
  "Callback to execute when a new page is retrieved, used for testing"
  nil)

(defprotocol ^:private GetJobComplete
  "A Clojure protocol for the .getJobComplete method on disparate Google BigQuery results"
  (^:private job-complete? [this] "Call .getJobComplete on a BigQuery API response"))

(extend-protocol GetJobComplete
  com.google.api.services.bigquery.model.QueryResponse
  (job-complete? [this] (.getJobComplete ^QueryResponse this))

  com.google.api.services.bigquery.model.GetQueryResultsResponse
  (job-complete? [this] (.getJobComplete ^GetQueryResultsResponse this)))

(defn do-with-finished-response
  "Impl for `with-finished-response`."
  {:style/indent 1}
  [response f]
  ;; 99% of the time by the time this is called `.getJobComplete` will return `true`. On the off chance it doesn't,
  ;; wait a few seconds for the job to finish.
  (loop [remaining-timeout (double query-timeout-seconds)]
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

(defn- ^GetQueryResultsResponse get-query-results
  [^Bigquery client ^String project-id ^String job-id ^String location ^String page-token]
  (when page-callback
    (page-callback))
  (let [request (doto (.getQueryResults (.jobs client) project-id job-id)
                  (.setMaxResults max-results-per-page)
                  (.setPageToken page-token)
                  (.setLocation location))]
    (google/execute request)))

(defn- ^GetQueryResultsResponse execute-bigquery
  ([{{:keys [project-id]} :details, :as database} sql parameters]
   (execute-bigquery (database->client database) (find-project-id project-id (database->credential database)) sql parameters))

  ([^Bigquery client ^String project-id ^String sql parameters]
   {:pre [client (seq project-id) (seq sql)]}
   (try
     (let [request        (doto (QueryRequest.)
                            (.setTimeoutMs (* query-timeout-seconds 1000))
                            ;; if the query contains a `#legacySQL` directive then use legacy SQL instead of standard SQL
                            (.setUseLegacySql (str/includes? (str/lower-case sql) "#legacysql"))
                            (.setQuery sql)
                            (bigquery.params/set-parameters! parameters))
           query-response ^QueryResponse (google/execute (.query (.jobs client) project-id request))
           job-ref        (.getJobReference query-response)
           location       (.getLocation job-ref)
           job-id         (.getJobId job-ref)
           proj-id        (.getProjectId job-ref)]
       (with-finished-response [_ query-response]
         (get-query-results client proj-id job-id location nil)))
     (catch Throwable e
       (throw (ex-info (tru "Error executing query")
                       {:type error-type/invalid-query, :sql sql, :parameters parameters}
                       e))))))

(defn- post-process-native
  "Parse results of a BigQuery query. `respond` is the same function passed to
  `metabase.driver/execute-reducible-query`, and has the signature

    (respond results-metadata rows)"
  [database respond ^GetQueryResultsResponse resp]
  (with-finished-response [^GetQueryResultsResponse response resp]
    (let [^TableSchema schema
          (.getSchema response)

          parsers
          (doall
           (for [^TableFieldSchema field (.getFields schema)
                 :let                    [column-type (.getType field)
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
       (letfn [(fetch-page [^GetQueryResultsResponse response]
                 (lazy-cat
                  (.getRows response)
                  (when-let [next-page-token (.getPageToken response)]
                    (with-finished-response [next-resp (get-query-results (database->client database)
                                                                          (.getProjectId (.getJobReference response))
                                                                          (.getJobId (.getJobReference response))
                                                                          (.getLocation (.getJobReference response))
                                                                          next-page-token)]
                      (fetch-page next-resp)))))]
         (for [^TableRow row (fetch-page response)]
           (for [[^TableCell cell, parser] (partition 2 (interleave (.getF row) parsers))]
             (when-let [v (.getV cell)]
             ;; There is a weird error where everything that *should* be NULL comes back as an Object.
             ;; See https://jira.talendforge.org/browse/TBD-1592
             ;; Everything else comes back as a String luckily so we can proceed normally.
              (when-not (= (class v) Object)
                (parser v))))))))))

(defn- process-native* [respond database sql parameters]
  {:pre [(map? database) (map? (:details database))]}
  ;; automatically retry the query if it times out or otherwise fails. This is on top of the auto-retry added by
  ;; `execute`
  (letfn [(thunk []
            (post-process-native database respond (execute-bigquery database sql parameters)))]
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

(defmethod driver/execute-reducible-query :bigquery
  ;; TODO - it doesn't actually cancel queries the way we'd expect
  [_ {{sql :query, :keys [params]} :native, :as outer-query} _ respond]
  (let [database (qp.store/database)]
    (binding [bigquery.common/*bigquery-timezone-id* (effective-query-timezone-id database)]
      (log/tracef "Running BigQuery query in %s timezone" bigquery.common/*bigquery-timezone-id*)
      (let [sql (if (get-in database [:details :include-user-id-and-hash] true)
                  (str "-- " (qputil/query->remark :bigquery outer-query) "\n" sql)
                  sql)]
        (process-native* respond database sql params)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Other Driver Method Impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/supports? [:bigquery :percentile-aggregations] [_ _] false)

(defmethod driver/supports? [:bigquery :expressions] [_ _] false)

(defmethod driver/supports? [:bigquery :foreign-keys] [_ _] true)

;; BigQuery is always in UTC
(defmethod driver/db-default-timezone :bigquery [_ _]
  "UTC")

(defmethod driver/db-start-of-week :bigquery
  [_]
  :sunday)
