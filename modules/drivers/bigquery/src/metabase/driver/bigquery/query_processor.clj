(ns metabase.driver.bigquery.query-processor
  (:require [clj-time
             [coerce :as tcoerce]
             [format :as tformat]]
            [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.bigquery.common :as bigquery.common]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.table :as table]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.sql.Time
           java.util.Date
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
  {:arglists '([column-type timezone v])}
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

(defn- parse-timestamp-str [timezone s]
  ;; Timestamp strings either come back as ISO-8601 strings or Unix timestamps in µs, e.g. "1.3963104E9"
  (or
   (du/->Timestamp s timezone)
   ;; If parsing as ISO-8601 fails parse as a double then convert to ms. This is ms since epoch in UTC. By using
   ;; `->Timestamp`, it will convert from ms in UTC to a timestamp object in the JVM timezone
   (du/->Timestamp (* (Double/parseDouble s) 1000))))

(defmethod parse-result-of-type "DATE"
  [_ timezone s]
  (parse-timestamp-str timezone s))

(defmethod parse-result-of-type "DATETIME"
  [_ timezone s]
  (parse-timestamp-str timezone s))

(defmethod parse-result-of-type "TIMESTAMP"
  [_ timezone s]
  (parse-timestamp-str timezone s))

(defn- bigquery-time-format [timezone]
  (tformat/formatter "HH:mm:SS" timezone))

(defn- unparse-bigquery-time [timezone coercible-to-dt]
  (->> coercible-to-dt
       tcoerce/to-date-time
       (tformat/unparse (bigquery-time-format timezone))))

(defmethod parse-result-of-type "TIME"
  [_ timezone s]
  (->> s
       (tformat/parse (bigquery-time-format timezone))
       tcoerce/to-long
       Time.))


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
(defmethod sql.qp/date [:bigquery :year]            [_ _ expr] (trunc   :year      expr))

(defmethod sql.qp/unix-timestamp->timestamp [:bigquery :seconds] [_ _ expr]
  (hsql/call :timestamp_seconds expr))

(defmethod sql.qp/unix-timestamp->timestamp [:bigquery :milliseconds] [_ _ expr]
  (hsql/call :timestamp_millis expr))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Query Processor                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- should-qualify-identifier?
  "Should we qualify an Identifier with the dataset name?

  Table & Field identifiers (usually) need to be qualified with the current dataset name; this needs to be part of the
  table e.g.

    `table`.`field` -> `dataset.table`.`field`"
  [{:keys [identifier-type components]}]
  (cond
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

(defmethod sql.qp/->honeysql [:bigquery Identifier]
  [_ identifier]
  (cond-> identifier
    (should-qualify-identifier? identifier)
    (update :components (fn [[table & more]]
                          (cons (str (dataset-name-for-current-query) \. table)
                                more)))))

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
(defmethod sql.qp/->honeysql [:bigquery String]
  [_ s]
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
       (unparse-bigquery-time bigquery.common/*bigquery-timezone*)
       (sql.qp/->honeysql driver)
       (sql.qp/date driver unit)
       hx/->time))

(defmethod sql.qp/field->identifier :bigquery
  [_ {table-id :table_id, field-name :name, :as field}]
  ;; TODO - Making a DB call for each field to fetch its Table is inefficient and makes me cry, but this method is
  ;; currently only used for SQL params so it's not a huge deal at this point
  ;;
  ;; TODO - we should make sure these are in the QP store somewhere and then could at least batch the calls
  (let [table-name (db/select-one-field :name table/Table :id (u/get-id table-id))]
    (hx/identifier :field table-name field-name)))

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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Other Driver / SQLDriver Method Implementations                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/date-add :bigquery
  [_ dt amount unit]
  (hsql/call :datetime_add (hx/->datetime dt) (hsql/raw (format "INTERVAL %d %s" (int amount) (name unit)))))

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
  [_] :%current_timestamp)

(defmethod sql.qp/quote-style :bigquery
  [_] :mysql)
