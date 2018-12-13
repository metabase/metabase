(ns metabase.driver.bigquery
  (:require [clj-time
             [coerce :as tcoerce]
             [core :as time]
             [format :as tformat]]
            [clojure
             [set :as set]
             [string :as str]]
            [honeysql
             [core :as hsql]
             [format :as hformat]
             [helpers :as h]]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver
             [common :as driver.common]
             [google :as google]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [field :refer [Field]]
             [table :as table]]
            [metabase.query-processor
             [store :as qp.store]
             [util :as qputil]]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import com.google.api.client.googleapis.auth.oauth2.GoogleCredential
           com.google.api.client.http.HttpRequestInitializer
           [com.google.api.services.bigquery Bigquery Bigquery$Builder BigqueryScopes]
           [com.google.api.services.bigquery.model QueryRequest QueryResponse Table TableCell TableFieldSchema TableList
            TableList$Tables TableReference TableRow TableSchema]
           honeysql.format.ToSql
           java.sql.Time
           [java.util Collections Date]))

(driver/register! :bigquery, :parent #{:google :sql})

(defn- valid-bigquery-identifier?
  "Is String `s` a valid BigQuery identifiers? Identifiers are only allowed to contain letters, numbers, and
  underscores; cannot start with a number; and can be at most 128 characters long."
  [s]
  (boolean
   (and (string? s)
        (re-matches #"^([a-zA-Z_][a-zA-Z_0-9]*){1,128}$" s))))

(defn- dataset-name-for-current-query
  "Fetch the dataset name for the database associated with this query, needed because BigQuery requires you to qualify
  identifiers with it. This is primarily called automatically for the `to-sql` implementation of the
  `BigQueryIdentifier` record type; see its definition for more details.

  This looks for the value inside the SQL QP's `*query*` dynamic var; since this won't be bound for non-MBQL queries,
  you will want to avoid this function for SQL queries."
  []
  {:pre [(map? sql.qp/*query*)], :post [(valid-bigquery-identifier? %)]}
  (:dataset-id sql.qp/*query*))


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
   (list-tables (database->client database) project-id dataset-id page-token-or-nil))

  ([^Bigquery client, ^String project-id, ^String dataset-id, ^String page-token-or-nil]
   {:pre [client (seq project-id) (seq dataset-id)]}
   (google/execute (u/prog1 (.list (.tables client) project-id dataset-id)
                     (.setPageToken <> page-token-or-nil)))))

(defmethod driver/describe-database :bigquery [_ database]
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

(defmethod driver/can-connect? :bigquery [_ details-map]
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

(defmethod driver/describe-table :bigquery [_ database {table-name :name}]
  {:schema nil
   :name   table-name
   :fields (set (table-schema->metabase-field-info (.getSchema (get-table database table-name))))})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Running Queries & Parsing Results                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^:const ^Integer query-timeout-seconds 60)

(defn- ^QueryResponse execute-bigquery
  ([{{:keys [project-id]} :details, :as database} query-string]
   (execute-bigquery (database->client database) project-id query-string))

  ([^Bigquery client, ^String project-id, ^String query-string]
   {:pre [client (seq project-id) (seq query-string)]}
   (let [request (doto (QueryRequest.)
                   (.setTimeoutMs (* query-timeout-seconds 1000))
                   ;; if the query contains a `#legacySQL` directive then use legacy SQL instead of standard SQL
                   (.setUseLegacySql (str/includes? (str/lower-case query-string) "#legacysql"))
                   (.setQuery query-string))]
     (google/execute (.query (.jobs client) project-id request)))))

(def ^:private ^:dynamic *bigquery-timezone*
  "BigQuery stores all of it's timestamps in UTC. That timezone can be changed via a SQL function invocation in a
  native query, but that change in timezone is not conveyed through the BigQuery API. In most situations
  `*bigquery-timezone*` will just be UTC. If the user is always changing the timezone via native SQL function
  invocation, they can set their JVM TZ to the correct timezone, mark `use-jvm-timezone` to `true` and that will bind
  this dynamic var to the JVM TZ rather than UTC"
  time/utc)

(defn- parse-timestamp-str [timezone]
  (fn [s]
    ;; Timestamp strings either come back as ISO-8601 strings or Unix timestamps in µs, e.g. "1.3963104E9"
    (or
     (du/->Timestamp s timezone)
     ;; If parsing as ISO-8601 fails parse as a double then convert to ms. This is ms since epoch in UTC. By using
     ;; `->Timestamp`, it will convert from ms in UTC to a timestamp object in the JVM timezone
     (du/->Timestamp (* (Double/parseDouble s) 1000)))))

(defn- bigquery-time-format [timezone]
  (tformat/formatter "HH:mm:SS" timezone))

(defn- parse-bigquery-time [timezone]
  (fn [time-string]
    (->> time-string
         (tformat/parse (bigquery-time-format timezone))
         tcoerce/to-long
         Time.)))

(defn- unparse-bigquery-time [timezone coercible-to-dt]
  (->> coercible-to-dt
       tcoerce/to-date-time
       (tformat/unparse (bigquery-time-format timezone))))

(def ^:private type->parser
  "Functions that should be used to coerce string values in responses to the appropriate type for their column."
  {"BOOLEAN"   (constantly #(Boolean/parseBoolean %))
   "FLOAT"     (constantly #(Double/parseDouble %))
   "INTEGER"   (constantly #(Long/parseLong %))
   "RECORD"    (constantly identity)
   "STRING"    (constantly identity)
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
           parsers             (doall
                                (for [^TableFieldSchema field (.getFields schema)
                                      :let [parser-fn (type->parser (.getType field))]]
                                  (parser-fn *bigquery-timezone*)))
           columns             (for [column (table-schema->metabase-field-info schema)]
                                 (-> column
                                     (set/rename-keys {:base-type :base_type})
                                     (dissoc :database-type)))]
       {:columns (map (comp u/keyword->qualified-name :name) columns)
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
  {:pre [(map? database) (map? (:details database))]}
  ;; automatically retry the query if it times out or otherwise fails. This is on top of the auto-retry added by
  ;; `execute` so operations going through `process-native*` may be retried up to 3 times.
  (u/auto-retry 1
    (post-process-native (execute-bigquery database query-string))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SQL Driver Methods                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- trunc
  "Generate raw SQL along the lines of `timestamp_trunc(cast(<some-field> AS timestamp), day)`"
  [unit expr]
  (hsql/call :timestamp_trunc (hx/->timestamp expr) (hsql/raw (name unit))))

(defn- extract [unit expr]
  ;; implemenation of extract() in `metabase.util.honeysql-extensions` handles actual conversion to raw SQL (!)
  (hsql/call :extract unit (hx/->timestamp expr)))

(defmethod sql.qp/date [:bigquery :minute]          [_ _ expr] (trunc   :minute    expr))
(defmethod sql.qp/date [:bigquery :minute-of-hour]  [_ _ expr] (extract :minute    expr))
(defmethod sql.qp/date [:bigquery :hour]            [_ _ expr] (trunc   :hour      expr))
(defmethod sql.qp/date [:bigquery :hour-of-day]     [_ _ expr] (extract :hour      expr))
(defmethod sql.qp/date [:bigquery :day]             [_ _ expr] (trunc   :day       expr))
(defmethod sql.qp/date [:bigquery :day-of-week]     [_ _ expr] (extract :dayofweek expr))
(defmethod sql.qp/date [:bigquery :day-of-month]    [_ _ expr] (extract :day       expr))
(defmethod sql.qp/date [:bigquery :day-of-year]     [_ _ expr] (extract :dayofyear expr))
(defmethod sql.qp/date [:bigquery :week]            [_ _ expr] (trunc   :week      expr))
;; ; BigQuery's impl of `week` uses 0 for the first week; we use 1
(defmethod sql.qp/date [:bigquery :week-of-year]    [_ _ expr] (-> (extract :week  expr) hx/inc))
(defmethod sql.qp/date [:bigquery :month]           [_ _ expr] (trunc   :month     expr))
(defmethod sql.qp/date [:bigquery :month-of-year]   [_ _ expr] (extract :month     expr))
(defmethod sql.qp/date [:bigquery :quarter]         [_ _ expr] (trunc   :quarter   expr))
(defmethod sql.qp/date [:bigquery :quarter-of-year] [_ _ expr] (extract :quarter   expr))
(defmethod sql.qp/date [:bigquery :year]            [_ _ expr] (extract :year      expr))

(defmethod sql.qp/unix-timestamp->timestamp [:bigquery :seconds] [_ _ expr]
  (hsql/call :timestamp_seconds expr))

(defmethod sql.qp/unix-timestamp->timestamp [:bigquery :milliseconds] [_ _ expr]
  (hsql/call :timestamp_millis expr))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Query Processor                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; This record type used for BigQuery table and field identifiers, since BigQuery has some stupid rules about how to
;; quote them (tables are like `dataset.table` and fields are like `dataset.table`.`field`)
;; This implements HoneySql's ToSql protocol, so we can just output this directly in most of our QP code below
;;
;; TODO - this is totally unnecessary now, we can just override `->honeysql` for `Field` and `Table` instead. FIXME!
(defrecord ^:private BigQueryIdentifier [dataset-name ; optional; will use (dataset-name-for-current-query) otherwise
                                         table-name
                                         field-name
                                         alias?]
  honeysql.format/ToSql
  (to-sql [{:keys [dataset-name table-name field-name], :as bq-id}]
    ;; Check to make sure the identifiers are valid and don't contain any sorts of escape characters since we are
    ;; constructing raw SQL here, and would like to avoid potential SQL injection vectors (even though this is not
    ;; direct user input, but instead would require someone to go in and purposely corrupt their Table names/Field names
    ;; to do so)
    (when dataset-name
      (assert (valid-bigquery-identifier? dataset-name)
        (tru "Invalid BigQuery identifier: ''{0}''" dataset-name)))
    (assert (valid-bigquery-identifier? table-name)
      (tru "Invalid BigQuery identifier: ''{0}''" table-name))
    (when (seq field-name)
      (assert (valid-bigquery-identifier? field-name)
        (tru "Invalid BigQuery identifier: ''{0}''" field-name)))
    ;; BigQuery identifiers should look like `dataset.table` or `dataset.table`.`field` (SAD!)
    (let [dataset-name (or dataset-name (dataset-name-for-current-query))]
      (str
       (if alias?
         (format "`%s`" table-name)
         (format "`%s.%s`" dataset-name table-name))
       (when (seq field-name)
         (format ".`%s`" field-name))))))

(defn- honeysql-form->sql ^String [honeysql-form]
  {:pre [(map? honeysql-form)]}
  (let [[sql & args] (sql.qp/honeysql-form->sql+args :bigquery honeysql-form)]
    (when (seq args)
      (throw (Exception. (str (tru "BigQuery statements can''t be parameterized!")))))
    sql))

;; From the dox: Fields must contain only letters, numbers, and underscores, start with a letter or underscore, and be
;; at most 128 characters long.
(defmethod driver/format-custom-field-name :bigquery [_ custom-field-name]
  (let [replaced-str (-> (str/trim custom-field-name)
                         (str/replace #"[^\w\d_]" "_")
                         (str/replace #"(^\d)" "_$1"))]
    (subs replaced-str 0 (min 128 (count replaced-str)))))

(s/defn ^:private bq-aggregate-name :- su/NonBlankString
  "Return an approriate name for an `ag-clause`."
  [driver, ag-clause :- mbql.s/Aggregation]
  (->> ag-clause annotate/aggregation-name (driver/format-custom-field-name driver)))

(s/defn ^:private pre-alias-aggregations
  "Expressions are not allowed in the order by clauses of a BQ query. To sort by a custom expression, that custom
  expression must be aliased from the order by. This code will find the aggregations and give them a name if they
  don't already have one. This name can then be used in the order by if one is present."
  [driver {{aggregations :aggregation} :query, :as outer-query}]
  (if-not (seq aggregations)
    outer-query
    (update-in outer-query [:query :aggregation] (partial mbql.u/pre-alias-and-uniquify-aggregations
                                                          (partial bq-aggregate-name driver)))))

;; These provide implementations of `->honeysql` that prevent HoneySQL from converting forms to prepared statement
;; parameters (`?` symbols)
(defmethod sql.qp/->honeysql [:bigquery String]
  [_ s]
  ;; TODO - what happens if `s` contains single-quotes? Shouldn't we be escaping them somehow?
  (hx/literal s))

(defmethod sql.qp/->honeysql [:bigquery Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sql.qp/->honeysql [:bigquery Date]
  [_ date]
  (hsql/call :timestamp (hx/literal (du/date->iso-8601 date))))

(defmethod sql.qp/->honeysql [:bigquery :time]
  [driver [_ value unit]]
  (->> value
       (unparse-bigquery-time *bigquery-timezone*)
       (sql.qp/->honeysql driver)
       (sql.qp/date driver unit)
       hx/->time))

(defmethod sql.qp/->honeysql [Object :datetime-field]
  [driver [_ field unit]]
  (sql.qp/date driver unit (sql.qp/->honeysql driver field)))

(defmethod sql.qp/->honeysql [:bigquery (class Field)]
  [driver field]
  (let [{table-name :name, :as table} (qp.store/table (:table_id field))
        field-identifier              (map->BigQueryIdentifier
                                       {:table-name table-name
                                        :field-name (:name field)
                                        :alias?     (:alias? table)})]
    (sql.qp/cast-unix-timestamp-field-if-needed driver field field-identifier)))

(defmethod sql.qp/field->identifier :bigquery [_ {table-id :table_id, :as field}]
  ;; TODO - Making a DB call for each field to fetch its Table is inefficient and makes me cry, but this method is
  ;; currently only used for SQL params so it's not a huge deal at this point
  ;;
  ;; TODO - we should make sure these are in the QP store somewhere and then could at least batch the calls
  (let [table-name (db/select-one-field :name table/Table :id (u/get-id table-id))
        details    (:details (qp.store/database))]
    (map->BigQueryIdentifier {:dataset-name (:dataset-id details), :table-name table-name, :field-name (:name field)})))

(defmethod sql.qp/apply-top-level-clause [:bigquery :breakout]
  [driver _ honeysql-form {breakout-field-clauses :breakout, fields-field-clauses :fields}]
  (-> honeysql-form
      ;; Group by all the breakout fields.
      ;;
      ;; Unlike other SQL drivers, BigQuery requires that we refer to Fields using the alias we gave them in the
      ;; `SELECT` clause, rather than repeating their definitions.
      ((partial apply h/group) (map (partial sql.qp/field-clause->alias driver) breakout-field-clauses))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it
      ;; twice, or HoneySQL will barf
      ((partial apply h/merge-select) (for [field-clause breakout-field-clauses
                                            :when        (not (contains? (set fields-field-clauses) field-clause))]
                                        (sql.qp/as driver field-clause)))))

;; Copy of the SQL implementation, but prepends the current dataset ID to the table name.
(defmethod sql.qp/apply-top-level-clause [:bigquery :source-table] [_ _ honeysql-form {source-table-id :source-table}]
  (let [{table-name :name} (qp.store/table source-table-id)]
    (h/from honeysql-form (map->BigQueryIdentifier {:table-name table-name}))))

;; Copy of the SQL implementation, but prepends the current dataset ID to join-alias.
(defmethod sql.qp/apply-top-level-clause [:bigquery :join-tables]
  [_ _ honeysql-form {join-tables :join-tables, source-table-id :source-table}]
  (let [{source-table-name :name} (qp.store/table source-table-id)]
    (loop [honeysql-form honeysql-form, [{:keys [table-id pk-field-id fk-field-id join-alias]} & more] join-tables]
      (let [{table-name :name} (qp.store/table table-id)
            source-field       (qp.store/field fk-field-id)
            pk-field           (qp.store/field pk-field-id)

            honeysql-form
            (h/merge-left-join honeysql-form
              [(map->BigQueryIdentifier {:table-name table-name})
               (map->BigQueryIdentifier {:table-name join-alias, :alias? true})]
              [:=
               (map->BigQueryIdentifier {:table-name source-table-name, :field-name (:name source-field)})
               (map->BigQueryIdentifier {:table-name join-alias, :field-name (:name pk-field), :alias? true})])]
        (if (seq more)
          (recur honeysql-form more)
          honeysql-form)))))

(defn- ag-ref->alias [[_ index]]
  (let [{{aggregations :aggregation} :query} sql.qp/*query*
        [ag-type :as ag]                     (nth aggregations index)]
    (mbql.u/match-one ag
      [:distinct _]              :count
      [:expression operator & _] operator
      [:named _ ag-name]         (keyword ag-name)
      [ag-type & _]              ag-type)))

(defmethod sql.qp/apply-top-level-clause [:bigquery :order-by]
  [driver _ honeysql-form {subclauses :order-by, :as query}]
  (loop [honeysql-form honeysql-form, [[direction field-clause] & more] subclauses]
    (let [honeysql-form (h/merge-order-by honeysql-form [(if (mbql.u/is-clause? :aggregation field-clause)
                                                           (ag-ref->alias field-clause)
                                                           (sql.qp/field-clause->alias driver field-clause))
                                                         direction])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Other Driver / SQLDriver Method Implementations                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/date-interval :bigquery [driver unit amount]
  (sql.qp/->honeysql driver (du/relative-date unit amount)))

(defmethod driver/mbql->native :bigquery
  [driver
   {database-id                                                 :database
    {source-table-id :source-table, source-query :source-query} :query
    :as                                                         outer-query}]
  (let [dataset-id         (-> (qp.store/database) :details :dataset-id)
        aliased-query      (pre-alias-aggregations driver outer-query)
        {table-name :name} (some-> source-table-id qp.store/table)]
    (assert (seq dataset-id))
    (binding [sql.qp/*query* (assoc aliased-query :dataset-id dataset-id)]
      {:query      (->> aliased-query
                        (sql.qp/build-honeysql-form :bigquery)
                        honeysql-form->sql)
       :table-name (or table-name
                       (when source-query
                         sql.qp/source-query-alias))
       :mbql?      true})))

(defn- effective-query-timezone [database]
  (if-let [^java.util.TimeZone jvm-tz (and (get-in database [:details :use-jvm-timezone])
                                           @du/jvm-timezone)]
    (time/time-zone-for-id (.getID jvm-tz))
    time/utc))

(defmethod driver/execute-query :bigquery [_ {{sql :query, params :params, :keys [table-name mbql?]} :native
                                              :as                                                    outer-query}]
  (let [database (qp.store/database)]
    (binding [*bigquery-timezone* (effective-query-timezone database)]
      (let [sql (str "-- " (qputil/query->remark outer-query) "\n" (if (seq params)
                                                                     (unprepare/unprepare (cons sql params))
                                                                     sql))]
        (process-native* database sql)))))

(defmethod sql.qp/current-datetime-fn :bigquery [_] :%current_timestamp)

(defmethod sql.qp/quote-style :bigquery [_] :mysql)

(defmethod driver/supports? [:bigquery :expressions] [_ _] false)

;; Don't enable foreign keys when testing because BigQuery *doesn't* have a notion of foreign keys. Joins are still
;; allowed, which puts us in a weird position, however; people can manually specifiy "foreign key" relationships in
;; admin and everything should work correctly. Since we can't infer any "FK" relationships during sync our normal FK
;; tests are not appropriate for BigQuery, so they're disabled for the time being.
;;
;; TODO - either write BigQuery-speciifc tests for FK functionality or add additional code to manually set up these FK
;; relationships for FK tables
(defmethod driver/supports? [:bigquery :foreign-keys] [_ _] (not config/is-test?))

;; BigQuery doesn't return a timezone with it's time strings as it's always UTC, JodaTime parsing also defaults to UTC
(defmethod driver.common/current-db-time-date-formatters :bigquery [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSS"))

(defmethod driver.common/current-db-time-native-query :bigquery [_]
  "select CAST(CURRENT_TIMESTAMP() AS STRING)")

(defmethod driver/current-db-time :bigquery [& args]
  (apply driver.common/current-db-time args))
