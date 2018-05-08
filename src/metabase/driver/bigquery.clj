(ns metabase.driver.bigquery
  (:require [clj-time
             [coerce :as tcoerce]
             [core :as time]
             [format :as tformat]]
            [clojure
             [set :as set]
             [string :as str]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver
             [generic-sql :as sql]
             [google :as google]]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.models
             [database :refer [Database]]
             [field :as field]]
            [metabase.query-processor
             [annotate :as annotate]
             [util :as qputil]]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db])
  (:import com.google.api.client.googleapis.auth.oauth2.GoogleCredential
           [com.google.api.client.http HttpRequestInitializer HttpRequest]
           [com.google.api.services.bigquery Bigquery Bigquery$Builder BigqueryScopes]
           [com.google.api.services.bigquery.model QueryRequest QueryResponse Table TableCell TableFieldSchema
            TableList TableList$Tables TableReference TableRow TableSchema]
           java.sql.Time
           [java.util Collections Date]
           [metabase.query_processor.interface AggregationWithField AggregationWithoutField DateTimeValue Expression TimeValue Value]))

(defrecord BigQueryDriver []
  clojure.lang.Named
  (getName [_] "BigQuery"))


;;; ----------------------------------------------------- Client -----------------------------------------------------

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


;;; ------------------------------------------------------ Etc. ------------------------------------------------------

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
    "TIME"      :type/Time
    :type/*))

(defn- table-schema->metabase-field-info [^TableSchema schema]
  (for [^TableFieldSchema field (.getFields schema)]
    {:name          (.getName field)
     :database-type (.getType field)
     :base-type     (bigquery-type->base-type (.getType field))}))

(defn- describe-table [database {table-name :name}]
  {:schema nil
   :name   table-name
   :fields (set (table-schema->metabase-field-info (.getSchema (get-table database table-name))))})


(def ^:private ^:const ^Integer query-timeout-seconds 60)

(defn- ^QueryResponse execute-bigquery
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

(def ^:private ^java.util.TimeZone default-timezone
  (java.util.TimeZone/getDefault))

(defn- parse-timestamp-str [s]
  ;; Timestamp strings either come back as ISO-8601 strings or Unix timestamps in µs, e.g. "1.3963104E9"
  (or
   (u/->Timestamp s)
   ;; If parsing as ISO-8601 fails parse as a double then convert to ms. Add the appropriate number of milliseconds to
   ;; the number to convert it to the local timezone. We do this because the dates come back in UTC but we want the
   ;; grouping to match the local time (HUH?) This gives us the same results as the other
   ;; `has-questionable-timezone-support?` drivers. Not sure if this is actually desirable, but if it's not, it
   ;; probably means all of those other drivers are doing it wrong
   (u/->Timestamp (- (* (Double/parseDouble s) 1000)
                     (.getDSTSavings default-timezone)
                     (.getRawOffset  default-timezone)))))

(def ^:private bigquery-time-format (tformat/formatter "HH:mm:SS" time/utc))

(defn- parse-bigquery-time [time-string]
  (->> time-string
       (tformat/parse bigquery-time-format)
       tcoerce/to-long
       Time.))

(defn- unparse-bigquery-time [coercible-to-dt]
  (->> coercible-to-dt
       tcoerce/to-date-time
       (tformat/unparse bigquery-time-format)))

(def ^:private type->parser
  "Functions that should be used to coerce string values in responses to the appropriate type for their column."
  {"BOOLEAN"   #(Boolean/parseBoolean %)
   "FLOAT"     #(Double/parseDouble %)
   "INTEGER"   #(Long/parseLong %)
   "RECORD"    identity
   "STRING"    identity
   "DATE"      parse-timestamp-str
   "DATETIME"  parse-timestamp-str
   "TIMESTAMP" parse-timestamp-str
   "TIME"      parse-bigquery-time})

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

(defn- process-native* [database query-string]
  ;; automatically retry the query if it times out or otherwise fails. This is on top of the auto-retry added by
  ;; `execute` so operations going through `process-native*` may be retried up to 3 times.
  (u/auto-retry 1
    (post-process-native (execute-bigquery database query-string))))


;;; # Generic SQL Driver Methods

(defn- date-add [unit timestamp interval]
  (hsql/call :date_add timestamp interval (hx/literal unit)))

;; microseconds = unix timestamp in microseconds. Most BigQuery functions like strftime require timestamps in this
;; format

(def ^:private ->microseconds (partial hsql/call :timestamp_to_usec))

(defn- microseconds->str [format-str µs]
  (hsql/call :strftime_utc_usec µs (hx/literal format-str)))

(defn- trunc-with-format [format-str timestamp]
  (hx/->timestamp (microseconds->str format-str (->microseconds timestamp))))

(defn- date [unit expr]
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

;; Make the dataset-id the "schema" of every field or table in the query because otherwise BigQuery can't figure out
;; where things is from
(defn- qualify-fields-and-tables-with-dataset-id [{{{:keys [dataset-id]} :details} :database, :as query}]
  (walk/postwalk (fn [x]
                   (cond
                     ;; TODO - it is inconvenient that we use different keys for `schema` across different classes. We
                     ;; should one day refactor to use the same key everywhere.
                     (instance? metabase.query_processor.interface.Field x)     (assoc x :schema-name dataset-id)
                     (instance? metabase.query_processor.interface.JoinTable x) (assoc x :schema      dataset-id)
                     :else                                                      x))
                 (assoc-in query [:query :source-table :schema] dataset-id)))

(defn- honeysql-form [outer-query]
  (sqlqp/build-honeysql-form driver (qualify-fields-and-tables-with-dataset-id outer-query)))

(defn- honeysql-form->sql ^String [honeysql-form]
  {:pre [(map? honeysql-form)]}
  ;; replace identifiers like [shakespeare].[word] with ones like [shakespeare.word] since that's hat BigQuery expects
  (let [[sql & args] (sql/honeysql-form->sql+args driver honeysql-form)
        sql          (str/replace (hx/unescape-dots sql) #"\]\.\[" ".")]
    (assert (empty? args)
      "BigQuery statements can't be parameterized!")
    sql))

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

;; From the dox: Fields must contain only letters, numbers, and underscores, start with a letter or underscore, and be
;; at most 128 characters long.
(defn- format-custom-field-name ^String [^String custom-field-name]
  (let [replaced-str (-> (str/trim custom-field-name)
                         (str/replace #"[^\w\d_]" "_")
                         (str/replace #"(^\d)" "_$1"))]
    (subs replaced-str 0 (min 128 (count replaced-str)))))

(defn- agg-or-exp? [x]
  (or (instance? Expression x)
      (instance? AggregationWithField x)
      (instance? AggregationWithoutField x)))

(defn- bg-aggregate-name [aggregate]
  (-> aggregate annotate/aggregation-name format-custom-field-name))

(defn- pre-alias-aggregations
  "Expressions are not allowed in the order by clauses of a BQ query. To sort by a custom expression, that custom
  expression must be aliased from the order by. This code will find the aggregations and give them a name if they
  don't already have one. This name can then be used in the order by if one is present."
  [query]
  (let [aliases (atom {})]
    (walk/postwalk (fn [maybe-agg]
                     (if-let [exp-name (and (agg-or-exp? maybe-agg)
                                            (bg-aggregate-name maybe-agg))]
                       (if-let [usage-count (get @aliases exp-name)]
                         (let [new-custom-name (str exp-name "_" (inc usage-count))]
                           (swap! aliases assoc
                                  exp-name (inc usage-count)
                                  new-custom-name 1)
                           (assoc maybe-agg :custom-name new-custom-name))
                         (do
                           (swap! aliases assoc exp-name 1)
                           (assoc maybe-agg :custom-name exp-name)))
                       maybe-agg))
                   query)))

(defn- mbql->native [{{{:keys [dataset-id]} :details, :as database} :database, {{table-name :name} :source-table} :query, :as outer-query}]
  {:pre [(map? database) (seq dataset-id) (seq table-name)]}
  (let [aliased-query (pre-alias-aggregations outer-query)]
    (binding [sqlqp/*query* aliased-query]
      {:query      (-> aliased-query honeysql-form honeysql-form->sql)
       :table-name table-name
       :mbql?      true})))

(defn- execute-query [{{{:keys [dataset-id]} :details, :as database} :database, {sql :query, params :params, :keys [table-name mbql?]} :native, :as outer-query}]
  (let [sql     (str "-- " (qputil/query->remark outer-query) "\n" (if (seq params)
                                                                     (unprepare/unprepare (cons sql params))
                                                                     sql))
        results (process-native* database sql)
        results (if mbql?
                  (post-process-mbql dataset-id table-name results)
                  (update results :columns (partial map keyword)))]
    (assoc results :annotate? mbql?)))

;; These provide implementations of `->honeysql` that prevents HoneySQL from converting forms to prepared
;; statement parameters (`?`)
(defmethod sqlqp/->honeysql [BigQueryDriver String]
  [_ s]
  ;; TODO - what happens if `s` contains single-quotes? Shouldn't we be escaping them somehow?
  (hx/literal s))

(defmethod sqlqp/->honeysql [BigQueryDriver Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sqlqp/->honeysql [BigQueryDriver Date]
  [_ date]
  (hsql/call :timestamp (hx/literal (u/date->iso-8601 date))))

(defmethod sqlqp/->honeysql [BigQueryDriver TimeValue]
  [driver {:keys [value]}]
  (->> value
       unparse-bigquery-time
       (sqlqp/->honeysql driver)
       hx/->time))

(defn- field->alias [driver {:keys [^String schema-name, ^String field-name, ^String table-name, ^Integer index, field], :as this}]
  {:pre [(map? this) (or field
                         index
                         (and (seq schema-name) (seq field-name) (seq table-name))
                         (log/error "Don't know how to alias: " this))]}
  (cond
    field (recur driver field) ; type/DateTime
    index (let [{{aggregations :aggregation} :query} sqlqp/*query*
                {ag-type :aggregation-type :as agg}  (nth aggregations index)]
            (cond
              (= ag-type :distinct)
              "count"

              (instance? Expression agg)
              (:custom-name agg)

              :else
              (name ag-type)))

    :else (str schema-name \. table-name \. field-name)))

;; TODO - Making 2 DB calls for each field to fetch its dataset is inefficient and makes me cry, but this method is
;; currently only used for SQL params so it's not a huge deal at this point
(defn- field->identifier [{table-id :table_id, :as field}]
  (let [db-id   (db/select-one-field :db_id 'Table :id table-id)
        dataset (:dataset-id (db/select-one-field :details Database, :id db-id))]
    (hsql/raw (apply format "[%s.%s.%s]" dataset (field/qualified-name-components field)))))

(defn- field->breakout-identifier [driver field]
  (hsql/raw (str \[ (field->alias driver field) \])))

(defn- apply-breakout [driver honeysql-form {breakout-fields :breakout, fields-fields :fields}]
  (-> honeysql-form
      ;; Group by all the breakout fields
      ((partial apply h/group)  (map #(field->breakout-identifier driver %) breakout-fields))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it
      ;; twice, or HoneySQL will barf
      ((partial apply h/merge-select) (for [field breakout-fields
                                            :when (not (contains? (set fields-fields) field))]
                                        (sqlqp/as driver (sqlqp/->honeysql driver field) field)))))

(defn- apply-join-tables
  "Copy of the Generic SQL implementation of `apply-join-tables`, but prepends schema (dataset-id) to join-alias."
  [honeysql-form {join-tables :join-tables, {source-table-name :name, source-schema :schema} :source-table}]
  (loop [honeysql-form honeysql-form, [{:keys [table-name pk-field source-field schema join-alias]} & more] join-tables]
    (let [honeysql-form (h/merge-left-join honeysql-form
                          [(hx/qualify-and-escape-dots schema table-name) (hx/qualify-and-escape-dots schema join-alias)]
                          [:= (hx/qualify-and-escape-dots source-schema source-table-name (:field-name source-field))
                              (hx/qualify-and-escape-dots schema join-alias               (:field-name pk-field))])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn- apply-order-by [driver honeysql-form {subclauses :order-by}]
  (loop [honeysql-form honeysql-form, [{:keys [field direction]} & more] subclauses]
    (let [honeysql-form (h/merge-order-by honeysql-form [(field->breakout-identifier driver field) (case direction
                                                                                                     :ascending  :asc
                                                                                                     :descending :desc)])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))

(defn- date-interval [driver unit amount]
  (sqlqp/->honeysql driver (u/relative-date unit amount)))


;; BigQuery doesn't return a timezone with it's time strings as it's always UTC, JodaTime parsing also defaults to UTC
(def ^:private bigquery-date-formatters (driver/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSS"))
(def ^:private bigquery-db-time-query "select CAST(CURRENT_TIMESTAMP() AS STRING)")

(def ^:private driver (BigQueryDriver.))

(u/strict-extend BigQueryDriver
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-breakout            apply-breakout
          :apply-join-tables         (u/drop-first-arg apply-join-tables)
          :apply-order-by            apply-order-by
          ;; these two are actually not applicable since we don't use JDBC
          :column->base-type         (constantly nil)
          :connection-details->spec  (constantly nil)
          :current-datetime-fn       (constantly :%current_timestamp)
          :date                      (u/drop-first-arg date)
          :field->alias              field->alias
          :field->identifier         (u/drop-first-arg field->identifier)
          ;; we want identifiers quoted [like].[this] initially (we have to convert them to [like.this] before
          ;; executing)
          :quote-style               (constantly :sqlserver)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)})

  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:can-connect?             (u/drop-first-arg can-connect?)
          :date-interval            date-interval
          :describe-database        (u/drop-first-arg describe-database)
          :describe-table           (u/drop-first-arg describe-table)
          :details-fields           (constantly [{:name         "project-id"
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
          :execute-query            (u/drop-first-arg execute-query)
          ;; Don't enable foreign keys when testing because BigQuery *doesn't* have a notion of foreign keys. Joins
          ;; are still allowed, which puts us in a weird position, however; people can manually specifiy "foreign key"
          ;; relationships in admin and everything should work correctly. Since we can't infer any "FK" relationships
          ;; during sync our normal FK tests are not appropriate for BigQuery, so they're disabled for the time being.
          ;; TODO - either write BigQuery-speciifc tests for FK functionality or add additional code to manually set
          ;; up these FK relationships for FK tables
          :features                 (constantly (set/union #{:basic-aggregations
                                                             :standard-deviation-aggregations
                                                             :native-parameters
                                                             :expression-aggregations
                                                             :binning
                                                             :native-query-params}
                                                           (when-not config/is-test?
                                                             ;; during unit tests don't treat bigquery as having FK
                                                             ;; support
                                                             #{:foreign-keys})))
          :format-custom-field-name (u/drop-first-arg format-custom-field-name)
          :mbql->native             (u/drop-first-arg mbql->native)
          :current-db-time          (driver/make-current-db-time-fn  bigquery-db-time-query bigquery-date-formatters)}))

(defn -init-driver
  "Register the BigQuery driver"
  []
  (driver/register-driver! :bigquery driver))
