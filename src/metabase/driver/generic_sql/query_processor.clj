(ns metabase.driver.generic-sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into HoneySQL SQL forms."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql
             [core :as hsql]
             [format :as hformat]
             [helpers :as h]]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.query-processor
             [annotate :as annotate]
             [interface :as i]
             [util :as qputil]]
            [metabase.util.honeysql-extensions :as hx])
  (:import clojure.lang.Keyword
           [java.sql PreparedStatement ResultSet ResultSetMetaData SQLException]
           [java.util Calendar TimeZone]
           [metabase.query_processor.interface AgFieldRef BinnedField DateTimeField DateTimeValue Expression ExpressionRef Field FieldLiteral RelativeDateTimeValue Value]))

(def ^:dynamic *query*
  "The outer query currently being processed."
  nil)

(def ^:private ^:dynamic *nested-query-level*
  "How many levels deep are we into nested queries? (0 = top level.)
   We keep track of this so we know what level to find referenced aggregations
  (otherwise something like [:aggregate-field 0] could be ambiguous in a nested query).
  Each nested query increments this counter by 1."
  0)

(defn- driver [] {:pre [(map? *query*)]} (:driver *query*))

;; register the function "distinct-count" with HoneySQL
;; (hsql/format :%distinct-count.x) -> "count(distinct x)"
(defmethod hformat/fn-handler "distinct-count" [_ field]
  (str "count(distinct " (hformat/to-sql field) ")"))


;;; ## Formatting

(defn- qualified-alias
  "Convert the given `FIELD` to a stringified alias"
  [field]
  (some->> field
           (sql/field->alias (driver))
           hx/qualify-and-escape-dots))

(defn as
  "Generate a FORM `AS` FIELD alias using the name information of FIELD."
  [form field]
  (if-let [alias (qualified-alias field)]
    [form alias]
    form))

;; TODO - Consider moving this into query processor interface and making it a method on `ExpressionRef` instead ?
(defn- expression-with-name
  "Return the `Expression` referenced by a given (keyword or string) EXPRESSION-NAME."
  [expression-name]
  (or (get-in *query* [:query :expressions (keyword expression-name)]) (:expressions (:query *query*))
      (throw (Exception. (format "No expression named '%s'." (name expression-name))))))

(defn- aggregation-at-index
  "Fetch the aggregation at index. This is intended to power aggregate field references (e.g. [:aggregate-field 0]).
   This also handles nested queries, which could be potentially ambiguous if multiple levels had aggregations."
  ([index]
   (aggregation-at-index index (:query *query*) *nested-query-level*))
  ;; keep recursing deeper into the query until we get to the same level the aggregation reference was defined at
  ([index query aggregation-level]
   (if (zero? aggregation-level)
     (nth (:aggregation query) index)
     (recur index (:source-query query) (dec aggregation-level)))))

;; TODO - maybe this fn should be called `->honeysql` instead.
(defprotocol ^:private IGenericSQLFormattable
  (formatted [this]
    "Return an appropriate HoneySQL form for an object."))

(extend-protocol IGenericSQLFormattable
  nil                    (formatted [_] nil)
  Number                 (formatted [this] this)
  String                 (formatted [this] this)
  Keyword                (formatted [this] this) ; HoneySQL fn calls and keywords (e.g. `:%count.*`) are
  honeysql.types.SqlCall (formatted [this] this) ; already converted to HoneySQL so just return them as-is

  Expression
  (formatted [{:keys [operator args]}]
    (apply (partial hsql/call operator)
           (map formatted args)))

  ExpressionRef
  (formatted [{:keys [expression-name]}]
    ;; Unfortunately you can't just refer to the expression by name in other clauses like filter, but have to use the original formuala.
    (formatted (expression-with-name expression-name)))

  Field
  (formatted [{:keys [schema-name table-name special-type field-name]}]
    (let [field (keyword (hx/qualify-and-escape-dots schema-name table-name field-name))]
      (cond
        (isa? special-type :type/UNIXTimestampSeconds)      (sql/unix-timestamp->timestamp (driver) field :seconds)
        (isa? special-type :type/UNIXTimestampMilliseconds) (sql/unix-timestamp->timestamp (driver) field :milliseconds)
        :else                                               field)))

  FieldLiteral
  (formatted [{:keys [field-name]}]
    (keyword (hx/escape-dots (name field-name))))

  DateTimeField
  (formatted [{unit :unit, field :field}]
    (sql/date (driver) unit (formatted field)))

  BinnedField
  (formatted [{:keys [bin-width min-value max-value field]}]
    (let [formatted-field (formatted field)]
      ;;
      ;; Equation is | (value - min) |
      ;;             | ------------- | * bin-width + min-value
      ;;             |_  bin-width  _|
      ;;
      (-> formatted-field
          (hx/- min-value)
          (hx// bin-width)
          hx/floor
          (hx/* bin-width)
          (hx/+ min-value))))

  ;; e.g. the ["aggregation" 0] fields we allow in order-by
  AgFieldRef
  (formatted [{index :index}]
    (let [{:keys [aggregation-type]} (aggregation-at-index index)]
      ;; For some arcane reason we name the results of a distinct aggregation "count",
      ;; everything else is named the same as the aggregation
      (if (= aggregation-type :distinct)
        :count
        aggregation-type)))

  Value
  (formatted [value] (sql/prepare-value (driver) value))

  DateTimeValue
  (formatted [{{unit :unit} :field, :as value}]
    (sql/date (driver) unit (sql/prepare-value (driver) value)))

  RelativeDateTimeValue
  (formatted [{:keys [amount unit], {field-unit :unit} :field}]
    (sql/date (driver) field-unit (if (zero? amount)
                                    (sql/current-datetime-fn (driver))
                                    (driver/date-interval (driver) unit amount)))))




;;; ## Clause Handlers

(defn- aggregation->honeysql
  "Generate the HoneySQL form for an aggregation."
  [driver aggregation-type field]
  {:pre [(keyword? aggregation-type)]}
  (if-not field
    ;; aggregation clauses w/o a field
    (do (assert (or (= aggregation-type :count)
                    (= aggregation-type :cumulative-count))
          (format "Aggregations of type '%s' must specify a field." aggregation-type))
        :%count.*)
    ;; aggregation clauses w/ a Field
    (hsql/call (case aggregation-type
                 :avg      :avg
                 :count    :count
                 :distinct :distinct-count
                 :stddev   (sql/stddev-fn driver)
                 :sum      :sum
                 :min      :min
                 :max      :max)
      (formatted field))))

(defn- expression-aggregation->honeysql
  "Generate the HoneySQL form for an expression aggregation."
  [driver expression]
  (formatted (update expression :args (fn [args]
                                        (for [arg args]
                                          (cond
                                            (number? arg)           arg
                                            (:aggregation-type arg) (aggregation->honeysql driver (:aggregation-type arg) (:field arg))
                                            (:operator arg)         (expression-aggregation->honeysql driver arg)))))))

(defn- apply-expression-aggregation [driver honeysql-form expression]
  (h/merge-select honeysql-form [(expression-aggregation->honeysql driver expression)
                                 (hx/escape-dots (driver/format-custom-field-name driver (annotate/aggregation-name expression)))]))

(defn- apply-single-aggregation [driver honeysql-form {:keys [aggregation-type field], :as aggregation}]
  (h/merge-select honeysql-form [(aggregation->honeysql driver aggregation-type field)
                                 (hx/escape-dots (annotate/aggregation-name aggregation))]))

(defn apply-aggregation
  "Apply a `aggregation` clauses to HONEYSQL-FORM. Default implementation of `apply-aggregation` for SQL drivers."
  [driver honeysql-form {aggregations :aggregation}]
  (loop [form honeysql-form, [ag & more] aggregations]
    (let [form (if (instance? Expression ag)
                 (apply-expression-aggregation driver form ag)
                 (apply-single-aggregation driver form ag))]
      (if-not (seq more)
        form
        (recur form more)))))

(defn apply-breakout
  "Apply a `breakout` clause to HONEYSQL-FORM. Default implementation of `apply-breakout` for SQL drivers."
  [_ honeysql-form {breakout-fields :breakout, fields-fields :fields :as query}]
  (as-> honeysql-form new-hsql
    (apply h/merge-select new-hsql (for [field breakout-fields
                                         :when (not (contains? (set fields-fields) field))]
                                     (as (formatted field) field)))
    (apply h/group new-hsql (map formatted breakout-fields))))

(defn apply-fields
  "Apply a `fields` clause to HONEYSQL-FORM. Default implementation of `apply-fields` for SQL drivers."
  [_ honeysql-form {fields :fields}]
  (apply h/merge-select honeysql-form (for [field fields]
                                        (as (formatted field) field))))

(defn filter-subclause->predicate
  "Given a filter SUBCLAUSE, return a HoneySQL filter predicate form for use in HoneySQL `where`."
  [{:keys [filter-type field value], :as filter}]
  {:pre [(map? filter) field]}
  (let [field (formatted field)]
    (case          filter-type
      :between     [:between field (formatted (:min-val filter)) (formatted (:max-val filter))]
      :starts-with [:like    field (formatted (update value :value (fn [s] (str    s \%)))) ]
      :contains    [:like    field (formatted (update value :value (fn [s] (str \% s \%))))]
      :ends-with   [:like    field (formatted (update value :value (fn [s] (str \% s))))]
      :>           [:>       field (formatted value)]
      :<           [:<       field (formatted value)]
      :>=          [:>=      field (formatted value)]
      :<=          [:<=      field (formatted value)]
      :=           [:=       field (formatted value)]
      :!=          [:not=    field (formatted value)])))

(defn filter-clause->predicate
  "Given a filter CLAUSE, return a HoneySQL filter predicate form for use in HoneySQL `where`.
   If this is a compound clause then we call `filter-subclause->predicate` on all of the subclauses."
  [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply vector :and (map filter-clause->predicate subclauses))
    :or  (apply vector :or  (map filter-clause->predicate subclauses))
    :not [:not (filter-subclause->predicate subclause)]
    nil  (filter-subclause->predicate clause)))

(defn apply-filter
  "Apply a `filter` clause to HONEYSQL-FORM. Default implementation of `apply-filter` for SQL drivers."
  [_ honeysql-form {clause :filter}]
  (h/where honeysql-form (filter-clause->predicate clause)))

(defn apply-join-tables
  "Apply expanded query `join-tables` clause to HONEYSQL-FORM. Default implementation of `apply-join-tables` for SQL drivers."
  [_ honeysql-form {join-tables :join-tables, {source-table-name :name, source-schema :schema} :source-table}]
  (loop [honeysql-form honeysql-form, [{:keys [table-name pk-field source-field schema join-alias]} & more] join-tables]
    (let [honeysql-form (h/merge-left-join honeysql-form
                          [(hx/qualify-and-escape-dots schema table-name) (keyword join-alias)]
                          [:= (hx/qualify-and-escape-dots source-schema source-table-name (:field-name source-field))
                              (hx/qualify-and-escape-dots join-alias                      (:field-name pk-field))])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn apply-limit
  "Apply `limit` clause to HONEYSQL-FORM. Default implementation of `apply-limit` for SQL drivers."
  [_ honeysql-form {value :limit}]
  (h/limit honeysql-form value))

(defn apply-order-by
  "Apply `order-by` clause to HONEYSQL-FORM. Default implementation of `apply-order-by` for SQL drivers."
  [_ honeysql-form {subclauses :order-by breakout-fields :breakout}]
  (let [[{:keys [special-type] :as first-breakout-field}] breakout-fields]
    (loop [honeysql-form honeysql-form, [{:keys [field direction]} & more] subclauses]
      (let [honeysql-form (h/merge-order-by honeysql-form [(formatted field) (case direction
                                                                               :ascending  :asc
                                                                               :descending :desc)])]
        (if (seq more)
          (recur honeysql-form more)
          honeysql-form)))))

(defn apply-page
  "Apply `page` clause to HONEYSQL-FORM. Default implementation of `apply-page` for SQL drivers."
  [_ honeysql-form {{:keys [items page]} :page}]
  (-> honeysql-form
      (h/limit items)
      (h/offset (* items (dec page)))))

(defn- apply-source-table [honeysql-form {{table-name :name, schema :schema} :source-table}]
  {:pre [table-name]}
  (h/from honeysql-form (hx/qualify-and-escape-dots schema table-name)))

(declare apply-clauses)

(defn- apply-source-query [driver honeysql-form {{:keys [native], :as source-query} :source-query}]
  ;; TODO - what alias should we give the source query?
  (assoc honeysql-form
    :from [[(if native
              (hsql/raw (str "(" (str/replace native #";+\s*$" "") ")")) ; strip off any trailing slashes
              (binding [*nested-query-level* (inc *nested-query-level*)]
                (apply-clauses driver {} source-query)))
            :source]]))

(def ^:private clause-handlers
  ;; 1) Use the vars rather than the functions themselves because them implementation
  ;;    will get swapped around and  we'll be left with old version of the function that nobody implements
  ;; 2) This is a vector rather than a map because the order the clauses get handled is important for some drivers.
  ;;    For example, Oracle needs to wrap the entire query in order to apply its version of limit (`WHERE ROWNUM`).
  [:source-table (u/drop-first-arg apply-source-table)
   :source-query apply-source-query
   :aggregation  #'sql/apply-aggregation
   :breakout     #'sql/apply-breakout
   :fields       #'sql/apply-fields
   :filter       #'sql/apply-filter
   :join-tables  #'sql/apply-join-tables
   :order-by     #'sql/apply-order-by
   :page         #'sql/apply-page
   :limit        #'sql/apply-limit])

(defn- apply-clauses
  "Loop through all the `clause->handler` entries; if the query contains a given clause, apply the handler fn."
  [driver honeysql-form query]
  (loop [honeysql-form honeysql-form, [clause f & more] (seq clause-handlers)]
    (let [honeysql-form (if (clause query)
                          (f driver honeysql-form query)
                          honeysql-form)]
      (if (seq more)
        (recur honeysql-form more)
        ;; ok, we're done; if no `:select` clause was specified (for whatever reason) put a default (`SELECT *`) one in
        (update honeysql-form :select #(if (seq %) % [:*]))))))


(defn build-honeysql-form
  "Build the HoneySQL form we will compile to SQL and execute."
  [driverr {inner-query :query}]
  {:pre [(map? inner-query)]}
  (u/prog1 (apply-clauses driverr {} inner-query)
    (when-not i/*disable-qp-logging*
      (log/debug "HoneySQL Form: 🍯\n" (u/pprint-to-str 'cyan <>)))))

(defn mbql->native
  "Transpile MBQL query into a native SQL statement."
  [driver {inner-query :query, database :database, :as outer-query}]
  (binding [*query* outer-query]
    (let [honeysql-form (build-honeysql-form driver outer-query)
          [sql & args]  (sql/honeysql-form->sql+args driver honeysql-form)]
      {:query  sql
       :params args})))

(defn- parse-date-as-string
  "Most databases will never invoke this code. It's possible with
  SQLite to get here if the timestamp was stored without
  milliseconds. Currently the SQLite JDBC driver will throw an
  exception even though the SQLite datetime functions will return
  datetimes that don't include milliseconds. This attempts to parse
  that datetime in Clojure land"
  [^TimeZone tz ^ResultSet rs ^Integer i]
  (let [date-string (.getString rs i)]
    (if-let [parsed-date (u/str->date-time tz date-string)]
      parsed-date
      (throw (Exception. (format "Unable to parse date '%s'" date-string))))))

(defn- get-date [^TimeZone tz]
  (fn [^ResultSet rs _ ^Integer i]
    (try
      (.getDate rs i (Calendar/getInstance tz))
      (catch SQLException e
        (parse-date-as-string tz rs i)))))

(defn- get-timestamp [^TimeZone tz]
  (fn [^ResultSet rs _ ^Integer i]
    (try
      (.getTimestamp rs i (Calendar/getInstance tz))
      (catch SQLException e
        (parse-date-as-string tz rs i)))))

(defn- get-object [^ResultSet rs _ ^Integer i]
  (.getObject rs i))

(defn- make-column-reader
  "Given `COLUMN-TYPE` and `TZ`, return a function for reading
  that type of column from a ResultSet"
  [column-type tz]
  (cond
    (and tz (= column-type java.sql.Types/DATE))
    (get-date tz)

    (and tz (= column-type java.sql.Types/TIMESTAMP))
    (get-timestamp tz)

    :else
    get-object))

(defn- read-columns-with-date-handling
  "Returns a function that will read a row from `RS`, suitable for
  being passed into the clojure.java.jdbc/query function"
  [timezone]
  (fn [^ResultSet rs ^ResultSetMetaData rsmeta idxs]
    (let [data-read-functions (map (fn [^Integer i] (make-column-reader (.getColumnType rsmeta i) timezone)) idxs)]
      (mapv (fn [^Integer i data-read-fn]
              (jdbc/result-set-read-column (data-read-fn rs rsmeta i) rsmeta i)) idxs data-read-functions))))

(defn- set-parameters-with-timezone
  "Returns a function that will set date/timestamp PreparedStatement
  parameters with the correct timezone"
  [^TimeZone tz]
  (fn [^PreparedStatement stmt params]
    (mapv (fn [^Integer i value]
            (cond

              (and tz (instance? java.sql.Timestamp value))
              (.setTimestamp stmt i value (Calendar/getInstance tz))

              (and tz (instance? java.util.Date value))
              (.setDate stmt i value (Calendar/getInstance tz))

              :else
              (jdbc/set-parameter value stmt i)))
          (rest (range)) params)))

(defn- run-query
  "Run the query itself."
  [{sql :query, params :params, remark :remark} timezone connection]
  (let [sql              (str "-- " remark "\n" (hx/unescape-dots sql))
        statement        (into [sql] params)
        [columns & rows] (jdbc/query connection statement {:identifiers    identity, :as-arrays? true
                                                           :read-columns   (read-columns-with-date-handling timezone)
                                                           :set-parameters (set-parameters-with-timezone timezone)})]
    {:rows    (or rows [])
     :columns columns}))

(defn- exception->nice-error-message ^String [^SQLException e]
  (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
           (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
           second)             ; so just return the part of the exception that is relevant
      (.getMessage e)))

(defn- do-with-try-catch {:style/indent 0} [f]
  (try (f)
       (catch SQLException e
         (log/error (jdbc/print-sql-exception-chain e))
         (throw (Exception. (exception->nice-error-message e))))))

(defn- do-with-auto-commit-disabled
  "Disable auto-commit for this transaction, and make the transaction `rollback-only`, which means when the transaction finishes `.rollback` will be called instead of `.commit`.
   Furthermore, execute F in a try-finally block; in the `finally`, manually call `.rollback` just to be extra-double-sure JDBC any changes made by the transaction aren't committed."
  {:style/indent 1}
  [conn f]
  (jdbc/db-set-rollback-only! conn)
  (.setAutoCommit (jdbc/get-connection conn) false)
  ;; TODO - it would be nice if we could also `.setReadOnly` on the transaction as well, but that breaks setting the timezone. Is there some way we can have our cake and eat it too?
  (try (f)
       (finally (.rollback (jdbc/get-connection conn)))))

(defn- do-in-transaction [connection f]
  (jdbc/with-db-transaction [transaction-connection connection]
    (do-with-auto-commit-disabled transaction-connection (partial f transaction-connection))))

(defn- set-timezone!
  "Set the timezone for the current connection."
  [driver settings connection]
  (let [timezone      (u/prog1 (:report-timezone settings)
                        (assert (re-matches #"[A-Za-z\/_]+" <>)))
        format-string (sql/set-timezone-sql driver)
        sql           (format format-string (str \' timezone \'))]
    (log/debug (u/format-color 'green "Setting timezone with statement: %s" sql))
    (jdbc/db-do-prepared connection [sql])))

(defn- run-query-without-timezone [driver settings connection query]
  (do-in-transaction connection (partial run-query query nil)))

(defn- run-query-with-timezone [driver {:keys [^String report-timezone] :as settings} connection query]
  (try
    (do-in-transaction connection (fn [transaction-connection]
                                    (set-timezone! driver settings transaction-connection)
                                    (run-query query (some-> report-timezone TimeZone/getTimeZone) transaction-connection)))
    (catch SQLException e
      (log/error "Failed to set timezone:\n" (with-out-str (jdbc/print-sql-exception-chain e)))
      (run-query-without-timezone driver settings connection query))
    (catch Throwable e
      (log/error "Failed to set timezone:\n" (.getMessage e))
      (run-query-without-timezone driver settings connection query))))


(defn execute-query
  "Process and run a native (raw SQL) QUERY."
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [query (assoc query :remark (qputil/query->remark outer-query))]
    (do-with-try-catch
      (fn []
        (let [db-connection (sql/db->jdbc-connection-spec database)]
          ((if (seq (:report-timezone settings))
             run-query-with-timezone
             run-query-without-timezone) driver settings db-connection query))))))
