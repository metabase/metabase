(ns metabase.driver.bigquery
  (:require (clojure [string :as s]
                     [walk :as walk])
            [clojure.tools.logging :as log]
            (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as kutils]
            (metabase [config :as config]
                      [db :as db]
                      [driver :as driver])
            (metabase.driver [generic-sql :as sql]
                             [sync :as sync])
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            metabase.driver.query-processor.interface
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [table :as table])
            [metabase.util :as u]
            [metabase.util.korma-extensions :as kx])
  (:import (java.util Collections Date)
           (com.google.api.client.googleapis.auth.oauth2 GoogleCredential GoogleCredential$Builder GoogleAuthorizationCodeFlow GoogleAuthorizationCodeFlow$Builder GoogleTokenResponse)
           com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
           (com.google.api.client.googleapis.json GoogleJsonError GoogleJsonResponseException)
           com.google.api.client.googleapis.services.AbstractGoogleClientRequest
           com.google.api.client.http.HttpTransport
           com.google.api.client.json.JsonFactory
           com.google.api.client.json.jackson2.JacksonFactory
           (com.google.api.services.bigquery Bigquery Bigquery$Builder BigqueryScopes)
           (com.google.api.services.bigquery.model Table TableCell TableFieldSchema TableList TableList$Tables TableReference TableRow TableSchema QueryRequest QueryResponse)
           (metabase.driver.query_processor.interface DateTimeValue Value)))

(def ^:private ^HttpTransport http-transport (GoogleNetHttpTransport/newTrustedTransport))
(def ^:private ^JsonFactory   json-factory   (JacksonFactory/getDefaultInstance))

(def ^:private ^:const ^String redirect-uri "urn:ietf:wg:oauth:2.0:oob")

(defn- execute
  "`execute` REQUEST, and catch any `GoogleJsonResponseException` is
  throws, converting them to `ExceptionInfo` and rethrowing them."
  [^AbstractGoogleClientRequest request]
  (try (.execute request)
       (catch GoogleJsonResponseException e
         (let [^GoogleJsonError error (.getDetails e)]
           (throw (ex-info (or (.getMessage error)
                               (.getStatusMessage e))
                           (into {} error)))))))

(defn- ^Bigquery credential->client [^GoogleCredential credential]
  (.build (doto (Bigquery$Builder. http-transport json-factory credential)
            (.setApplicationName (str "Metabase " config/mb-version-string)))))

(defn- fetch-access-and-refresh-tokens* [^String client-id, ^String client-secret, ^String auth-code]
  {:pre  [(seq client-id) (seq client-secret) (seq auth-code)]
   :post [(seq (:access-token %)) (seq (:refresh-token %))]}
  (log/info (u/format-color 'magenta "Fetching BigQuery access/refresh tokens with auth-code '%s'..." auth-code))
  (let [^GoogleAuthorizationCodeFlow flow (.build (doto (GoogleAuthorizationCodeFlow$Builder. http-transport json-factory client-id client-secret (Collections/singleton BigqueryScopes/BIGQUERY))
                                                    (.setAccessType "offline")))
        ^GoogleTokenResponse response     (.execute (doto (.newTokenRequest flow auth-code) ; don't use `execute` here because this is a *different* type of Google request
                                                      (.setRedirectUri redirect-uri)))]
    {:access-token (.getAccessToken response), :refresh-token (.getRefreshToken response)}))

;; Memoize this function because you're only allowed to redeem an auth-code once. This way we can redeem it the first time when `can-connect?` checks to see if the DB details are
;; viable; then the second time we go to redeem it we can save the access token and refresh token with the newly created `Database` <3
(def ^:private ^{:arglists '([client-id client-secret auth-code])} fetch-access-and-refresh-tokens (memoize fetch-access-and-refresh-tokens*))

(defn- database->credential
  "Get a `GoogleCredential` for a `DatabaseInstance`."
  {:arglists '([database])}
  ^GoogleCredential [{{:keys [^String client-id, ^String client-secret, ^String auth-code, ^String access-token, ^String refresh-token], :as details} :details, id :id, :as db}]
  {:pre [(seq client-id) (seq client-secret) (or (seq auth-code)
                                                 (and (seq access-token) (seq refresh-token)))]}
  (if-not (and (seq access-token)
               (seq refresh-token))
    ;; If Database doesn't have access/refresh tokens fetch them and try again
    (let [details (-> (merge details (fetch-access-and-refresh-tokens client-id client-secret auth-code))
                      (dissoc :auth-code))]
      (when id
        (db/upd Database id :details details))
      (recur (assoc db :details details)))
    ;; Otherwise return credential as normal
    (doto (.build (doto (GoogleCredential$Builder.)
                    (.setClientSecrets client-id client-secret)
                    (.setJsonFactory json-factory)
                    (.setTransport http-transport)))
      (.setAccessToken  access-token)
      (.setRefreshToken refresh-token))))

(def ^:private ^{:arglists '([database])} ^Bigquery database->client (comp credential->client database->credential))


(defn- ^TableList list-tables
  ([{{:keys [project-id dataset-id]} :details, :as database}]
   (list-tables (database->client database) project-id dataset-id))

  ([^Bigquery client, ^String project-id, ^String dataset-id]
   {:pre [client (seq project-id) (seq dataset-id)]}
   (execute (.list (.tables client) project-id dataset-id))))

(defn- describe-database [database]
  {:pre [(map? database)]}
  {:tables (set (for [^TableList$Tables table (.getTables (list-tables database))
                      :let [^TableReference tableref (.getTableReference table)]]
                  {:name (.getTableId tableref)}))})

(defn- can-connect? [details-map]
  {:pre [(map? details-map)]}
  (boolean (describe-database {:details details-map})))


(defn- ^Table get-table
  ([{{:keys [project-id dataset-id]} :details, :as database} table-id]
   (get-table (database->client database) project-id dataset-id table-id))

  ([^Bigquery client, ^String project-id, ^String dataset-id, ^String table-id]
   {:pre [client (seq project-id) (seq dataset-id) (seq table-id)]}
   (execute (.get (.tables client) project-id dataset-id table-id))))

(def ^:private ^:const  bigquery-type->base-type
  {"BOOLEAN"   :BooleanField
   "FLOAT"     :FloatField
   "INTEGER"   :IntegerField
   "RECORD"    :DictionaryField ; RECORD -> field has a nested schema
   "STRING"    :TextField
   "TIMESTAMP" :DateTimeField})

(defn- table-schema->metabase-field-info [^TableSchema schema]
  (for [^TableFieldSchema field (.getFields schema)]
    {:name            (.getName field)
     :base-type       (bigquery-type->base-type (.getType field))}))

(defn- describe-table
  ([table]
   (describe-table (table/database table) (:name table)))
  ([database table-name]
   {:name   table-name
    :fields (set (table-schema->metabase-field-info (.getSchema (get-table database table-name))))}))


(defn- ^QueryResponse execute-query
  ([{{:keys [project-id]} :details, :as database} query-string]
   (execute-query (database->client database) project-id query-string))

  ([^Bigquery client, ^String project-id, ^String query-string]
   {:pre [client (seq project-id) (seq query-string)]}
   (let [request (doto (QueryRequest.)
                   #_(.setUseLegacySql false)   ; use standards-compliant non-legacy dialect
                   (.setQuery query-string))]
     (execute (.query (.jobs client) project-id request)))))

(def ^:private ^java.util.TimeZone default-timezone
  (java.util.TimeZone/getDefault))

(defn- parse-timestamp-str [s]
  ;; Timestamp strings either come back as ISO-8601 strings or Unix timestamps in µs, e.g. "1.3963104E9"
  (try (u/->Timestamp s)
       (catch IllegalArgumentException _
         ;; If parsing as ISO-8601 fails parse as a double then convert to ms
         ;; Add the appropriate number of milliseconds to the number to convert it to the local timezone.
         ;; We do this because the dates come back in UTC but we want the grouping to match the local time (HUH?)
         ;; This gives us the same results as the other `has-questionable-timezone-support?` drivers
         ;; Not sure if this is actually desirable, but if it's not, it probably means all of those other drivers are doing it wrong
         (u/->Timestamp (- (* (Double/parseDouble s) 1000)
                           (.getDSTSavings default-timezone)
                           (.getRawOffset  default-timezone))))))

(def ^:private type->parser
  "Functions that should be used to coerce string values in responses to the appropriate type for their column."
  {"BOOLEAN"   #(Boolean/parseBoolean %)
   "FLOAT"     #(Double/parseDouble %)
   "INTEGER"   #(Integer/parseInt %)
   "RECORD"    identity
   "STRING"    identity
   "TIMESTAMP" parse-timestamp-str})

(defn- post-process-native [^QueryResponse response]
  (when-not (.getJobComplete response)
    (throw (Exception. (str (.getErrors response)))))
  (let [^TableSchema schema (.getSchema response)
        parsers             (for [^TableFieldSchema field (.getFields schema)]
                              (type->parser (.getType field)))
        cols                (table-schema->metabase-field-info schema)]
    {:columns (map :name cols)
     :cols    cols
     :rows    (for [^TableRow row (.getRows response)]
                (for [[^TableCell cell, parser] (partition 2 (interleave (.getF row) parsers))]
                  (parser (.getV cell))))}))

(defn- process-native* [database query-string]
  (post-process-native (execute-query database query-string)))

(defn- process-native [{database-id :database, {native-query :query} :native}]
  (process-native* (Database database-id) native-query))


(defn- field-values-lazy-seq [{field-name :name, :as field-instance}]
  {:pre [(map? field-instance)]}
  (let [{table-name :name, :as table}                 (field/table field-instance)
        {{dataset-name :dataset-id} :details, :as db} (table/database table)
        query                                         (format "SELECT [%s.%s.%s] FROM [%s.%s] LIMIT %d"
                                                              dataset-name table-name field-name dataset-name table-name driver/field-values-lazy-seq-chunk-size)
        fetch-page                                    (fn [page]
                                                        (map first (:rows (process-native* db (str query " OFFSET " (* page driver/field-values-lazy-seq-chunk-size))))))
        fetch-all                                     (fn fetch-all [page]
                                                        (lazy-seq (let [results               (fetch-page page)
                                                                        total-results-fetched (* page driver/field-values-lazy-seq-chunk-size)]
                                                                    (concat results
                                                                            (when (and (= (count results) driver/field-values-lazy-seq-chunk-size)
                                                                                       (< total-results-fetched driver/max-sync-lazy-seq-results))
                                                                              (fetch-all (inc page)))))))]
    (fetch-all 0)))




;;; # Generic SQL Driver Methods

(defn- date-add [unit timestamp interval]
  (k/sqlfn* :DATE_ADD timestamp interval (kx/literal unit)))

;; µs = unix timestamp in microseconds. Most BigQuery functions like strftime require timestamps in this format

(def ^:private ->µs (partial k/sqlfn* :TIMESTAMP_TO_USEC))

(defn- µs->str [format-str µs]
  (k/sqlfn* :STRFTIME_UTC_USEC µs (kx/literal format-str)))

(defn- trunc-with-format [format-str timestamp]
  (kx/->timestamp (µs->str format-str (->µs timestamp))))

(defn- date [unit expr]
  {:pre [expr]}
  (case unit
    :default         (kx/->timestamp expr)
    :minute          (trunc-with-format "%Y-%m-%d %H:%M:00" expr)
    :minute-of-hour  (kx/minute expr)
    :hour            (trunc-with-format "%Y-%m-%d %H:00:00" expr)
    :hour-of-day     (kx/hour expr)
    :day             (kx/->timestamp (k/sqlfn* :DATE expr))
    :day-of-week     (k/sqlfn* :DAYOFWEEK expr)
    :day-of-month    (k/sqlfn* :DAY expr)
    :day-of-year     (k/sqlfn* :DAYOFYEAR expr)
    :week            (date-add :DAY (date :day expr) (kx/- 1 (date :day-of-week expr)))
    :week-of-year    (kx/week expr)
    :month           (trunc-with-format "%Y-%m-01" expr)
    :month-of-year   (kx/month expr)
    :quarter         (date-add :MONTH
                               (trunc-with-format "%Y-01-01" expr)
                               (kx/* (kx/dec (date :quarter-of-year expr))
                                     3))
    :quarter-of-year (kx/quarter expr)
    :year            (kx/year expr)))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (k/sqlfn* :SEC_TO_TIMESTAMP  expr)
    :milliseconds (k/sqlfn* :MSEC_TO_TIMESTAMP expr)))


;;; # Query Processing

(declare driver)

;; this is never actually connected to, just passed to korma so it applies appropriate delimiters when building SQL
(def ^:private korma-db (-> (kdb/create-db (kdb/postgres {}))
                            (update :options assoc :delimiters [\[ \]])))


(defn- entity [dataset-id table-name]
  (-> (k/create-entity (k/raw (format "[%s.%s]" dataset-id table-name)))
      (k/database korma-db)))

;; Make the dataset-id the "schema" of every field in the query because BigQuery can't figure out fields that are qualified with their just their table name
(defn- add-dataset-id-to-fields [{{{:keys [dataset-id]} :details} :database, :as query}]
  (walk/postwalk (fn [x]
                   (if (instance? metabase.driver.query_processor.interface.Field x)
                     (assoc x :schema-name dataset-id)
                     x))
                 query))

(defn- korma-form [query entity]
  (sqlqp/build-korma-form driver (add-dataset-id-to-fields query) entity))

(defn- korma-form->sql [korma-form]
  {:pre [(map? korma-form)]}
  ;; replace identifiers like [shakespeare].[word] with ones like [shakespeare.word] since that's what BigQuery expects
  (try (s/replace (kdb/with-db korma-db
                    (k/as-sql korma-form))
                  #"\]\.\[" ".")
       (catch Throwable e
         (println (u/format-color 'red "Couldn't convert korma form to SQL:\n%s" (sqlqp/pprint-korma-form korma-form)))
         (throw e))))

(defn- post-process-structured [dataset-id table-name {:keys [columns rows]}]
  ;; Since we don't alias column names the come back like "veryNiceDataset_shakepeare_corpus". Strip off the dataset and table IDs
  (let [demangle-name (u/rpartial s/replace (re-pattern (str \^ dataset-id \_ table-name \_)) "")
        columns       (for [column columns]
                        (keyword (demangle-name column)))]
    (for [row rows]
      (zipmap columns row))))

(defn- process-structured [{{{:keys [dataset-id]} :details, :as database} :database, {{table-name :name} :source-table} :query, :as query}]
  {:pre [(map? database) (seq dataset-id) (seq table-name)]}
  (let [korma-form (korma-form query (entity dataset-id table-name))
        sql        (korma-form->sql korma-form)]
    (sqlqp/log-korma-form korma-form sql)
    (post-process-structured dataset-id table-name (process-native* database sql))))

;; This provides an implementation of `prepare-value` that prevents korma from converting forms to prepared statement parameters (`?`)
;; TODO - Move this into `metabase.driver.generic-sql` and document it as an alternate implementation for `prepare-value` (?)
;;        Or perhaps investigate a lower-level way to disable the functionality in korma, perhaps by swapping out a function somewhere
(defprotocol ^:private IPrepareValue
  (^:private prepare-value [this]))
(extend-protocol IPrepareValue
  nil           (prepare-value [_] nil)
  DateTimeValue (prepare-value [{:keys [value]}] (prepare-value value))
  Value         (prepare-value [{:keys [value]}] (prepare-value value))
  String        (prepare-value [this] (kx/literal this))
  Boolean       (prepare-value [this] (k/raw (if this "TRUE" "FALSE")))
  Date          (prepare-value [this] (k/sqlfn* :TIMESTAMP (kx/literal (u/date->iso-8601 this))))
  Number        (prepare-value [this] (k/raw this))
  Object        (prepare-value [this] (throw (Exception. (format "Don't know how to prepare value %s %s" (class this) this)))))


(defn- field->alias [{:keys [^String schema-name, ^String field-name, ^String table-name, ^Integer index, field], :as this}]
  {:pre [(map? this) (or field
                         index
                         (and (seq schema-name) (seq field-name) (seq table-name))
                         (println "Don't know how to alias: " this))]}
  (cond
    field (recur field) ; DateTimeField
    index (name (let [{{{ag-type :aggregation-type} :aggregation} :query} sqlqp/*query*]
                  (if (= ag-type :distinct) :count
                      ag-type)))
    :else (str schema-name \. table-name \. field-name)))

(defn- field->identitfier [field]
  (k/raw (str \[ (field->alias field) \])))

(defn- apply-breakout [korma-form {breakout-fields :breakout, fields-fields :fields}]
  (-> korma-form
      ;; Group by all the breakout fields
      ((partial apply k/group)  (map field->identitfier breakout-fields))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it twice, or korma will barf
      ((partial apply k/fields) (for [field breakout-fields
                                      :when (not (contains? (set fields-fields) field))]
                                  (sqlqp/as (sqlqp/formatted field) field)))))

(defn- apply-order-by [korma-form {subclauses :order-by}]
  (loop [korma-form korma-form, [{:keys [field direction]} & more] subclauses]
    (let [korma-form (k/order korma-form (field->identitfier field) (case direction
                                                                      :ascending  :ASC
                                                                      :descending :DESC))]
      (if (seq more)
        (recur korma-form more)
        korma-form))))


(defrecord BigQueryDriver []
  clojure.lang.Named
  (getName [_] "BigQuery"))

(def ^:private driver (BigQueryDriver.))

(extend BigQueryDriver
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-breakout            (u/drop-first-arg apply-breakout)
          :apply-order-by            (u/drop-first-arg apply-order-by)
          :current-datetime-fn       (constantly (k/sqlfn* :CURRENT_TIMESTAMP))
          :date                      (u/drop-first-arg date)
          :field->alias              (u/drop-first-arg field->alias)
          :prepare-value             (u/drop-first-arg prepare-value)
          :string-length-fn          (constantly :LENGTH)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)})

  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table         sync/generic-analyze-table
          :can-connect?          (u/drop-first-arg can-connect?)
          :date-interval         (u/drop-first-arg (comp prepare-value u/relative-date))
          :describe-database     (u/drop-first-arg describe-database)
          :describe-table        (u/drop-first-arg describe-table)
          :details-fields        (constantly [{:name         "project-id"
                                               :display-name "Project ID"
                                               :placeholder  "praxis-beacon-120871"
                                               :required     true}
                                              {:name         "dataset-id"
                                               :display-name "Dataset ID"
                                               :placeholder  "toucanSightings"
                                               :required     true}
                                              {:name         "client-id"
                                               :display-name "Client ID"
                                               :placeholder  "1201327674725-y6ferb0feo1hfssr7t40o4aikqll46d4.apps.googleusercontent.com"
                                               :required     true}
                                              {:name         "client-secret"
                                               :display-name "Client Secret"
                                               :placeholder  "dJNi4utWgMzyIFo2JbnsK6Np"
                                               :required     true}
                                              {:name         "auth-code"
                                               :display-name "Auth Code"
                                               :placeholder  "4/HSk-KtxkSzTt61j5zcbee2Rmm5JHkRFbL5gD5lgkXek"
                                               :required     true}])
          :field-values-lazy-seq (u/drop-first-arg field-values-lazy-seq)
          :process-native        (u/drop-first-arg process-native)
          :process-structured    (u/drop-first-arg process-structured)}))

(driver/register-driver! :bigquery (BigQueryDriver.))
