(ns metabase.driver.bigquery.query-processor
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql :as sql]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [field :refer [Field]]
             [table :as table]]
            [metabase.query-processor
             [error-type :as error-type]
             [store :as qp.store]]
            [metabase.util
             [date-2 :as u.date]
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           metabase.util.honeysql_extensions.Identifier))

(defn- valid-bigquery-identifier?
  "Is String `s` a valid BigQuery identifier? Identifiers are only allowed to contain letters, numbers, and underscores;
  cannot start with a number; and can be at most 128 characters long."
  [s]
  (boolean
   (and (string? s)
        (re-matches #"^([a-zA-Z_][a-zA-Z_0-9]*){1,128}$" s))))

(def ^:private BigQueryIdentifierString
  (s/pred valid-bigquery-identifier? "Valid BigQuery identifier"))

(s/defn ^:private dataset-name-for-current-query :- BigQueryIdentifierString
  "Fetch the dataset name for the database associated with this query, needed because BigQuery requires you to qualify
  identifiers with it. This is primarily called automatically for the `to-sql` implementation of the
  `BigQueryIdentifier` record type; see its definition for more details."
  []
  (when (qp.store/initialized?)
    (some-> (qp.store/database) :details :dataset-id)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Running Queries & Parsing Results                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti parse-result-of-type
  "Parse the values that come back in results of a BigQuery query based on their column type."
  {:arglists '([column-type timezone-id v])}
  (fn [column-type _ _] column-type))

(defmethod parse-result-of-type :default
  [_ _ v]
  v)

(defmethod parse-result-of-type "BOOLEAN"
  [_ _ v]
  (Boolean/parseBoolean v))

(defmethod parse-result-of-type "FLOAT"
  [_ _ v]
  (Double/parseDouble v))

(defmethod parse-result-of-type "INTEGER"
  [_ _ v]
  (Long/parseLong v))

(defmethod parse-result-of-type "NUMERIC"
  [_ _ v]
  (bigdec v))

(defn- parse-timestamp-str [timezone-id s]
  ;; Timestamp strings either come back as ISO-8601 strings or Unix timestamps in µs, e.g. "1.3963104E9"
  (log/tracef "Parse timestamp string '%s' (default timezone ID = %s)" s timezone-id)
  (if-let [seconds (u/ignore-exceptions (Double/parseDouble s))]
    (t/zoned-date-time (t/instant (* seconds 1000)) (t/zone-id timezone-id))
    (u.date/parse s timezone-id)))

(defmethod parse-result-of-type "DATE"
  [_ timezone-id s]
  (parse-timestamp-str timezone-id s))

(defmethod parse-result-of-type "DATETIME"
  [_ timezone-id s]
  (parse-timestamp-str timezone-id s))

(defmethod parse-result-of-type "TIMESTAMP"
  [_ timezone-id s]
  (parse-timestamp-str timezone-id s))

(defmethod parse-result-of-type "TIME"
  [_ timezone-id s]
  (u.date/parse s timezone-id))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SQL Driver Methods                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private temporal-type-hierarchy
  (-> (make-hierarchy)
      (derive :date :temporal-type)
      (derive :time :temporal-type)
      (derive :datetime :temporal-type)
      ;; timestamp = datetime with a timezone
      (derive :timestamp :temporal-type)))

(defmulti ^:private temporal-type
  {:arglists '([x])}
  mbql.u/dispatch-by-clause-name-or-class
  :hierarchy #'temporal-type-hierarchy)

(defmethod temporal-type LocalDate      [_] :date)
(defmethod temporal-type LocalTime      [_] :time)
(defmethod temporal-type OffsetTime     [_] :time)
(defmethod temporal-type LocalDateTime  [_] :datetime)
(defmethod temporal-type OffsetDateTime [_] :timestamp)
(defmethod temporal-type ZonedDateTime  [_] :timestamp)

(defn- base-type->temporal-type [base-type]
  (condp #(isa? %2 %1) base-type
    :type/Date           :date
    :type/Time           :time
    :type/DateTimeWithTZ :timestamp
    :type/DateTime       :datetime
    nil))

(defmethod temporal-type (class Field)
  [{base-type :base_type, database-type :database_type}]
  (case database-type
    "TIMESTAMP" :timestamp
    "DATETIME"  :datetime
    "DATE"      :date
    "TIME"      :time
    (base-type->temporal-type base-type)))

(defmethod temporal-type :absolute-datetime
  [[_ t _]]
  (temporal-type t))

(defmethod temporal-type :time
  [_]
  :time)

(defmethod temporal-type :datetime-field
  [[_ field unit]]
  ;; date extraction operations result in integers, so the type of the expression shouldn't be a temporal type
  (if (u.date/extract-units unit)
    nil
    (temporal-type field)))

(defmethod temporal-type :default
  [x]
  (if (contains? (meta x) :bigquery/temporal-type)
    (:bigquery/temporal-type (meta x))
    (mbql.u/match-one x
      [:field-id id]               (temporal-type (qp.store/field id))
      [:field-literal _ base-type] (base-type->temporal-type base-type))))

(defmulti ^:private ->temporal-type
  {:arglists '([target-type x])}
  (fn [target-type x]
    [target-type (mbql.u/dispatch-by-clause-name-or-class x)])
  :hierarchy #'temporal-type-hierarchy)

(defn- throw-unsupported-conversion [from to]
  (throw (ex-info (tru "Cannot convert a {0} to a {1}" from to)
           {:type error-type/invalid-query})))

(defmethod ->temporal-type [:date LocalTime]           [_ t] (throw-unsupported-conversion "time" "date"))
(defmethod ->temporal-type [:date OffsetTime]          [_ t] (throw-unsupported-conversion "time" "date"))
(defmethod ->temporal-type [:date LocalDate]           [_ t] t)
(defmethod ->temporal-type [:date LocalDateTime]       [_ t] (t/local-date t))
(defmethod ->temporal-type [:date OffsetDateTime]      [_ t] (t/local-date t))
(defmethod ->temporal-type [:date ZonedDateTime]       [_ t] (t/local-date t))

(defmethod ->temporal-type [:time LocalTime]           [_ t] t)
(defmethod ->temporal-type [:time OffsetTime]          [_ t] (t/local-time t))
(defmethod ->temporal-type [:time LocalDate]           [_ t] (throw-unsupported-conversion "date" "time"))
(defmethod ->temporal-type [:time LocalDateTime]       [_ t] (t/local-time t))
(defmethod ->temporal-type [:time OffsetDateTime]      [_ t] (t/local-time t))
(defmethod ->temporal-type [:time ZonedDateTime]       [_ t] (t/local-time t))

(defmethod ->temporal-type [:datetime LocalTime]       [_ t] (throw-unsupported-conversion "time" "datetime"))
(defmethod ->temporal-type [:datetime OffsetTime]      [_ t] (throw-unsupported-conversion "time" "datetime"))
(defmethod ->temporal-type [:datetime LocalDate]       [_ t] (t/local-date-time t (t/local-time 0)))
(defmethod ->temporal-type [:datetime LocalDateTime]   [_ t] t)
(defmethod ->temporal-type [:datetime OffsetDateTime]  [_ t] (t/local-date-time t))
(defmethod ->temporal-type [:datetime ZonedDateTime]   [_ t] (t/local-date-time t))

;; Not sure whether we should be converting local dates/datetimes to ones with UTC timezone or with the report timezone?
(defmethod ->temporal-type [:timestamp LocalTime]      [_ t] (throw-unsupported-conversion "time" "timestamp"))
(defmethod ->temporal-type [:timestamp OffsetTime]     [_ t] (throw-unsupported-conversion "time" "timestamp"))
(defmethod ->temporal-type [:timestamp LocalDate]      [_ t] (t/zoned-date-time t (t/local-time 0) (t/zone-id "UTC")))
(defmethod ->temporal-type [:timestamp LocalDateTime]  [_ t] (t/zoned-date-time t (t/zone-id "UTC")))
(defmethod ->temporal-type [:timestamp OffsetDateTime] [_ t] t)
(defmethod ->temporal-type [:timestamp ZonedDateTime]  [_ t] t)

(defmethod ->temporal-type :default
  [target-type x]
  (cond
    (nil? x)
    nil

    (= (temporal-type x) target-type)
    (vary-meta x assoc :bigquery/temporal-type target-type)

    :else
    (let [hsql-form     (sql.qp/->honeysql :bigquery x)
          bigquery-type (case target-type
                          :date      :date
                          :time      :time
                          :datetime  :datetime
                          :timestamp :timestamp
                          nil)]
      (cond
        (nil? hsql-form)
        nil

        (= (temporal-type hsql-form) target-type)
        (vary-meta hsql-form assoc :bigquery/temporal-type target-type)

        bigquery-type
        (do
          (log/tracef "Casting %s (temporal type = %s) to %s" (binding [*print-meta* true] (pr-str x)) (temporal-type x) bigquery-type)
          (with-meta (hx/cast bigquery-type (sql.qp/->honeysql :bigquery x))
            {:bigquery/temporal-type target-type}))

        :else
        x))))

(defmethod ->temporal-type [:temporal-type :absolute-datetime]
  [target-type [_ t unit]]
  [:absolute-datetime (->temporal-type target-type t) unit])

(defn- trunc
  "Generate a SQL call an appropriate truncation function, depending on the temporal type of `expr`."
  [unit expr]
  (let [expr-type (or (temporal-type expr) :datetime)
        f         (case expr-type
                    :date      :date_trunc
                    :time      :time_trunc
                    :datetime  :datetime_trunc
                    :timestamp :timestamp_trunc)]
    (with-meta (hsql/call f (->temporal-type expr-type expr) (hsql/raw (name unit)))
      {:bigquery/temporal-type expr-type})))

(defn- extract [unit expr]
  (with-meta (hsql/call :extract unit (->temporal-type :timestamp expr))
    {:bigquery/temporal-type nil}))

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
(defmethod sql.qp/date [:bigquery :year]            [_ _ expr] (trunc   :year      expr))

(doseq [[unix-timestamp-type bigquery-fn] {:seconds      :timestamp_seconds
                                           :milliseconds :timestamp_millis}]
  (defmethod sql.qp/unix-timestamp->timestamp [:bigquery unix-timestamp-type]
    [_ _ expr]
    (vary-meta (hsql/call bigquery-fn expr) assoc :bigquery/temporal-type :timestamp)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Query Processor                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- should-qualify-identifier?
  "Should we qualify an Identifier with the dataset name?

  Table & Field identifiers (usually) need to be qualified with the current dataset name; this needs to be part of the
  table e.g.

    `table`.`field` -> `dataset.table`.`field`"
  [{:keys [identifier-type components] :as identifier}]
  (cond
    (::already-qualified? (meta identifier))
    false

    ;; If we're currently using a Table alias, don't qualify the alias with the dataset name
    sql.qp/*table-alias*
    false

    ;; otherwise always qualify Table identifiers
    (= identifier-type :table)
    true

    ;; Only qualify Field identifiers that are qualified by a Table. (e.g. don't qualify stuff inside `CREATE TABLE`
    ;; DDL statements)
    (and (= identifier-type :field)
         (>= (count components) 2))
    true))

(defmethod sql.qp/->honeysql [:bigquery (class Field)]
  [driver field]
  (let [parent-method (get-method sql.qp/->honeysql [:sql (class Field)])
        identifier    (parent-method driver field)]
    (vary-meta identifier assoc :bigquery/temporal-type (temporal-type field))))

(defmethod sql.qp/->honeysql [:bigquery Identifier]
  [_ identifier]
  (if-not (should-qualify-identifier? identifier)
    identifier
    (-> identifier
        (update :components (fn [[table & more]]
                              (cons (str (dataset-name-for-current-query) \. table)
                                    more)))
        (vary-meta assoc ::already-qualified? true))))

(doseq [clause-type [:datetime-field :field-literal :field-id]]
  (defmethod sql.qp/->honeysql [:bigquery clause-type]
    [driver clause]
    (let [hsql-form ((get-method sql.qp/->honeysql [:sql clause-type]) driver clause)]
      (vary-meta hsql-form assoc :bigquery/temporal-type (temporal-type clause)))))

(s/defn ^:private honeysql-form->sql :- s/Str
  [driver, honeysql-form :- su/Map]
  (let [[sql & args :as sql+args] (sql.qp/format-honeysql driver honeysql-form)]
    (if (seq args)
      (unprepare/unprepare driver sql+args)
      sql)))

;; From the dox: Fields must contain only letters, numbers, and underscores, start with a letter or underscore, and be
;; at most 128 characters long.
(defmethod driver/format-custom-field-name :bigquery
  [_ custom-field-name]
  (let [replaced-str (-> (str/trim custom-field-name)
                         (str/replace #"[^\w\d_]" "_")
                         (str/replace #"(^\d)" "_$1"))]
    (subs replaced-str 0 (min 128 (count replaced-str)))))

;; These provide implementations of `->honeysql` that prevent HoneySQL from converting forms to prepared statement
;; parameters (`?` symbols)
;;
;; TODO - these should probably be impls of `unprepare-value` instead, but it effectively ends up doing the same thing
;; either way
(defmethod sql.qp/->honeysql [:bigquery String]
  [_ s]
  (hx/literal s))

(defmethod sql.qp/->honeysql [:bigquery Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

;; See:
;;
;; *  https://cloud.google.com/bigquery/docs/reference/standard-sql/timestamp_functions
;; *  https://cloud.google.com/bigquery/docs/reference/standard-sql/time_functions
;; *  https://cloud.google.com/bigquery/docs/reference/standard-sql/date_functions
;; *  https://cloud.google.com/bigquery/docs/reference/standard-sql/datetime_functions

(defmethod unprepare/unprepare-value [:bigquery LocalTime]
  [_ t]
  (format "time \"%s\"" (u.date/format-sql t)))

(defmethod unprepare/unprepare-value [:bigquery LocalDate]
  [_ t]
  (format "date \"%s\"" (u.date/format-sql t)))

(defmethod unprepare/unprepare-value [:bigquery LocalDateTime]
  [_ t]
  (format "datetime \"%s\"" (u.date/format-sql t)))

(defmethod unprepare/unprepare-value [:bigquery OffsetTime]
  [_ t]
  ;; convert to a LocalTime in UTC
  (let [local-time (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))]
    (format "time \"%s\"" (u.date/format-sql local-time))))

(defmethod unprepare/unprepare-value [:bigquery OffsetDateTime]
  [_ t]
  (format "timestamp \"%s\"" (u.date/format-sql t)))

(defmethod unprepare/unprepare-value [:bigquery ZonedDateTime]
  [_ t]
  (format "timestamp \"%s %s\"" (u.date/format-sql (t/local-date-time t)) (.getId (t/zone-id t))))

(defmethod sql.qp/field->identifier :bigquery
  [_ {table-id :table_id, field-name :name, :as field}]
  ;; TODO - Making a DB call for each field to fetch its Table is inefficient and makes me cry, but this method is
  ;; currently only used for SQL params so it's not a huge deal at this point
  ;;
  ;; TODO - we should make sure these are in the QP store somewhere and then could at least batch the calls
  (let [table-name (db/select-one-field :name table/Table :id (u/get-id table-id))]
    (with-meta (hx/identifier :field table-name field-name)
      {:bigquery/temporal-type (temporal-type field)})))

(defmethod sql.qp/apply-top-level-clause [:bigquery :breakout]
  [driver _ honeysql-form {breakouts :breakout, fields :fields}]
  (-> honeysql-form
      ;; Group by all the breakout fields.
      ;;
      ;; Unlike other SQL drivers, BigQuery requires that we refer to Fields using the alias we gave them in the
      ;; `SELECT` clause, rather than repeating their definitions.
      ((partial apply h/group) (map (partial sql.qp/field-clause->alias driver) breakouts))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it
      ;; twice, or HoneySQL will barf
      ((partial apply h/merge-select) (for [field-clause breakouts
                                            :when        (not (contains? (set fields) field-clause))]
                                        (sql.qp/as driver field-clause)))))

;; as with breakouts BigQuery requires that you use the Field aliases in order by clauses, so override the methods for
;; compiling `:asc` and `:desc` and alias the Fields if applicable
(defn- alias-order-by-field [driver [direction field-clause]]
  (let [field-clause (if (mbql.u/is-clause? :aggregation field-clause)
                       field-clause
                       (sql.qp/field-clause->alias driver field-clause))]
    ((get-method sql.qp/->honeysql [:sql direction]) driver [direction field-clause])))

(defmethod sql.qp/->honeysql [:bigquery :asc]  [driver clause] (alias-order-by-field driver clause))
(defmethod sql.qp/->honeysql [:bigquery :desc] [driver clause] (alias-order-by-field driver clause))

(defn- reconcile-temporal-types
  "Make sure the temporal types of fields and values in filter clauses line up."
  [[clause-type f & args :as clause]]
  (if-let [target-type (or (temporal-type f) (some temporal-type args))]
    (do
      (log/tracef "Coercing args in %s to temporal type %s" (binding [*print-meta* true] (pr-str clause)) target-type)
      (u/prog1 (into [clause-type] (map (partial ->temporal-type target-type) (cons f args)))
        (when-not (= clause <>)
          (log/tracef "Coerced -> %s" (binding [*print-meta* true] (pr-str <>))))))
    clause))

(doseq [filter-type [:between := :!= :> :>= :< :<=]]
  (defmethod sql.qp/->honeysql [:bigquery filter-type]
    [driver clause]
    ((get-method sql.qp/->honeysql [:sql filter-type])
     driver
     (reconcile-temporal-types clause))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Other Driver / SQLDriver Method Implementations                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/date-add :bigquery
  [driver expr amount unit]
  (let [add-fn (case (temporal-type expr)
                 :timestamp :timestamp_add
                 :datetime  :datetime_add
                 :date      :date_add
                 :time      :time_add
                 nil)]
    (if-not add-fn
      (driver/date-add driver (->temporal-type :datetime expr) amount unit)
      (with-meta (hsql/call add-fn expr (hsql/raw (format "INTERVAL %d %s" (int amount) (name unit))))
        {:bigquery/temporal-type (temporal-type expr)}))))

(defmethod driver/mbql->native :bigquery
  [driver
   {database-id                                                 :database
    {source-table-id :source-table, source-query :source-query} :query
    :as                                                         outer-query}]
  (let [dataset-id         (-> (qp.store/database) :details :dataset-id)
        {table-name :name} (some-> source-table-id qp.store/table)]
    (assert (seq dataset-id))
    (binding [sql.qp/*query* (assoc outer-query :dataset-id dataset-id)]
      {:query      (->> outer-query
                        (sql.qp/build-honeysql-form driver)
                        (honeysql-form->sql driver))
       :table-name (or table-name
                       (when source-query
                         sql.qp/source-query-alias))
       :mbql?      true})))

(defmethod sql.qp/current-datetime-fn :bigquery
  [_]
  (with-meta (hsql/call :current_timestamp) {:bigquery/temporal-type :timestamp}))

(defmethod sql.qp/quote-style :bigquery
  [_]
  :mysql)

;; TIMEZONE FIXME — Not working in all cases — see #11222
(defmethod sql/->prepared-substitution [:bigquery LocalDate]
  [_ t]
  {:sql-string   "?"
   :param-values [(t/offset-date-time t (t/local-time 0) (t/zone-offset 0))]})
