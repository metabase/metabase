(ns metabase.query-processor.middleware.parameters.native.substitution
  "These functions take the info for a param fetched by the functions above and add additional info about how that param
  should be represented as SQL. (Specifically, they return information in this format:

    {;; appropriate SQL that should be used to replace the param snippet, e.g. {{x}}
     :replacement-snippet     \"= ?\"
     ;; ; any prepared statement args (values for `?` placeholders) needed for the replacement snippet
     :prepared-statement-args [#inst \"2017-01-01\"]}"
  (:require [clojure.string :as str]
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            [metabase.driver.sql :as sql]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor.middleware.parameters.dates :as date-params]
            [metabase.query-processor.middleware.parameters.native.interface :as i]
            [metabase.util
             [date :as du]
             [schema :as su]]
            [schema.core :as s])
  (:import clojure.lang.Keyword
           honeysql.types.SqlCall
           java.util.UUID
           [metabase.query_processor.middleware.parameters.native.interface CommaSeparatedNumbers Date DateRange
            FieldFilter MultipleValues]))

(def ^:private ParamSnippetInfo
  {(s/optional-key :replacement-snippet)     s/Str     ; allowed to be blank if this is an optional param
   (s/optional-key :prepared-statement-args) [s/Any]})

(defmulti ->replacement-snippet-info
  "Return information about how `value` should be converted to SQL, as a map with keys `:replacement-snippet` and
  `:prepared-statement-args`.

    (->replacement-snippet-info \"ABC\") -> {:replacement-snippet \"?\", :prepared-statement-args \"ABC\"}"
  {:arglists '([value])}
  class)

(defn- create-replacement-snippet [nil-or-obj]
  (let [{:keys [sql-string param-values]} (sql/->prepared-substitution driver/*driver* nil-or-obj)]
    {:replacement-snippet     sql-string
     :prepared-statement-args param-values}))

(defmethod ->replacement-snippet-info nil
  [this]
  (create-replacement-snippet this))

(defmethod ->replacement-snippet-info Object
  [this]
  (create-replacement-snippet (str this)))

(defmethod ->replacement-snippet-info Number
  [this]
  (create-replacement-snippet this))

(defmethod ->replacement-snippet-info Boolean
  [this]
  (create-replacement-snippet this))

(defmethod ->replacement-snippet-info Keyword
  [this]
  (if (= this i/no-value)
    {:replacement-snippet ""}
    (create-replacement-snippet this)))

(defmethod ->replacement-snippet-info SqlCall
  [this]
  (create-replacement-snippet this))

(defmethod ->replacement-snippet-info UUID
  [this]
  {:replacement-snippet (format "CAST('%s' AS uuid)" (str this))})

(defmethod ->replacement-snippet-info CommaSeparatedNumbers
  [{:keys [numbers]}]
  {:replacement-snippet (str/join ", " numbers)})

(defmethod ->replacement-snippet-info MultipleValues
  [{:keys [values]}]
  (let [values (map ->replacement-snippet-info values)]
    {:replacement-snippet     (str/join ", " (map :replacement-snippet values))
     :prepared-statement-args (apply concat (map :prepared-statement-args values))}))

(defmethod ->replacement-snippet-info Date
  [{:keys [s]}]
  (create-replacement-snippet (du/->Timestamp s)))

(defn- prepared-ts-subs [operator date-str]
  (let [{:keys [sql-string param-values]} (sql/->prepared-substitution driver/*driver* (du/->Timestamp date-str))]
    {:replacement-snippet     (str operator " " sql-string)
     :prepared-statement-args param-values}))

(defmethod ->replacement-snippet-info DateRange
  [{:keys [start end]}]
  (cond
    (= start end)
    (prepared-ts-subs \= start)

    (nil? start)
    (prepared-ts-subs \< end)

    (nil? end)
    (prepared-ts-subs \> start)

    :else
    (let [params (map (comp #(sql/->prepared-substitution driver/*driver* %) du/->Timestamp) [start end])]
      {:replacement-snippet     (apply format "BETWEEN %s AND %s" (map :sql-string params)),
       :prepared-statement-args (vec (mapcat :param-values params))})))


;;; ------------------------------------- Field Filter replacement snippet info --------------------------------------

(s/defn ^:private combine-replacement-snippet-maps :- ParamSnippetInfo
  "Combine multiple `replacement-snippet-maps` into a single map using a SQL `AND` clause."
  [replacement-snippet-maps :- [ParamSnippetInfo]]
  {:replacement-snippet     (str \( (str/join " AND " (map :replacement-snippet replacement-snippet-maps)) \))
   :prepared-statement-args (reduce concat (map :prepared-statement-args replacement-snippet-maps))})

(defn- relative-date-param-type? [param-type]
  (contains? #{:date/range :date/month-year :date/quarter-year :date/relative :date/all-options} param-type))

;; for relative dates convert the param to a `DateRange` record type and call `->replacement-snippet-info` on it
(s/defn ^:private relative-date-field-filter->replacement-snippet-info :- ParamSnippetInfo
  [value]
  ;; TODO - get timezone from query dict
  (-> (date-params/date-string->range value (.getID du/*report-timezone*))
      i/map->DateRange
      ->replacement-snippet-info))

(s/defn ^:private field-filter->equals-clause-sql :- ParamSnippetInfo
  [value]
  (-> (->replacement-snippet-info value)
      (update :replacement-snippet (partial str "= "))))

(s/defn ^:private field-filter-multiple-values->in-clause-sql :- ParamSnippetInfo
  [values]
  (-> (i/map->MultipleValues {:values values})
      ->replacement-snippet-info
      (update :replacement-snippet (partial format "IN (%s)"))))

(s/defn ^:private field-filter->replacement-snippet-info :- ParamSnippetInfo
  "Return `[replacement-snippet & prepared-statement-args]` appropriate for a field filter parameter."
  [{param-type :type, value :value} :- i/ParamValue]
  (cond
    ;; convert relative dates to approprate date range representations
    (relative-date-param-type? param-type) (relative-date-field-filter->replacement-snippet-info value)
    ;; convert all other dates to `= <date>`
    (date-params/date-type? param-type)    (field-filter->equals-clause-sql (i/map->Date {:s value}))
    ;; for sequences of multiple values we want to generate an `IN (...)` clause
    (sequential? value)                    (field-filter-multiple-values->in-clause-sql value)
    ;; convert everything else to `= <value>`
    :else                                  (field-filter->equals-clause-sql value)))

(s/defn ^:private honeysql->replacement-snippet-info :- ParamSnippetInfo
  "Convert `x` to a replacement snippet info map by passing it to HoneySQL's `format` function."
  [x]
  (let [[snippet & args] (hsql/format x, :quoting (sql.qp/quote-style driver/*driver*), :allow-dashed-names? true)]
    {:replacement-snippet     snippet
     :prepared-statement-args args}))

(s/defn ^:private field->identifier :- su/NonBlankString
  "Return an approprate snippet to represent this `field` in SQL given its param type.
   For non-date Fields, this is just a quoted identifier; for dates, the SQL includes appropriately bucketing based on
   the `param-type`."
  [field param-type]
  (:replacement-snippet
   (honeysql->replacement-snippet-info
    (let [identifier (sql.qp/->honeysql driver/*driver* (sql.qp/field->identifier driver/*driver* field))]
      (if (date-params/date-type? param-type)
        (sql.qp/date driver/*driver* :day identifier)
        identifier)))))

(defmethod ->replacement-snippet-info FieldFilter
  [{:keys [field value], :as field-filter}]
  (cond
    ;; otherwise if the value isn't present just put in something that will always be true, such as `1` (e.g. `WHERE 1
    ;; = 1`). This is only used for field filters outside of optional clauses
    (= value i/no-value) {:replacement-snippet "1 = 1"}
    ;; if we have a vector of multiple values recursively convert them to SQL and combine into an `AND` clause
    ;; (This is multiple values in the sense that the frontend provided multiple maps with value values for the same
    ;; FieldFilter, not in the sense that we have a single map with multiple values for `:value`.)
    (vector? value)
    (combine-replacement-snippet-maps (for [v value]
                                        (->replacement-snippet-info (assoc field-filter :value v))))
    ;; otherwise convert single value to SQL.
    ;; Convert the value to a replacement snippet info map and then tack on the field identifier to the front
    :else
    (update (field-filter->replacement-snippet-info value)
            :replacement-snippet (partial str (field->identifier field (:type value)) " "))))
