(ns metabase.driver.bigqueryjdbc
  (:require [clojure
             [set :as set]
             [string :as str]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [honeysql
             [core :as hsql]
             [helpers :as h]
             [format :as hformat]]
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
             [field :as field]
             [table :as table]]
            [metabase.query-processor.util :as qputil]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db])
  (:import com.google.api.client.googleapis.auth.oauth2.GoogleCredential
           [com.google.api.client.http HttpRequestInitializer HttpRequest]
           [com.google.api.services.bigquery Bigquery Bigquery$Builder BigqueryScopes]
           [com.google.api.services.bigquery.model QueryRequest QueryResponse Table TableCell TableFieldSchema
            TableList TableList$Tables TableReference TableRow TableSchema]
           [java.util Collections Date]
           [metabase.query_processor.interface DateTimeValue Value]))
(:import java.util.Date)


(defrecord BigQueryJDBCDriver []
  clojure.lang.Named
  (getName [_] "BigQuery JDBC Driver"))

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

(defn- table-schema->metabase-field-info [^TableSchema schema]
  (for [^TableFieldSchema field (.getFields schema)]
    {:name          (.getName field)
     :database-type (.getType field)
     :base-type     (bigquery-type->base-type (.getType field))}))

(defn- describe-table [database {table-name :name}]
  {:schema nil
   :name   table-name
   :fields (set (table-schema->metabase-field-info (.getSchema (get-table database table-name))))})


(def ^:private ^:const ^Integer query-timeout-seconds 120)

(defn- ^QueryResponse execute-bigquery
  ([{{:keys [project-id]} :details, :as database} query-string]
   (execute-bigquery (database->client database) project-id query-string))

  ([^Bigquery client, ^String project-id, ^String query-string]
   {:pre [client (seq project-id) (seq query-string)]}
   (let [request (doto (QueryRequest.)
                   (.setTimeoutMs (* query-timeout-seconds 10000))
                   ;; if the query contains a `#standardSQL` directive then use Standard SQL instead of legacy SQL
                   (.setUseLegacySql (str/includes? (str/lower-case query-string) "#legacysql"))
                  (prn query-string)
                  (prn "-- After Regex Replace --")
                  (prn (str/replace (str/replace (str/replace query-string #"\[[^]]+\.[^]]+\.([^]]+)\]" "$1") "[" "`") "]" "`"))
                   (.setQuery (str/replace (str/replace (str/replace query-string #"\[[^]]+\.[^]]+\.([^]]+)\]" "$1") "[" "`") "]" "`")))]
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

(def ^:private type->parser
  "Functions that should be used to coerce string values in responses to the appropriate type for their column."
  {"BOOLEAN"   #(Boolean/parseBoolean %)
   "FLOAT"     #(Double/parseDouble %)
   "INTEGER"   #(Long/parseLong %)
   "RECORD"    identity
   "STRING"    identity
   "DATE"      #(parse-timestamp-str (u/parse-date "yyyy-MM-dd" %))
   "DATETIME"  parse-timestamp-str
   "TIMESTAMP" parse-timestamp-str
   "TIME"      parse-timestamp-str})

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

(defn- microseconds->str [format-str µs]
  (hsql/call :format_timestamp (hx/literal format-str) (hsql/call :safe-cast µs :timestamp)))

(defn- trunc-with-format [format-str timestamp]
  (hx/->timestamp (microseconds->str format-str timestamp)))

(defn- fetch-day [timestamp]
  (hx/->timestamp (hsql/call :safe-cast timestamp :timestamp)))

;; register the safe_cast function with HoneySQL
(defmethod hformat/fn-handler "safe-cast" [_ expr type-to-cast]
  (str "safe_cast(" (hformat/to-sql expr) " as " (name type-to-cast) ")"))

;; register the extract function with HoneySQL
(defmethod hformat/fn-handler "extract" [_ expr part]
  (str "extract(" (name part) " FROM " (hformat/to-sql expr) ")"))

(defn- date [unit expr]
  {:pre [expr]}
  (case unit
    :default         expr
    :minute          (trunc-with-format "%Y-%m-%d %H:%M:00" expr)
    :minute-of-hour  (hsql/call :timestamp_trunc (hsql/call :safe-cast expr :timestamp) :minute)
    :hour            (trunc-with-format "%Y-%m-%d %H:00:00" expr)
    :hour-of-day     (hsql/call :extract expr :hour)
    :day             (fetch-day expr)
    :day-of-week     (hsql/call :extract expr :dayofweek)
    :day-of-month    (hsql/call :extract expr :day)
    :day-of-year     (hsql/call :extract expr :dayofyear)
    :week            (hsql/call :date_trunc (hx/->date expr) :week)
    :week-of-year    (hsql/call :format_date (hx/literal "%V") (hsql/call :safe-cast expr :date))
    :month           (trunc-with-format "%Y-%m-01" expr)
    :month-of-year   (hsql/call :format_date (hx/literal "%m") (hsql/call :safe-cast expr :date))
    :quarter         (hsql/call :date_trunc (hx/->date expr) :quarter)
    :quarter-of-year (hsql/call :extract expr :quarter)
    :year            (hsql/call :date_trunc (hx/->date expr) :year)))

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
  (sqlqp/build-honeysql-form driver outer-query))

(defn- honeysql-form->sql ^String [honeysql-form]
  {:pre [(map? honeysql-form)]}
  ;; replace identifiers like [shakespeare].[word] with ones like [shakespeare.word] since that's hat BigQuery expects
  (let [[sql & args] (sql/honeysql-form->sql+args driver honeysql-form)
        sql          (str/replace (hx/unescape-dots sql) #"\]\.\[" ".")]
    (assert (empty? args)
      "BigQuery statements can't be parameterized!")
    sql))

(defn- post-process-mbql [schema table-name {:keys [columns rows]}]
  ;; Since we don't alias column names the come back like "veryNiceDataset_shakepeare_corpus". Strip off the dataset
  ;; and table IDs
  (let [demangle-name (u/rpartial str/replace (re-pattern (str \^\.\*\?\_ table-name \_)) "")
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

(defn- execute-query [{{{:keys [dataset-id]} :details, :as database} :database, {sql :query, params :params, :keys [schema table-name mbql?]} :native, :as outer-query}]
  (let [sql     (str "-- " (qputil/query->remark outer-query) "\n" (if (seq params)
                                                                     (unprepare/unprepare (cons sql params))
                                                                     sql))
        results (process-native* database sql)
        results (if mbql?
                  (post-process-mbql schema table-name results)
                  (update results :columns (partial map keyword)))]
    (assoc results :annotate? mbql?)))


;; These provide implementations of `->honeysql` that prevents HoneySQL from converting forms to prepared
;; statement parameters (`?`)
(defmethod sqlqp/->honeysql [BigQueryJDBCDriver String]
  [_ s]
  ;; TODO - what happens if `s` contains single-quotes? Shouldn't we be escaping them somehow?
  (hx/literal s))

(defmethod sqlqp/->honeysql [BigQueryJDBCDriver Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sqlqp/->honeysql [BigQueryJDBCDriver Date]
  [_ date]
  (hsql/call :timestamp (hx/literal (u/date->iso-8601 date))))


(defn- field->alias [{:keys [^String schema-name, ^String field-name, ^String table-name, ^Integer index, field], :as this}]
  {:pre [(map? this) (or field
                         index
                         (and (seq schema-name) (seq field-name) (seq table-name))
                         (log/error "Don't know how to alias: " this))]}
  (cond
    field (recur field) ; type/DateTime
    index (name (let [{{aggregations :aggregation} :query} sqlqp/*query*
                      {ag-type :aggregation-type}          (nth aggregations index)]
                  (if (= ag-type :distinct)
                    :count
                    ag-type)))
    :else (str schema-name \. table-name \. field-name)))

;; TODO - Making 2 DB calls for each field to fetch its dataset is inefficient and makes me cry, but this method is
;; currently only used for SQL params so it's not a huge deal at this point
(defn- field->identifier [{table-id :table_id, :as field}]
  (let [db-id   (db/select-one-field :db_id 'Table :id table-id)
        dataset (:dataset-id (db/select-one-field :details Database, :id db-id))]
    (hsql/raw (apply format "[%s.%s.%s]" dataset (field/qualified-name-components field)))))

;; We have to override the default SQL implementations of breakout and order-by because BigQuery propogates casting
;; functions in SELECT
;; BAD:
;; SELECT msec_to_timestamp([sad_toucan_incidents.incidents.timestamp]) AS [sad_toucan_incidents.incidents.timestamp],
;;       count(*) AS [count]
;; FROM [sad_toucan_incidents.incidents]
;; GROUP BY msec_to_timestamp([sad_toucan_incidents.incidents.timestamp])
;; ORDER BY msec_to_timestamp([sad_toucan_incidents.incidents.timestamp]) ASC
;; LIMIT 10
;;
;; GOOD:
;; SELECT msec_to_timestamp([sad_toucan_incidents.incidents.timestamp]) AS [sad_toucan_incidents.incidents.timestamp],
;;        count(*) AS [count]
;; FROM [sad_toucan_incidents.incidents]
;; GROUP BY [sad_toucan_incidents.incidents.timestamp]
;; ORDER BY [sad_toucan_incidents.incidents.timestamp] ASC
;; LIMIT 10

(defn- deduplicate-aliases
  "Given a sequence of aliases, return a sequence where duplicate aliases have been appropriately suffixed.

     (deduplicate-aliases [\"sum\" \"count\" \"sum\" \"avg\" \"sum\" \"min\"])
     ;; -> [\"sum\" \"count\" \"sum_2\" \"avg\" \"sum_3\" \"min\"]"
  [aliases]
  (loop [acc [], alias->use-count {}, [alias & more, :as aliases] aliases]
    (let [use-count (get alias->use-count alias)]
      (cond
        (empty? aliases) acc
        (not alias)      (recur (conj acc alias) alias->use-count more)
        (not use-count)  (recur (conj acc alias) (assoc alias->use-count alias 1) more)
        :else            (let [new-count (inc use-count)
                               new-alias (str alias "_" new-count)]
                           (recur (conj acc new-alias) (assoc alias->use-count alias new-count, new-alias 1) more))))))

(defn- select-subclauses->aliases
  "Return a vector of aliases used in HoneySQL SELECT-SUBCLAUSES.
   (For clauses that aren't aliased, `nil` is returned as a placeholder)."
  [select-subclauses]
  (for [subclause select-subclauses]
    (when (and (vector? subclause)
               (= 2 (count subclause)))
      (second subclause))))

(defn update-select-subclause-aliases
  "Given a vector of HoneySQL SELECT-SUBCLAUSES and a vector of equal length of NEW-ALIASES,
   return a new vector with combining the original `SELECT` subclauses with the new aliases.

   Subclauses that are not aliased are not modified; they are given a placeholder of `nil` in the NEW-ALIASES vector.

     (update-select-subclause-aliases [[:user_id \"user_id\"] :venue_id]
                                      [\"user_id_2\" nil])
     ;; -> [[:user_id \"user_id_2\"] :venue_id]"
  [select-subclauses new-aliases]
  (for [[subclause new-alias] (partition 2 (interleave select-subclauses new-aliases))]
    (if-not new-alias
      subclause
      [(first subclause) new-alias])))

(defn- deduplicate-select-aliases
  "Replace duplicate aliases in SELECT-SUBCLAUSES with appropriately suffixed aliases.

  BigQuery doesn't allow duplicate aliases in `SELECT` statements; a statement like `SELECT sum(x) AS sum, sum(y) AS
  sum` is invalid. (See #4089) To work around this, we'll modify the HoneySQL aliases to make sure the same one isn't
  used twice by suffixing duplicates appropriately.
  (We'll generate SQL like `SELECT sum(x) AS sum, sum(y) AS sum_2` instead.)"
  [select-subclauses]
  (let [aliases (select-subclauses->aliases select-subclauses)
        deduped (deduplicate-aliases aliases)]
    (update-select-subclause-aliases select-subclauses deduped)))

(defn- apply-aggregation
  "BigQuery's implementation of `apply-aggregation` just hands off to the normal Generic SQL implementation, but calls
  `deduplicate-select-aliases` on the results."
  [driver honeysql-form query]
  (-> (sqlqp/apply-aggregation driver honeysql-form query)
      (update :select deduplicate-select-aliases)))


(defn- field->breakout-identifier [field]
  (hsql/raw (str \[ (field->alias field) \])))

(defn- apply-breakout [driver honeysql-form {breakout-fields :breakout, fields-fields :fields}]
  (-> honeysql-form
      ;; Group by all the breakout fields
      ((partial apply h/group)  (map field->breakout-identifier breakout-fields))
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

(defn- apply-order-by [honeysql-form {subclauses :order-by}]
  (loop [honeysql-form honeysql-form, [{:keys [field direction]} & more] subclauses]
    (let [honeysql-form (h/merge-order-by honeysql-form [(field->breakout-identifier field) (case direction
                                                                                              :ascending  :asc
                                                                                              :descending :desc)])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))

;; From the dox: Fields must contain only letters, numbers, and underscores, start with a letter or underscore, and be
;; at most 128 characters long.
(defn- format-custom-field-name ^String [^String custom-field-name]
  (str/join (take 128 (-> (str/trim custom-field-name)
                        (str/replace #"(^\d)" "_$1")))))

; (defn- date-interval [driver unit amount]
;   (sqlqp/->honeysql driver (u/relative-date unit amount)))

(defn- date-interval [unit amount]
   (hsql/raw (format "DATE_ADD(current_date(), INTERVAL %d %s)" (int amount) (name unit))))

;; BigQuery doesn't return a timezone with it's time strings as it's always UTC, JodaTime parsing also defaults to UTC
(def ^:private bigquery-date-formatter (driver/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSS"))
(def ^:private bigquery-db-time-query "select CAST(CURRENT_TIMESTAMP() AS STRING)")

(def ^:private driver (BigQueryJDBCDriver.))

(def ^:private ^:const pattern->type
  [[#"BOOL"        :type/Boolean]
   [#"FLOAT"       :type/Float]
   [#"INT"         :type/BigInteger]
   [#"RECORD"      :type/Dictionary]
   [#"STRING"      :type/Text]
   [#"DATE"        :type/Date]
   [#"DATETIME"    :type/DateTime]
   [#"TIMESTAMP"   :type/DateTime]
   [#"TIME"        :type/Time]])

(defn- remove-rownum-column
"Remove the `:__rownum__` column from results, if present."
[{:keys [columns rows], :as results}]
(if-not (contains? (set columns) :__rownum__)
  results
  ;; if we added __rownum__ it will always be the last column and value so we can just remove that
  {:columns (butlast columns)
    :rows    (for [row rows]
              (butlast row))}))
  
(defn- connection-details->spec
  "Setup settings to connect to a BigQuery project. Opts should include
  keys for :project, :json-path, and :service-account"
  [{:keys [project-id json-path service-account additional-projects],
    :as   opts}]
  (merge {:classname   "com.simba.googlebigquery.jdbc42.Driver" ; must be in classpath
          :subprotocol "bigquery"
          :subname     (str "//https://www.googleapis.com/bigquery/v2:443;ProjectId=" project-id ";OAuthType=0;OAuthPvtKeyPath=" json-path ";OAuthServiceAcctEmail=" service-account ";AdditionalProjects=" additional-projects)}
         (dissoc opts :project-id :json-path :service-account :additional-projects)))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))

(defn- date->quarter [format-str µs]
  (hsql/call :format_timestamp (hx/literal format-str) (hsql/call :timestamp µs)))

(u/strict-extend BigQueryJDBCDriver
                 driver/IDriver
                 (merge (sql/IDriverSQLDefaultsMixin)
                        {:date-interval   (u/drop-first-arg date-interval)
                         :execute-query   (u/drop-first-arg execute-query)
                         :format-custom-field-name (u/drop-first-arg format-custom-field-name)
                         :mbql->native             (u/drop-first-arg mbql->native)
                         :details-fields  (constantly [{:name         "project-id"
                                                        :display-name "Project ID"
                                                        :placeholder  "sample-project-1"
                                                        :required     true}
                                                       {:name         "json-path"
                                                        :display-name "Path to JSON key file"
                                                        :placeholder  "/app/metabase/bigquery-key.json"
                                                        :required     true}
                                                       {:name         "service-account"
                                                        :display-name "Service Account Email Address"
                                                        :placeholder  "some-user@sample-project-1.iam.gserviceaccount.com"
                                                        :required     true}
                                                       {:name         "additional-projects"
                                                        :display-name "Additional Projects"
                                                        :placeholder  "nyc-tlc, lookerdata, bigquery-public-data"}
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
                         :features        (constantly (set/union #{:basic-aggregations
                                                                   :standard-deviation-aggregations
                                                                   :native-parameters
                                                                   :expression-aggregations
                                                                   :binning}
                                                                 (when-not config/is-test?
                                                                   ;; during unit tests don't treat bigquery as having FK
                                                                   ;; support
                                                                   #{:foreign-keys})))
                         :current-db-time (driver/make-current-db-time-fn bigquery-date-formatter bigquery-db-time-query)})

                 sql/ISQLDriver
                 (merge (sql/ISQLDriverDefaultsMixin)
                        {:apply-aggregation         apply-aggregation
                         :apply-breakout            apply-breakout
                         :apply-join-tables         (u/drop-first-arg apply-join-tables)
                         :apply-order-by            (u/drop-first-arg apply-order-by)
                         :column->base-type         (sql/pattern-based-column->base-type pattern->type)
                         :connection-details->spec  (u/drop-first-arg connection-details->spec)
                         :current-datetime-fn       (constantly :%current_timestamp)
                         :date                      (u/drop-first-arg date)
                         :field->alias              (u/drop-first-arg field->alias)
                         :field->identifier         (u/drop-first-arg field->identifier)
                         ;; we want identifiers quoted [like].[this] initially (we have to convert them to [like.this] before
                         ;; executing)
                         :quote-style               (constantly :sqlserver)
                         :string-length-fn          (u/drop-first-arg string-length-fn)
                         :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the simba google bigquery driver when the JAR is found on the classpath"
  []
  ;; only register the BigQuery driver if the JDBC driver is available
  (when (u/ignore-exceptions
          (Class/forName "com.simba.googlebigquery.jdbc42.Driver"))
    (driver/register-driver! :bigqueryjdbc (BigQueryJDBCDriver.))))
