(ns metabase.driver.bigquery.client
  "Wrapper around the BigQuery API itself. Provides a few things:

   *  Logic for obtaining a BigQuery 'client' from connection details, which is used for making requests needed for
      syncing and running queries;
   *  Functions for obtaining metadata about the tables and fields belonging to a database
   *  Functions used for running queries themselves and post-processing the results"
  (:require [clojure
             [set :as set]
             [string :as str]]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.driver.google :as google]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u])
  (:import com.google.api.client.googleapis.auth.oauth2.GoogleCredential
           [com.google.api.services.bigquery Bigquery Bigquery$Builder BigqueryScopes]
           [com.google.api.services.bigquery.model QueryRequest QueryResponse Table TableCell TableFieldSchema
            TableList TableList$Tables TableReference TableRow TableSchema]
           [java.util Collections Date TimeZone]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     CLIENT                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ^Bigquery credential->client [^GoogleCredential credential]
  (.build (doto (Bigquery$Builder. google/http-transport google/json-factory credential)
            (.setApplicationName google/application-name))))

(def ^:private ^{:arglists '([database])} ^GoogleCredential database->credential
  (partial google/database->credential (Collections/singleton BigqueryScopes/BIGQUERY)))

(def ^{:arglists '([database])} ^Bigquery database->client
  "Given a Metabase `Database` return a BigQuery client for making requests and the like."
  (comp credential->client database->credential))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            DATABASE METADATA (SYNC)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ^TableList list-tables
  "Fetch a page of Tables. By default, fetches the first page; page size is 50. For cases when more than 50 Tables are
  present, you may fetch subsequent pages by specifying the PAGE-TOKEN; the token for the next page is returned with a
  page when one exists."
  ([database]
   (list-tables database nil))

  ([{{:keys [project-id dataset-id]} :details, :as database}, ^String page-token-or-nil]
   (list-tables (database->client database) project-id dataset-id page-token-or-nil))

  ([^Bigquery client, ^String project-id, ^String dataset-id, ^String page-token-or-nil]
   {:pre [client (seq project-id) (seq dataset-id)]}
   (google/execute (u/prog1 (.list (.tables client) project-id dataset-id)
                     (.setPageToken <> page-token-or-nil)))))

(defn describe-database
  "Describe the tables in Metabase `database`."
  [database]
  {:pre [(map? database)]}
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

(defn can-connect?
  "Can we connect to a BigQuery database with connection `details-map`?"
  [details-map]
  {:pre [(map? details-map)]}
  ;; check whether we can connect by just fetching the first page of tables for the database. If that succeeds we're
  ;; g2g
  (boolean (list-tables {:details details-map})))


(defn- ^Table get-table
  ([{{:keys [project-id dataset-id]} :details, :as database} table-id]
   (get-table (database->client database) project-id dataset-id table-id))

  ([^Bigquery client, ^String project-id, ^String dataset-id, ^String table-id]
   {:pre [client (seq project-id) (seq dataset-id) (seq table-id)]}
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
    "TIMESTAMP" :type/DateTime
    :type/*))

(defn table-schema->metabase-field-info
  "Given a BigQuery `TableSchema` representation of the fields in a table, return a sequence of maps corresponding to
  the `TableMetadataField` schema used by the Metabase sync process."
  [^TableSchema schema]
  (for [^TableFieldSchema field (.getFields schema)]
    {:name          (.getName field)
     :database-type (.getType field)
     :base-type     (bigquery-type->base-type (.getType field))}))

(defn describe-table
  "Describe the fields in a BigQuery table."
  [database {table-name :name}]
  {:schema nil
   :name   table-name
   :fields (set (table-schema->metabase-field-info (.getSchema (get-table database table-name))))})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                RUNNING QUERIES                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^:const ^Integer query-timeout-seconds 60)

(defn ^QueryResponse execute-bigquery
  "Execute a BigQuery native SQL query and return the results."
  ^{:arglists '([database query-string] [client project-id query-string])}
  ([{{:keys [project-id]} :details, :as database} query-string]
   (execute-bigquery (database->client database) project-id query-string))

  ([^Bigquery client, ^String project-id, ^String query-string]
   {:pre [client (seq project-id) (seq query-string)]}
   (let [request (doto (QueryRequest.)
                   (.setTimeoutMs (* query-timeout-seconds 1000))
                   ;; if the query contains a `#standardSQL` directive then use Standard SQL instead of legacy SQL
                   (.setUseLegacySql (not (str/includes? (str/lower-case query-string) "#standardsql")))
                   (.setQuery query-string))]
     (google/execute (.query (.jobs client) project-id request)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                POST-PROCESSING                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; There is an argument to be made that post-processing code isn't really "client" code per-se and instead should
;; belong with the rest of the query processing code. However the post-processing logic below primarly makes sure
;; results returned by the BigQuery API are in the format expected elsewhere in the codebase. For that reason, they
;; are grouped with other code for interacting with the API.

(defn- parse-timestamp-str [s]
  ;; Timestamp strings either come back as ISO-8601 strings or Unix timestamps in µs, e.g. "1.3963104E9"
  (or
   (u/->Timestamp s)
   ;; If parsing as ISO-8601 fails parse as a double then convert to ms. Add the appropriate number of milliseconds to
   ;; the number to convert it to the local timezone. We do this because the dates come back in UTC but we want the
   ;; grouping to match the local time (HUH?) This gives us the same results as the other
   ;; `has-questionable-timezone-support?` drivers. Not sure if this is actually desirable, but if it's not, it
   ;; probably means all of those other drivers are doing it wrong
   (let [default-timezone (TimeZone/getDefault)]
     (u/->Timestamp (- (* (Double/parseDouble s) 1000)
                       (.getDSTSavings default-timezone)
                       (.getRawOffset  default-timezone))))))

(def ^:private type->parser
  "Functions that should be used to coerce string values in responses to the appropriate type for their column."
  {"BOOLEAN"   #(Boolean/parseBoolean %)
   "FLOAT"     #(Double/parseDouble %)
   "INTEGER"   #(Long/parseLong %)
   "RECORD"    identity
   "STRING"    identity
   "DATE"      parse-timestamp-str
   "DATETIME"  parse-timestamp-str
   "TIMESTAMP" parse-timestamp-str})

(defn- post-process-native
  ([^QueryResponse response]
   (post-process-native response query-timeout-seconds))
  ([^QueryResponse response, ^Integer timeout-seconds]
   (if-not (.getJobComplete response)
     ;; 99% of the time by the time this is called `.getJobComplete` will return `true`. On the off chance it doesn't,
     ;; wait a few seconds for the job to finish.
     (do
       (when (zero? timeout-seconds)
         (throw (ex-info "Query timed out." (into {} response))))
       (Thread/sleep 1000)
       (post-process-native response (dec timeout-seconds)))
     ;; Otherwise the job *is* complete
     (let [^TableSchema schema (.getSchema response)
           parsers             (for [^TableFieldSchema field (.getFields schema)]
                                 (type->parser (.getType field)))
           columns             (for [column (table-schema->metabase-field-info schema)]
                                 (set/rename-keys column {:base-type :base_type}))]
       {:columns (map :name columns)
        :cols    columns
        :rows    (for [^TableRow row (.getRows response)]
                   (for [[^TableCell cell, parser] (partition 2 (interleave (.getF row) parsers))]
                     (when-let [v (.getV cell)]
                       ;; There is a weird error where everything that *should* be NULL comes back as an Object.
                       ;; See https://jira.talendforge.org/browse/TBD-1592
                       ;; Everything else comes back as a String luckily so we can proceed normally.
                       (when-not (= (class v) Object)
                         (parser v)))))}))))

(defn- post-process-mbql [dataset-id table-name {:keys [columns rows]}]
  ;; Since we don't alias column names the come back like "veryNiceDataset_shakepeare_corpus". Strip off the dataset
  ;; and table IDs
  (let [demangle-name (u/rpartial str/replace (re-pattern (str \^ dataset-id \_ table-name \_)) "")
        columns       (for [column columns]
                        (keyword (demangle-name column)))
        rows          (for [row rows]
                        (zipmap columns row))
        columns       (vec (keys (first rows)))]
    {:columns columns
     :rows    (for [row rows]
                (mapv row columns))}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      EXECUTE-QUERY (IDRIVER METHOD) IMPL                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- process-native* [database query-string]
  ;; automatically retry the query if it times out or otherwise fails. This is on top of the auto-retry added by
  ;; `execute` so operations going through `process-native*` may be retried up to 3 times.
  (u/auto-retry 1
    (post-process-native (execute-bigquery database query-string))))

(defn execute-query
  "Execute a native BigQuery SQL query, and post-process the results."
  {:arglists '([outer-query])}
  [{{{:keys [dataset-id]} :details, :as database}          :database
    {sql :query, params :params, :keys [table-name mbql?]} :native
    :as                                                    outer-query}]
  (let [sql     (str "-- " (qputil/query->remark outer-query) "\n" (if (seq params)
                                                                     (unprepare/unprepare (cons sql params))
                                                                     sql))
        results (process-native* database sql)
        results (if mbql?
                  (post-process-mbql dataset-id table-name results)
                  (update results :columns (partial map keyword)))]
    (assoc results :annotate? mbql?)))
