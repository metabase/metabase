(ns metabase.driver.bigquery
  (:require (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            [clojure.tools.logging :as log]
            (honeysql [core :as hsql]
                      [helpers :as h])
            [metabase.config :as config]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [table :as table])
            [metabase.sync-database.analyze :as analyze]
            [metabase.query-processor :as qp]
            metabase.query-processor.interface
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx])
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
           (metabase.query_processor.interface DateTimeValue Value)))

(def ^:private ^HttpTransport http-transport (GoogleNetHttpTransport/newTrustedTransport))
(def ^:private ^JsonFactory   json-factory   (JacksonFactory/getDefaultInstance))

(def ^:private ^:const ^String redirect-uri "urn:ietf:wg:oauth:2.0:oob")

(defn- execute-no-auto-retry
  "`execute` REQUEST, and catch any `GoogleJsonResponseException` is
  throws, converting them to `ExceptionInfo` and rethrowing them."
  [^AbstractGoogleClientRequest request]
  (try (.execute request)
       (catch GoogleJsonResponseException e
         (let [^GoogleJsonError error (.getDetails e)]
           (throw (ex-info (or (.getMessage error)
                               (.getStatusMessage e))
                           (into {} error)))))))

(defn- execute
  "`execute` REQUEST, and catch any `GoogleJsonResponseException` is
  throws, converting them to `ExceptionInfo` and rethrowing them.

  This automatically retries any failed requests up to 2 times."
  [^AbstractGoogleClientRequest request]
  (u/auto-retry 2
    (execute-no-auto-retry request)))

;; This specific format was request by Google themselves -- see #2627
(def ^:private ^:const ^String application-name
  (let [{:keys [tag hash branch]} config/mb-version-info]
    (format "Metabase/%s (GPN:Metabse; %s %s)" tag hash branch)))

(defn- ^Bigquery credential->client [^GoogleCredential credential]
  (.build (doto (Bigquery$Builder. http-transport json-factory credential)
            (.setApplicationName application-name))))

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
        (db/update! Database id, :details details))
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
  "Fetch a page of Tables. By default, fetches the first page; page size is 50. For cases when more than 50 Tables are present, you may
    fetch subsequent pages by specifying the PAGE-TOKEN; the token for the next page is returned with a page when one exists."
  ([database]
   (list-tables database nil))

  ([{{:keys [project-id dataset-id]} :details, :as database}, ^String page-token-or-nil]
   (list-tables (database->client database) project-id dataset-id page-token-or-nil))

  ([^Bigquery client, ^String project-id, ^String dataset-id, ^String page-token-or-nil]
   {:pre [client (seq project-id) (seq dataset-id)]}
   (execute (u/prog1 (.list (.tables client) project-id dataset-id)
              (.setPageToken <> page-token-or-nil)))))

(defn- describe-database [database]
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
  {"BOOLEAN"   :type/Boolean
   "FLOAT"     :type/Float
   "INTEGER"   :type/Integer
   "RECORD"    :type/Dictionary ; RECORD -> field has a nested schema
   "STRING"    :type/Text
   "TIMESTAMP" :type/DateTime})

(defn- table-schema->metabase-field-info [^TableSchema schema]
  (for [^TableFieldSchema field (.getFields schema)]
    {:name      (.getName field)
     :base-type (bigquery-type->base-type (.getType field))}))

(defn- describe-table [database {table-name :name}]
  {:schema nil
   :name   table-name
   :fields (set (table-schema->metabase-field-info (.getSchema (get-table database table-name))))})


(def ^:private ^:const query-timeout-seconds 60)

(defn- ^QueryResponse execute-bigquery
  ([{{:keys [project-id]} :details, :as database} query-string]
   (execute-bigquery (database->client database) project-id query-string))

  ([^Bigquery client, ^String project-id, ^String query-string]
   {:pre [client (seq project-id) (seq query-string)]}
   (let [request (doto (QueryRequest.)
                   (.setTimeoutMs (* query-timeout-seconds 1000))
                   #_(.setUseLegacySql false)   ; use standards-compliant non-legacy dialect -- see https://cloud.google.com/bigquery/sql-reference/enabling-standard-sql
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

(defn- post-process-native
  ([^QueryResponse response]
   (post-process-native response query-timeout-seconds))
  ([^QueryResponse response, ^Integer timeout-seconds]
   (if-not (.getJobComplete response)
     ;; 99% of the time by the time this is called `.getJobComplete` will return `true`. On the off chance it doesn't, wait a few seconds for the job to finish.
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
                       ;; There is a weird error where everything that *should* be NULL comes back as an Object. See https://jira.talendforge.org/browse/TBD-1592
                       ;; Everything else comes back as a String luckily so we can proceed normally.
                       (when-not (= (class v) Object)
                         (parser v)))))}))))

(defn- process-native* [database query-string]
  ;; automatically retry the query if it times out or otherwise fails. This is on top of the auto-retry added by `execute` so operations going through `process-native*` may be
  ;; retried up to 3 times.
  (u/auto-retry 1
    (post-process-native (execute-bigquery database query-string))))


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
  (hsql/call :date_add timestamp interval (hx/literal unit)))

;; µs = unix timestamp in microseconds. Most BigQuery functions like strftime require timestamps in this format

(def ^:private ->µs (partial hsql/call :timestamp_to_usec))

(defn- µs->str [format-str µs]
  (hsql/call :strftime_utc_usec µs (hx/literal format-str)))

(defn- trunc-with-format [format-str timestamp]
  (hx/->timestamp (µs->str format-str (->µs timestamp))))

(defn- date [unit expr]
  {:pre [expr]}
  (case unit
    :default         expr
    :minute          (trunc-with-format "%Y-%m-%d %H:%M:00" expr)
    :minute-of-hour  (hx/minute expr)
    :hour            (trunc-with-format "%Y-%m-%d %H:00:00" expr)
    :hour-of-day     (hx/hour expr)
    :day             (hx/->timestamp (hsql/call :date expr))
    :day-of-week     (hsql/call :dayofweek expr)
    :day-of-month    (hsql/call :day expr)
    :day-of-year     (hsql/call :dayofyear expr)
    :week            (date-add :day (date :day expr) (hx/- 1 (date :day-of-week expr)))
    :week-of-year    (hx/week expr)
    :month           (trunc-with-format "%Y-%m-01" expr)
    :month-of-year   (hx/month expr)
    :quarter         (date-add :month
                               (trunc-with-format "%Y-01-01" expr)
                               (hx/* (hx/dec (date :quarter-of-year expr))
                                     3))
    :quarter-of-year (hx/quarter expr)
    :year            (hx/year expr)))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :sec_to_timestamp  expr)
    :milliseconds (hsql/call :msec_to_timestamp expr)))


;;; # Query Processing

(declare driver)

;; Make the dataset-id the "schema" of every field or table in the query because otherwise BigQuery can't figure out where things is from
(defn- qualify-fields-and-tables-with-dataset-id [{{{:keys [dataset-id]} :details} :database, :as query}]
  (walk/postwalk (fn [x]
                   (cond
                     (instance? metabase.query_processor.interface.Field x)     (assoc x :schema-name dataset-id) ; TODO - it is inconvenient that we use different keys for `schema` across different
                     (instance? metabase.query_processor.interface.JoinTable x) (assoc x :schema      dataset-id) ; classes. We should one day refactor to use the same key everywhere.
                     :else                                                      x))
                 (assoc-in query [:query :source-table :schema] dataset-id)))

(defn- honeysql-form [outer-query]
  (sqlqp/build-honeysql-form driver (qualify-fields-and-tables-with-dataset-id outer-query)))

(defn- honeysql-form->sql ^String [honeysql-form]
  {:pre [(map? honeysql-form)]}
  ;; replace identifiers like [shakespeare].[word] with ones like [shakespeare.word] since that's hat BigQuery expects
  (let [[sql & args] (sql/honeysql-form->sql+args driver honeysql-form)
        sql          (s/replace (hx/unescape-dots sql) #"\]\.\[" ".")]
    (assert (empty? args)
      "BigQuery statements can't be parameterized!")
    sql))

(defn- post-process-mbql [dataset-id table-name {:keys [columns rows]}]
  ;; Since we don't alias column names the come back like "veryNiceDataset_shakepeare_corpus". Strip off the dataset and table IDs
  (let [demangle-name (u/rpartial s/replace (re-pattern (str \^ dataset-id \_ table-name \_)) "")
        columns       (for [column columns]
                        (keyword (demangle-name column)))
        rows          (for [row rows]
                        (zipmap columns row))
        columns       (vec (keys (first rows)))]
    {:columns columns
     :rows    (for [row rows]
                (mapv row columns))}))

(defn- mbql->native [{{{:keys [dataset-id]} :details, :as database} :database, {{table-name :name} :source-table} :query, :as outer-query}]
  {:pre [(map? database) (seq dataset-id) (seq table-name)]}
  (binding [sqlqp/*query* outer-query]
    (let [honeysql-form (honeysql-form outer-query)
          sql           (honeysql-form->sql honeysql-form)]
      {:query      sql
       :table-name table-name
       :mbql?      true})))

(defn- execute-query [{{{:keys [dataset-id]} :details, :as database} :database, {sql :query, :keys [table-name mbql?]} :native, :as outer-query}]
  (let [sql     (str "-- " (qp/query->remark outer-query) "\n" sql)
        results (process-native* database sql)
        results (if mbql?
                  (post-process-mbql dataset-id table-name results)
                  (update results :columns (partial map keyword)))]
    (assoc results :annotate? mbql?)))

;; This provides an implementation of `prepare-value` that prevents HoneySQL from converting forms to prepared statement parameters (`?`)
;; TODO - Move this into `metabase.driver.generic-sql` and document it as an alternate implementation for `prepare-value` (?)
;;        Or perhaps investigate a lower-level way to disable the functionality in HoneySQL, perhaps by swapping out a function somewhere
(defprotocol ^:private IPrepareValue
  (^:private prepare-value [this]))
(extend-protocol IPrepareValue
  nil           (prepare-value [_] nil)
  DateTimeValue (prepare-value [{:keys [value]}] (prepare-value value))
  Value         (prepare-value [{:keys [value]}] (prepare-value value))
  String        (prepare-value [this] (hx/literal this))
  Boolean       (prepare-value [this] (hsql/raw (if this "TRUE" "FALSE")))
  Date          (prepare-value [this] (hsql/call :timestamp (hx/literal (u/date->iso-8601 this))))
  Number        (prepare-value [this] this)
  Object        (prepare-value [this] (throw (Exception. (format "Don't know how to prepare value %s %s" (class this) this)))))


(defn- field->alias [{:keys [^String schema-name, ^String field-name, ^String table-name, ^Integer index, field], :as this}]
  {:pre [(map? this) (or field
                         index
                         (and (seq schema-name) (seq field-name) (seq table-name))
                         (log/error "Don't know how to alias: " this))]}
  (cond
    field (recur field) ; type/DateTime
    index (name (let [{{{ag-type :aggregation-type} :aggregation} :query} sqlqp/*query*]
                  (if (= ag-type :distinct) :count
                      ag-type)))
    :else (str schema-name \. table-name \. field-name)))

;; We have to override the default SQL implementations of breakout and order-by because BigQuery propogates casting functions in SELECT
;; BAD:
;; SELECT msec_to_timestamp([sad_toucan_incidents.incidents.timestamp]) AS [sad_toucan_incidents.incidents.timestamp], count(*) AS [count]
;; FROM [sad_toucan_incidents.incidents]
;; GROUP BY msec_to_timestamp([sad_toucan_incidents.incidents.timestamp])
;; ORDER BY msec_to_timestamp([sad_toucan_incidents.incidents.timestamp]) ASC
;; LIMIT 10
;;
;; GOOD:
;; SELECT msec_to_timestamp([sad_toucan_incidents.incidents.timestamp]) AS [sad_toucan_incidents.incidents.timestamp], count(*) AS [count]
;; FROM [sad_toucan_incidents.incidents]
;; GROUP BY [sad_toucan_incidents.incidents.timestamp]
;; ORDER BY [sad_toucan_incidents.incidents.timestamp] ASC
;; LIMIT 10

(defn- field->identitfier [field]
  (hsql/raw (str \[ (field->alias field) \])))

(defn- apply-breakout [honeysql-form {breakout-fields :breakout, fields-fields :fields}]
  (-> honeysql-form
      ;; Group by all the breakout fields
      ((partial apply h/group)  (map field->identitfier breakout-fields))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it twice, or HoneySQL will barf
      ((partial apply h/merge-select) (for [field breakout-fields
                                            :when (not (contains? (set fields-fields) field))]
                                        (sqlqp/as (sqlqp/formatted field) field)))))

(defn- apply-order-by [honeysql-form {subclauses :order-by}]
  (loop [honeysql-form honeysql-form, [{:keys [field direction]} & more] subclauses]
    (let [honeysql-form (h/merge-order-by honeysql-form [(field->identitfier field) (case direction
                                                                                      :ascending  :asc
                                                                                      :descending :desc)])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))


(defrecord BigQueryDriver []
  clojure.lang.Named
  (getName [_] "BigQuery"))

(def ^:private driver (BigQueryDriver.))

(u/strict-extend BigQueryDriver
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-breakout            (u/drop-first-arg apply-breakout)
          :apply-order-by            (u/drop-first-arg apply-order-by)
          :column->base-type         (constantly nil)                           ; these two are actually not applicable
          :connection-details->spec  (constantly nil)                           ; since we don't use JDBC
          :current-datetime-fn       (constantly :%current_timestamp)
          :date                      (u/drop-first-arg date)
          :field->alias              (u/drop-first-arg field->alias)
          :prepare-value             (u/drop-first-arg prepare-value)
          :quote-style               (constantly :sqlserver)                    ; we want identifiers quoted [like].[this]
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)})

  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table         analyze/generic-analyze-table
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
          :execute-query         (u/drop-first-arg execute-query)
          ;; Don't enable foreign keys when testing because BigQuery *doesn't* have a notion of foreign keys. Joins are still allowed, which puts us in a weird position, however;
          ;; people can manually specifiy "foreign key" relationships in admin and everything should work correctly.
          ;; Since we can't infer any "FK" relationships during sync our normal FK tests are not appropriate for BigQuery, so they're disabled for the time being.
          ;; TODO - either write BigQuery-speciifc tests for FK functionality or add additional code to manually set up these FK relationships for FK tables
          :features              (constantly (when-not config/is-test?
                                               ;; during unit tests don't treat bigquery as having FK support
                                               #{:foreign-keys}))
          :field-values-lazy-seq (u/drop-first-arg field-values-lazy-seq)
          :mbql->native          (u/drop-first-arg mbql->native)}))

(driver/register-driver! :bigquery driver)
