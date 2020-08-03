(ns metabase.driver.sql.parameters.substitution
  "These functions take the info for a param fetched by the functions above and add additional info about how that param
  should be represented as SQL. (Specifically, they return information in this format:

    {;; appropriate SQL that should be used to replace the param snippet, e.g. {{x}}
     :replacement-snippet     \"= ?\"
     ;; ; any prepared statement args (values for `?` placeholders) needed for the replacement snippet
     :prepared-statement-args [#t \"2017-01-01\"]}"
  (:require [clojure.string :as str]
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            [metabase.driver.common.parameters :as i]
            [metabase.driver.common.parameters.dates :as date-params]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor
             [error-type :as qp.error-type]
             [timezone :as qp.timezone]]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s])
  (:import clojure.lang.Keyword
           honeysql.types.SqlCall
           java.time.temporal.Temporal
           java.util.UUID
           [metabase.driver.common.parameters CommaSeparatedNumbers Date DateRange FieldFilter MultipleValues
            ReferencedCardQuery ReferencedQuerySnippet]))

;;; ------------------------------------ ->prepared-substitution & default impls -------------------------------------

(defmulti ->prepared-substitution
  "Returns a `PreparedStatementSubstitution` (see schema below) for `x` and the given driver. This allows driver
  specific parameters and SQL replacement text (usually just ?). The param value is already prepared and ready for
  inlcusion in the query, such as what's needed for SQLite and timestamps."
  {:arglists '([driver x])}
  (fn [driver x] [(driver/dispatch-on-initialized-driver driver) (class x)])
  :hierarchy #'driver/hierarchy)

(def PreparedStatementSubstitution
  "Represents the SQL string replace value (usually ?) and the typed parameter value"
  {:sql-string   s/Str
   :param-values [s/Any]})

(s/defn make-stmt-subs :- PreparedStatementSubstitution
  "Create a `PreparedStatementSubstitution` map for `sql-string` and the `param-seq`"
  [sql-string param-seq]
  {:sql-string   sql-string
   :param-values param-seq})

(s/defn ^:private honeysql->prepared-stmt-subs
  "Convert X to a replacement snippet info map by passing it to HoneySQL's `format` function."
  [driver x]
  (let [[snippet & args] (hsql/format x, :quoting (sql.qp/quote-style driver), :allow-dashed-names? true)]
    (make-stmt-subs snippet args)))

(s/defmethod ->prepared-substitution [:sql nil] :- PreparedStatementSubstitution
  [driver _]
  (honeysql->prepared-stmt-subs driver nil))

(s/defmethod ->prepared-substitution [:sql Object] :- PreparedStatementSubstitution
  [driver obj]
  (honeysql->prepared-stmt-subs driver (str obj)))

(s/defmethod ->prepared-substitution [:sql Number] :- PreparedStatementSubstitution
  [driver num]
  (honeysql->prepared-stmt-subs driver num))

(s/defmethod ->prepared-substitution [:sql Boolean] :- PreparedStatementSubstitution
  [driver b]
  (honeysql->prepared-stmt-subs driver b))

(s/defmethod ->prepared-substitution [:sql Keyword] :- PreparedStatementSubstitution
  [driver kwd]
  (honeysql->prepared-stmt-subs driver kwd))

(s/defmethod ->prepared-substitution [:sql SqlCall] :- PreparedStatementSubstitution
  [driver sql-call]
  (honeysql->prepared-stmt-subs driver sql-call))

;; TIMEZONE FIXME - remove this since we aren't using `Date` anymore
(s/defmethod ->prepared-substitution [:sql Date] :- PreparedStatementSubstitution
  [driver date]
  (make-stmt-subs "?" [date]))

(s/defmethod ->prepared-substitution [:sql Temporal] :- PreparedStatementSubstitution
  [driver t]
  (make-stmt-subs "?" [t]))


;;; ------------------------------------------- ->replacement-snippet-info -------------------------------------------

(def ^:private ParamSnippetInfo
  {(s/optional-key :replacement-snippet)     s/Str ; allowed to be blank if this is an optional param
   (s/optional-key :prepared-statement-args) [s/Any]})

(defmulti ->replacement-snippet-info
  "Return information about how `value` should be converted to SQL, as a map with keys `:replacement-snippet` and
  `:prepared-statement-args`.

    (->replacement-snippet-info :h2 \"ABC\") -> {:replacement-snippet \"?\", :prepared-statement-args \"ABC\"}"
  {:arglists '([driver value])}
  (fn [driver v] [(driver/the-initialized-driver driver) (class v)])
  :hierarchy #'driver/hierarchy)

(defn- create-replacement-snippet [nil-or-obj]
  (let [{:keys [sql-string param-values]} (->prepared-substitution driver/*driver* nil-or-obj)]
    {:replacement-snippet     sql-string
     :prepared-statement-args param-values}))

(defmethod ->replacement-snippet-info [:sql nil]
  [_ this]
  (create-replacement-snippet this))

(defmethod ->replacement-snippet-info [:sql Object]
  [_ this]
  (create-replacement-snippet (str this)))

(defmethod ->replacement-snippet-info [:sql Number]
  [_ this]
  (create-replacement-snippet this))

(defmethod ->replacement-snippet-info [:sql Boolean]
  [_ this]
  (create-replacement-snippet this))

(defmethod ->replacement-snippet-info [:sql Keyword]
  [_ this]
  (if (= this i/no-value)
    {:replacement-snippet ""}
    (create-replacement-snippet this)))

(defmethod ->replacement-snippet-info [:sql SqlCall]
  [_ this]
  (create-replacement-snippet this))

(defmethod ->replacement-snippet-info [:sql UUID]
  [_ this]
  {:replacement-snippet (format "CAST('%s' AS uuid)" (str this))})

(defmethod ->replacement-snippet-info [:sql CommaSeparatedNumbers]
  [_ {:keys [numbers]}]
  {:replacement-snippet (str/join ", " numbers)})

(defmethod ->replacement-snippet-info [:sql MultipleValues]
  [driver {:keys [values]}]
  (let [values (map (partial ->replacement-snippet-info driver) values)]
    {:replacement-snippet     (str/join ", " (map :replacement-snippet values))
     :prepared-statement-args (apply concat (map :prepared-statement-args values))}))

(defn- maybe-parse-temporal-literal [x]
  (condp instance? x
    String   (u.date/parse x (qp.timezone/report-timezone-id-if-supported))
    Temporal x
    (throw (ex-info (tru "Don''t know how to parse {0} {1} as a temporal literal" (class x) (pr-str x))
             {:type      qp.error-type/invalid-parameter
              :parameter x}))))

(defmethod ->replacement-snippet-info [:sql Date]
  [driver {:keys [s]}]
  (create-replacement-snippet (maybe-parse-temporal-literal s)))

(defn- prepared-ts-subs [driver operator date-str]
  (let [{:keys [sql-string param-values]} (->prepared-substitution driver (maybe-parse-temporal-literal date-str))]
    {:replacement-snippet     (str operator " " sql-string)
     :prepared-statement-args param-values}))

(defmethod ->replacement-snippet-info [:sql DateRange]
  [driver {:keys [start end]}]
  (cond
    (= start end)
    (prepared-ts-subs driver \= start)

    (nil? start)
    (prepared-ts-subs driver \< end)

    (nil? end)
    (prepared-ts-subs driver \> start)

    :else
    ;; TIMEZONE FIXME - this is WRONG WRONG WRONG because date ranges should be inclusive for start and *exclusive*
    ;; for end
    (let [[start end] (map (fn [s]
                             (->prepared-substitution driver (maybe-parse-temporal-literal s)))
                           [start end])]
      {:replacement-snippet     (format "BETWEEN %s AND %s" (:sql-string start) (:sql-string end))
       :prepared-statement-args (concat (:param-values start) (:param-values end))})))


;;; ------------------------------------- Field Filter replacement snippet info --------------------------------------

(s/defn ^:private combine-replacement-snippet-maps :- ParamSnippetInfo
  "Combine multiple `replacement-snippet-maps` into a single map using a SQL `AND` clause."
  [replacement-snippet-maps :- [ParamSnippetInfo]]
  {:replacement-snippet     (str \( (str/join " AND " (map :replacement-snippet replacement-snippet-maps)) \))
   :prepared-statement-args (reduce concat (map :prepared-statement-args replacement-snippet-maps))})

;; for relative dates convert the param to a `DateRange` record type and call `->replacement-snippet-info` on it
(s/defn ^:private date-range-field-filter->replacement-snippet-info :- ParamSnippetInfo
  [driver value]
  (->> (date-params/date-string->range value)
       i/map->DateRange
       (->replacement-snippet-info driver)))

(s/defn ^:private field-filter->equals-clause-sql :- ParamSnippetInfo
  [driver value]
  (-> (->replacement-snippet-info driver value)
      (update :replacement-snippet (partial str "= "))))

(s/defn ^:private field-filter-multiple-values->in-clause-sql :- ParamSnippetInfo
  [driver values]
  (-> (->replacement-snippet-info driver (i/map->MultipleValues {:values values}))
      (update :replacement-snippet (partial format "IN (%s)"))))

(s/defn ^:private field-filter->replacement-snippet-info :- ParamSnippetInfo
  "Return `[replacement-snippet & prepared-statement-args]` appropriate for a field filter parameter."
  [driver {param-type :type, value :value} :- i/ParamValue]
  (cond
    ;; convert date ranges to DateRange record types
    (date-params/date-range-type? param-type) (date-range-field-filter->replacement-snippet-info driver value)
    ;; convert all other dates to `= <date>`
    (date-params/date-type? param-type)       (field-filter->equals-clause-sql driver (i/map->Date {:s value}))
    ;; for sequences of multiple values we want to generate an `IN (...)` clause
    (sequential? value)                       (field-filter-multiple-values->in-clause-sql driver value)
    ;; convert everything else to `= <value>`
    :else                                     (field-filter->equals-clause-sql driver value)))

(s/defn ^:private honeysql->replacement-snippet-info :- ParamSnippetInfo
  "Convert `hsql-form` to a replacement snippet info map by passing it to HoneySQL's `format` function."
  [driver hsql-form]
  (let [[snippet & args] (hsql/format hsql-form, :quoting (sql.qp/quote-style driver), :allow-dashed-names? true)]
    {:replacement-snippet     snippet
     :prepared-statement-args args}))

(s/defn ^:private field->identifier :- su/NonBlankString
  "Return an approprate snippet to represent this `field` in SQL given its param type.
   For non-date Fields, this is just a quoted identifier; for dates, the SQL includes appropriately bucketing based on
   the `param-type`."
  [driver {special-type :special_type, :as field} param-type]
  (:replacement-snippet
   (honeysql->replacement-snippet-info
    driver
    (let [identifier (sql.qp/->honeysql driver (sql.qp/field->identifier driver field))
          identifier (cond->> identifier
                       (isa? special-type :type/UNIXTimestampSeconds)      (sql.qp/unix-timestamp->honeysql driver :seconds)
                       (isa? special-type :type/UNIXTimestampMilliseconds) (sql.qp/unix-timestamp->honeysql driver :milliseconds))]
      (if (date-params/date-type? param-type)
        (sql.qp/date driver :day identifier)
        identifier)))))

(defmethod ->replacement-snippet-info [:sql FieldFilter]
  [driver {:keys [field value], :as field-filter}]
  (cond
    ;; otherwise if the value isn't present just put in something that will always be true, such as `1` (e.g. `WHERE 1
    ;; = 1`). This is only used for field filters outside of optional clauses
    (= value i/no-value) {:replacement-snippet "1 = 1"}
    ;; if we have a vector of multiple values recursively convert them to SQL and combine into an `AND` clause
    ;; (This is multiple values in the sense that the frontend provided multiple maps with value values for the same
    ;; FieldFilter, not in the sense that we have a single map with multiple values for `:value`.)
    (vector? value)
    (combine-replacement-snippet-maps (for [v value]
                                        (->replacement-snippet-info driver (assoc field-filter :value v))))
    ;; otherwise convert single value to SQL.
    ;; Convert the value to a replacement snippet info map and then tack on the field identifier to the front
    :else
    (update (field-filter->replacement-snippet-info driver value)
            :replacement-snippet (partial str (field->identifier driver field (:type value)) " "))))


;;; ------------------------------------ Referenced Card replacement snippet info ------------------------------------

(defmethod ->replacement-snippet-info [:sql ReferencedCardQuery]
  [_ {:keys [query]}]
  {:prepared-statement-args nil
   :replacement-snippet     (str "(" query ")")})


;;; ---------------------------------- Native Query Snippet replacement snippet info ---------------------------------

(defmethod ->replacement-snippet-info [:sql ReferencedQuerySnippet]
  [_ {:keys [content]}]
  {:prepared-statement-args nil
   :replacement-snippet     content})
