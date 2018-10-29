(ns metabase.driver.bigquery.query-processor
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
            [metabase.driver.bigquery
             [client :as bq.client]
             [sync :as bq.sync]]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.table :as table]
            [metabase.query-processor
             [store :as qp.store]
             [util :as qputil]]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import [com.google.api.services.bigquery.model QueryResponse Table TableCell TableFieldSchema TableRow TableSchema]
           honeysql.format.ToSql
           java.sql.Time
           java.util.Date
           metabase.driver.bigquery.BigQueryDriver))

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
  {:pre [(map? sqlqp/*query*)], :post [(valid-bigquery-identifier? %)]}
  (:dataset-id sqlqp/*query*))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Running Queries & Parsing Results                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private bq-driver (BigQueryDriver.))

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
   (post-process-native response bq.client/query-timeout-seconds))
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
           columns             (for [column (bq.sync/table-schema->metabase-field-info schema)]
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
    (post-process-native (bq.client/execute-bigquery database query-string))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Generic SQL Driver Methods                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- trunc
  "Generate raw SQL along the lines of `timestamp_trunc(cast(<some-field> AS timestamp), day)`"
  [unit expr]
  (hsql/call :timestamp_trunc (hx/->timestamp expr) (hsql/raw (name unit))))

(defn- extract [unit expr]
  ;; implemenation of extract() in `metabase.util.honeysql-extensions` handles actual conversion to raw SQL (!)
  (hsql/call :extract unit (hx/->timestamp expr)))

(defn date
  "Bucket a datetime `expr` by `unit`."
  [unit expr]
  (case unit
    :default         expr
    :minute          (trunc   :minute    expr)
    :minute-of-hour  (extract :minute    expr)
    :hour            (trunc   :hour      expr)
    :hour-of-day     (extract :hour      expr)
    :day             (trunc   :day       expr)
    :day-of-week     (extract :dayofweek expr)
    :day-of-month    (extract :day       expr)
    :day-of-year     (extract :dayofyear expr)
    :week            (trunc   :week      expr)
    :week-of-year    (-> (extract :week  expr) hx/inc) ; BigQuery's impl of `week` uses 0 for the first week; we use 1
    :month           (trunc   :month     expr)
    :month-of-year   (extract :month     expr)
    :quarter         (trunc   :quarter   expr)
    :quarter-of-year (extract :quarter   expr)
    :year            (extract :year      expr)))

(defn unix-timestamp->timestamp
  "Return HoneySQL form for converting values a UNIX timestamp Field to a normal timestamp."
  [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :timestamp_seconds expr)
    :milliseconds (hsql/call :timestamp_millis  expr)))


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
                                         field-name]
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
    (str (format "`%s.%s`" (or dataset-name (dataset-name-for-current-query)) table-name)
         (when (seq field-name)
           (format ".`%s`" field-name)))))

(defn- honeysql-form->sql ^String [honeysql-form]
  {:pre [(map? honeysql-form)]}
  (let [[sql & args] (sql/honeysql-form->sql+args bq-driver honeysql-form)]
    (when (seq args)
      (throw (Exception. (str (tru "BigQuery statements can't be parameterized!")))))
    sql))

(defn- post-process-mbql [table-name {:keys [columns rows]}]
  ;; Say we have an identifier like `veryNiceDataset.shakespeare`.`corpus`. We will alias it like
  ;; `shakespeare___corpus` (because BigQuery does not let you include symbols in identifiers); during post-processing
  ;; we can go ahead and strip off the table name from the alias since we don't want it to show up in the result
  ;; column names
  (let [demangle-name #(str/replace % (re-pattern (str \^ table-name "___")) "")
        columns       (map demangle-name columns)
        rows          (for [row rows]
                        (zipmap columns row))
        columns       (vec (keys (first rows)))]
    {:columns columns
     :rows    (for [row rows]
                (mapv row columns))}))

(defn format-custom-field-name
  "Return an identifier that can be used for a custom Field by BigQuery.

  From the dox: Fields must contain only letters, numbers, and underscores, start with a letter or underscore, and be
  at most 128 characters long."
  ^String [^String custom-field-name]
  (let [replaced-str (-> (str/trim custom-field-name)
                         (str/replace #"[^\w\d_]" "_")
                         (str/replace #"(^\d)" "_$1"))]
    (subs replaced-str 0 (min 128 (count replaced-str)))))

(s/defn ^:private bq-aggregate-name :- su/NonBlankString
  "Return an approriate name for an `ag-clause`."
  [ag-clause :- mbql.s/Aggregation]
  (-> ag-clause annotate/aggregation-name format-custom-field-name))

(s/defn ^:private pre-alias-aggregations
  "Expressions are not allowed in the order by clauses of a BQ query. To sort by a custom expression, that custom
  expression must be aliased from the order by. This code will find the aggregations and give them a name if they
  don't already have one. This name can then be used in the order by if one is present."
  [{{aggregations :aggregation} :query, :as outer-query}]
  (if-not (seq aggregations)
    outer-query
    (update-in outer-query [:query :aggregation] (partial mbql.u/pre-alias-and-uniquify-aggregations bq-aggregate-name))))

;; These provide implementations of `->honeysql` that prevent HoneySQL from converting forms to prepared statement
;; parameters (`?` symbols)
(defmethod sqlqp/->honeysql [BigQueryDriver String]
  [_ s]
  ;; TODO - what happens if `s` contains single-quotes? Shouldn't we be escaping them somehow?
  (hx/literal s))

(defmethod sqlqp/->honeysql [BigQueryDriver Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sqlqp/->honeysql [BigQueryDriver Date]
  [_ date]
  (hsql/call :timestamp (hx/literal (du/date->iso-8601 date))))

(defmethod sqlqp/->honeysql [BigQueryDriver :time]
  [driver [_ value unit]]
  (->> value
       (unparse-bigquery-time *bigquery-timezone*)
       (sqlqp/->honeysql driver)
       (sql/date driver unit)
       hx/->time))

(defmethod sqlqp/->honeysql [BigQueryDriver :field-id]
  [_ [_ field-id]]
  (let [{field-name :name, special-type :special_type, table-id :table_id} (qp.store/field field-id)
        {table-name :name}                                                 (qp.store/table table-id)
        field                                                              (map->BigQueryIdentifier
                                                                            {:table-name table-name
                                                                             :field-name field-name})]
    (cond
      (isa? special-type :type/UNIXTimestampSeconds)      (unix-timestamp->timestamp field :seconds)
      (isa? special-type :type/UNIXTimestampMilliseconds) (unix-timestamp->timestamp field :milliseconds)
      :else                                               field)))

(defn- ag-ref->alias [[_ index]]
  (let [{{aggregations :aggregation} :query} sqlqp/*query*
        [ag-type :as ag]                     (nth aggregations index)]
    (mbql.u/match-one ag
      [:distinct _]              "count"
      [:expression operator & _] operator
      [:named _ ag-name]         ag-name
      [ag-type & _]              ag-type)))

(defn field->alias
  "Generate an appropriate alias for a `field`. This will normally be something like `tableName___fieldName` (done this
  way because BigQuery will not let us include symbols in identifiers, so we can't make our alias be
  `tableName.fieldName`, like we do for other drivers)."
  [{field-name :name, table-id :table_id, :as field}]
  (let [{table-name :name} (qp.store/table table-id)]
    (str table-name "___" field-name)))

(defn field->identifier
  "Generate appropriate identifier for a Field for SQL parameters. (NOTE: THIS IS ONLY USED FOR SQL PARAMETERS!)"
  ;; TODO - Making a DB call for each field to fetch its Table is inefficient and makes me cry, but this method is
  ;; currently only used for SQL params so it's not a huge deal at this point
  ;;
  ;; TODO - we should make sure these are in the QP store somewhere and then could at least batch the calls
  [{table-id :table_id, :as field}]
  (let [table-name (db/select-one-field :name table/Table :id (u/get-id table-id))
        details    (:details (qp.store/database))]
    (map->BigQueryIdentifier {:dataset-name (:dataset-id details), :table-name table-name, :field-name (:name field)})))

(defn- field-clause->field [field-clause]
  (when field-clause
    (let [id-or-name (mbql.u/field-clause->id-or-literal field-clause)]
      (when (integer? id-or-name)
        (qp.store/field id-or-name)))))

(defn- field->breakout-identifier [field-clause]
  (let [alias (if (mbql.u/is-clause? :aggregation field-clause)
                (ag-ref->alias field-clause)
                (field->alias (field-clause->field field-clause)))]
    (hsql/raw (str \` alias \`))))

(defn apply-breakout
  "Handle MBQL  `:breakout` clauses."
  [driver honeysql-form {breakout-field-clauses :breakout, fields-field-clauses :fields}]
  (-> honeysql-form
      ;; Group by all the breakout fields
      ((partial apply h/group) (map field->breakout-identifier breakout-field-clauses))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it
      ;; twice, or HoneySQL will barf
      ((partial apply h/merge-select) (for [field-clause breakout-field-clauses
                                            :when        (not (contains? (set fields-field-clauses) field-clause))]
                                        (sqlqp/as driver (sqlqp/->honeysql driver field-clause) field-clause)))))

(defn apply-source-table
  "Copy of the Generic SQL implementation of `apply-source-table` that prepends the current dataset ID to the table
  name."
  [honeysql-form {source-table-id :source-table}]
  (let [{table-name :name} (qp.store/table source-table-id)]
    (h/from honeysql-form (map->BigQueryIdentifier {:table-name table-name}))))

(defn apply-join-tables
  "Copy of the Generic SQL implementation of `apply-join-tables`, but prepends the current dataset ID to join-alias."
  [honeysql-form {join-tables :join-tables, source-table-id :source-table}]
  (let [{source-table-name :name} (qp.store/table source-table-id)]
    (loop [honeysql-form honeysql-form, [{:keys [table-id pk-field-id fk-field-id join-alias]} & more] join-tables]
      (let [{table-name :name} (qp.store/table table-id)
            source-field       (qp.store/field fk-field-id)
            pk-field           (qp.store/field pk-field-id)

            honeysql-form
            (h/merge-left-join honeysql-form
              [(map->BigQueryIdentifier {:table-name table-name})
               (map->BigQueryIdentifier {:table-name join-alias})]
              [:=
               (map->BigQueryIdentifier {:table-name source-table-name, :field-name (:name source-field)})
               (map->BigQueryIdentifier {:table-name join-alias, :field-name (:name pk-field)})])]
        (if (seq more)
          (recur honeysql-form more)
          honeysql-form)))))

(defn apply-order-by
  "Handle the MBQL `:order-by` clause."
  [driver honeysql-form {subclauses :order-by, :as query}]
  (loop [honeysql-form honeysql-form, [[direction field-clause] & more] subclauses]
    (let [honeysql-form (h/merge-order-by honeysql-form [(field->breakout-identifier field-clause)
                                                         direction])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Other Driver / SQLDriver Method Implementations                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn string-length-fn
  "Return a HoneySQL form calling the SQL function to get the length of a Field named by `field-key`."
  [field-key]
  (hsql/call :length field-key))

(defn date-interval
  "Return a representation of a moment relative to the current moment in time."
  [driver unit amount]
  (sqlqp/->honeysql driver (du/relative-date unit amount)))

(defn mbql->native
  "Custom implementation of ISQLDriver's `mbql->native` with these differences:

     *  Runs `pre-alias-aggregations` on the query
     *  Runs our customs `honeysql-form->sql` method
     *  Incldues `table-name` in the resulting map (do not remember why we are doing so, perhaps it is needed to run the
        query)"
  [{database-id                     :database
    {source-table-id :source-table} :query
    :as                             outer-query}]
  {:pre [(integer? database-id)]}
  (let [dataset-id         (-> (qp.store/database) :details :dataset-id)
        aliased-query      (pre-alias-aggregations outer-query)
        {table-name :name} (qp.store/table source-table-id)]
    (assert (seq dataset-id))
    (binding [sqlqp/*query* (assoc aliased-query :dataset-id dataset-id)]
      {:query      (->> aliased-query
                        (sqlqp/build-honeysql-form bq-driver)
                        honeysql-form->sql)
       :table-name table-name
       :mbql?      true})))

(defn- effective-query-timezone [database]
  (if-let [^java.util.TimeZone jvm-tz (and (get-in database [:details :use-jvm-timezone])
                                           @du/jvm-timezone)]
    (time/time-zone-for-id (.getID jvm-tz))
    time/utc))

(defn execute-query
  "Execute a native BigQuery query."
  [{{sql :query, params :params, :keys [table-name mbql?]} :native
    :as                                                    outer-query}]
  (let [database (qp.store/database)]
    (binding [*bigquery-timezone* (effective-query-timezone database)]
      (let [sql     (str "-- " (qputil/query->remark outer-query) "\n" (if (seq params)
                                                                         (unprepare/unprepare (cons sql params))
                                                                         sql))
            results (process-native* database sql)]
        (cond->> results
          mbql? (post-process-mbql table-name))))))
