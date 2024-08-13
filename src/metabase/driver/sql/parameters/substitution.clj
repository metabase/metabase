(ns metabase.driver.sql.parameters.substitution
  "These functions take the info for a param fetched by the functions above and add additional info about how that param
  should be represented as SQL. (Specifically, they return information in this format:

    {;; appropriate SQL that should be used to replace the param snippet, e.g. {{x}}
     :replacement-snippet     \"= ?\"
     ;; ; any prepared statement args (values for `?` placeholders) needed for the replacement snippet
     :prepared-statement-args [#t \"2017-01-01\"]}"
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.dates :as params.dates]
   [metabase.driver.common.parameters.operators :as params.ops]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.wrap-value-literals :as qp.wrap-value-literals]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang IPersistentVector Keyword)
   (java.time.temporal Temporal)
   (java.util UUID)
   (metabase.driver.common.parameters Date DateRange DateTimeRange FieldFilter ReferencedCardQuery ReferencedQuerySnippet)))

;;; ------------------------------------ ->prepared-substitution & default impls -------------------------------------

(defmulti ->prepared-substitution
  "Returns a `PreparedStatementSubstitution` (see schema below) for `x` and the given driver. This allows driver
  specific parameters and SQL replacement text (usually just ?). The param value is already prepared and ready for
  inlcusion in the query, such as what's needed for SQLite and timestamps."
  {:added "0.34.0" :arglists '([driver x])}
  (fn [driver x] [(driver/dispatch-on-initialized-driver driver) (class x)])
  :hierarchy #'driver/hierarchy)

(def PreparedStatementSubstitution
  "Represents the SQL string replace value (usually ?) and the typed parameter value"
  [:map
   [:sql-string   :string]
   [:param-values [:maybe [:sequential :any]]]])

(mu/defn make-stmt-subs :- PreparedStatementSubstitution
  "Create a `PreparedStatementSubstitution` map for `sql-string` and the `param-seq`"
  [sql-string param-seq]
  {:sql-string   sql-string
   :param-values param-seq})

(defn- honeysql->prepared-stmt-subs
  "Convert X to a replacement snippet info map by passing it to HoneySQL's `format` function."
  [driver x]
  (let [honeysql         (sql.qp/->honeysql driver x)
        [snippet & args] (sql.qp/format-honeysql driver honeysql)]
    (make-stmt-subs snippet args)))

(mu/defmethod ->prepared-substitution [:sql nil] :- PreparedStatementSubstitution
  [driver _]
  (honeysql->prepared-stmt-subs driver nil))

(mu/defmethod ->prepared-substitution [:sql Object] :- PreparedStatementSubstitution
  [driver obj]
  (honeysql->prepared-stmt-subs driver (str obj)))

(mu/defmethod ->prepared-substitution [:sql Number] :- PreparedStatementSubstitution
  [driver num]
  (honeysql->prepared-stmt-subs driver num))

(mu/defmethod ->prepared-substitution [:sql Boolean] :- PreparedStatementSubstitution
  [driver b]
  (honeysql->prepared-stmt-subs driver b))

(mu/defmethod ->prepared-substitution [:sql Keyword] :- PreparedStatementSubstitution
  [driver kwd]
  (honeysql->prepared-stmt-subs driver kwd))

(mu/defmethod ->prepared-substitution [:sql Date] :- PreparedStatementSubstitution
  [_driver date]
  (make-stmt-subs "?" [date]))

(mu/defmethod ->prepared-substitution [:sql Temporal] :- PreparedStatementSubstitution
  [driver t]
  (honeysql->prepared-stmt-subs driver t))

(defmulti align-temporal-unit-with-param-type
  "Returns a suitable temporal unit conversion keyword for `field`, `param-type` and the given driver.
  The resulting keyword will be used to call the corresponding `metabase.driver.sql.query-processor/date`
  implementation to convert the `field`.
  Returns `nil` if the conversion is not necessary for this `field` and `param-type` combination.
  Deprecated: use `align-temporal-unit-with-param-type-and-value` instead, as it has access to `value`."
  {:added "0.48.0" :deprecated "0.49.0" :arglists '([driver field param-type])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti align-temporal-unit-with-param-type-and-value
  "Returns a suitable temporal unit conversion keyword for `field`, `param-type`, `value` and the given driver.
  The resulting keyword will be used to call the corresponding `metabase.driver.sql.query-processor/date`
  implementation to convert the `field`.
  Returns `nil` if the conversion is not necessary for this `field`, `param-type` and `value` combination."
  {:added "0.49.0" :arglists '([driver field param-type value])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod align-temporal-unit-with-param-type :default
  [_driver _field param-type]
  (when (params.dates/date-type? param-type)
    :day))

(defmethod align-temporal-unit-with-param-type-and-value :default
  [_driver _field param-type value]
  (when (params.dates/date-type? param-type)
    (if-let [exclusion-type (params.dates/exclusion-date-type param-type value)]
      exclusion-type
      :default)))

;;; ------------------------------------------- ->replacement-snippet-info -------------------------------------------

(def ^:private ParamSnippetInfo
  [:map
   [:replacement-snippet     {:optional true} :string] ; allowed to be blank if this is an optional param
   [:prepared-statement-args {:optional true} [:maybe [:sequential :any]]]])

(defmulti ->replacement-snippet-info
  "Return information about how `value` should be converted to SQL, as a map with keys `:replacement-snippet` and
  `:prepared-statement-args`.

    (->replacement-snippet-info :h2 \"ABC\") -> {:replacement-snippet \"?\", :prepared-statement-args \"ABC\"}"
  {:added "0.33.4" :arglists '([driver value])}
  (fn [driver v & _args] [(driver/the-initialized-driver driver) (class v)])
  :hierarchy #'driver/hierarchy)

(defn- create-replacement-snippet
  [driver nil-or-obj]
  (let [{:keys [sql-string param-values]} (->prepared-substitution driver nil-or-obj)]
    {:replacement-snippet     sql-string
     :prepared-statement-args param-values}))

(defmethod ->replacement-snippet-info [:sql nil]
  [driver this]
  (create-replacement-snippet driver this))

(defmethod ->replacement-snippet-info [:sql Object]
  [driver this]
  (create-replacement-snippet driver (str this)))

(defmethod ->replacement-snippet-info [:sql Number]
  [driver this]
  (create-replacement-snippet driver this))

(defmethod ->replacement-snippet-info [:sql Boolean]
  [driver this]
  (create-replacement-snippet driver this))

(defmethod ->replacement-snippet-info [:sql Keyword]
  [driver this]
  (if (= this params/no-value)
    {:replacement-snippet ""}
    (create-replacement-snippet driver this)))

(defmethod ->replacement-snippet-info [:sql UUID]
  [_driver this]
  {:replacement-snippet (format "CAST('%s' AS uuid)" (str this))})

(defmethod ->replacement-snippet-info [:sql IPersistentVector]
  [driver values]
  (let [values (map (partial ->replacement-snippet-info driver) values)]
    {:replacement-snippet     (str/join ", " (map :replacement-snippet values))
     :prepared-statement-args (apply concat (map :prepared-statement-args values))}))

(mu/defn- maybe-parse-temporal-literal :- (lib.schema.common/instance-of-class java.time.temporal.Temporal)
  [x]
  (condp instance? x
    String   (u.date/parse x)
    Temporal x
    (throw (ex-info (tru "Don''t know how to parse {0} {1} as a temporal literal" (class x) (pr-str x))
             {:type      qp.error-type/invalid-parameter
              :parameter x}))))

(defmethod ->replacement-snippet-info [:sql Date]
  [driver {:keys [s]}]
  (create-replacement-snippet driver (maybe-parse-temporal-literal s)))

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

(defmethod ->replacement-snippet-info [:sql DateTimeRange]
  [driver {:keys [start end]} & [field-identifier]]
  (let [[start end] (map (fn [s]
                           (->prepared-substitution driver (maybe-parse-temporal-literal s)))
                         [start end])]
    {:replacement-snippet     (format "%s >= %s AND %s < %s"
                                      field-identifier (:sql-string start) field-identifier (:sql-string end))
     :prepared-statement-args (concat (:param-values start) (:param-values end))}))

;;; ------------------------------------- Field Filter replacement snippet info --------------------------------------

(mu/defn- combine-replacement-snippet-maps :- ParamSnippetInfo
  "Combine multiple `replacement-snippet-maps` into a single map using a SQL `AND` clause."
  [replacement-snippet-maps :- [:maybe [:sequential ParamSnippetInfo]]]
  {:replacement-snippet     (str \( (str/join " AND " (map :replacement-snippet replacement-snippet-maps)) \))
   :prepared-statement-args (mapcat :prepared-statement-args replacement-snippet-maps)})

;; for relative dates convert the param to a `DateRange` record type and call `->replacement-snippet-info` on it
(mu/defn- date-range-field-filter->replacement-snippet-info :- ParamSnippetInfo
  [driver value]
  (->> (params.dates/date-string->range value)
       params/map->DateRange
       (->replacement-snippet-info driver)))

(mu/defn- field-filter->equals-clause-sql :- ParamSnippetInfo
  [driver value]
  (-> (->replacement-snippet-info driver value)
      (update :replacement-snippet (partial str "= "))))

(mu/defn- field-filter-multiple-values->in-clause-sql :- ParamSnippetInfo
  [driver values]
  (-> (->replacement-snippet-info driver (vec values))
      (update :replacement-snippet (partial format "IN (%s)"))))

(mu/defn- honeysql->replacement-snippet-info :- ParamSnippetInfo
  "Convert `hsql-form` to a replacement snippet info map by passing it to HoneySQL's `format` function."
  [driver hsql-form]
  (let [[snippet & args] (sql.qp/format-honeysql driver hsql-form)]
    {:replacement-snippet     snippet
     :prepared-statement-args args}))

(mu/defn- field->clause :- mbql.s/field
  [driver     :- :keyword
   field      :- ::lib.schema.metadata/column
   param-type :- ::lib.schema.parameter/type
   value]
  ;; The [[metabase.query-processor.middleware.parameters/substitute-parameters]] QP middleware actually happens before
  ;; the [[metabase.query-processor.middleware.resolve-fields/resolve-fields]] middleware that would normally fetch all
  ;; the Fields we need in a single pass, so this is actually necessary here. I don't think switching the order of the
  ;; middleware would work either because we don't know what Field this parameter actually refers to until we resolve
  ;; the parameter. There's probably _some_ way to structure things that would make this "duplicate" call unneeded, but
  ;; I haven't figured out what that is yet
  [:field
   (u/the-id field)
   {:base-type                (:base-type field)
    :temporal-unit            (align-temporal-unit-with-param-type-and-value driver field param-type value)
    ::add/source-table        (:table-id field)
    ;; in case anyone needs to know we're compiling a Field filter.
    ::compiling-field-filter? true}])

(mu/defn- field->identifier :- ::lib.schema.common/non-blank-string
  "Return an approprate snippet to represent this `field` in SQL given its param type.
   For non-date Fields, this is just a quoted identifier; for dates, the SQL includes appropriately bucketing based on
   the `param-type`."
  [driver field param-type value]
  (->> (field->clause driver field param-type value)
       (sql.qp/->honeysql driver)
       (honeysql->replacement-snippet-info driver)
       :replacement-snippet))

(defn- field-filter->replacement-snippet-for-datetime-field
  "Generate replacement snippet for field filter on datetime field. For details on how range is generated see
  the docstring of [[params.dates/date-str->datetime-range]]."
  [driver {:keys [field] {:keys [value type]} :value :as _field-filter}]
  (letfn [(->datetime-replacement-snippet-info
            [range]
            (->replacement-snippet-info driver range (field->identifier driver field type value)))]
    (-> (params.dates/date-str->datetime-range value)
        params/map->DateTimeRange
        ->datetime-replacement-snippet-info)))

(mu/defn- field-filter->replacement-snippet-info :- ParamSnippetInfo
  "Return `[replacement-snippet & prepared-statement-args]` appropriate for a field filter parameter."
  [driver {{param-type :type, value :value, :as params} :value, field :field, :as field-filter}]
  (assert (:id field) (format "Why doesn't Field have an ID?\n%s" (u/pprint-to-str field)))
  (letfn [(prepend-field [x]
            (update x :replacement-snippet
                    (partial str (field->identifier driver field param-type value) " ")))
          (->honeysql [form]
            (sql.qp/->honeysql driver form))]
    (cond
      (params.ops/operator? param-type)
      (->> (assoc params :target [:template-tag (field->clause driver field param-type value)])
           params.ops/to-clause
           mbql.u/desugar-filter-clause
           qp.wrap-value-literals/wrap-value-literals-in-mbql
           ->honeysql
           (honeysql->replacement-snippet-info driver))

      (params.dates/exclusion-date-type param-type value)
      (let [field-clause (field->clause driver field param-type value)]
        (->> (params.dates/date-string->filter value field-clause)
             mbql.u/desugar-filter-clause
             qp.wrap-value-literals/wrap-value-literals-in-mbql
             ->honeysql
             (honeysql->replacement-snippet-info driver)))

      ;; Special handling for `FieldFilter`s on `:type/DateTime` fields. DateTime range is always generated.
      (and (params.dates/date-type? param-type)
           (isa? ((some-fn :effective-type :base-type) field) :type/DateTime))
      (field-filter->replacement-snippet-for-datetime-field driver field-filter)

      ;; convert other date to DateRange record types
      (params.dates/not-single-date-type? param-type) (prepend-field
                                                       (date-range-field-filter->replacement-snippet-info driver value))

      ;; convert all other dates to `= <date>`
      (params.dates/date-type? param-type)            (prepend-field
                                                       (field-filter->equals-clause-sql driver (params/map->Date {:s value})))
      ;; for sequences of multiple values we want to generate an `IN (...)` clause
      (sequential? value)                             (prepend-field
                                                       (field-filter-multiple-values->in-clause-sql driver value))
      ;; convert everything else to `= <value>`
      :else                                           (prepend-field
                                                       (field-filter->equals-clause-sql driver value)))))

(mu/defmethod ->replacement-snippet-info [:sql FieldFilter]
  [driver                            :- :keyword
   {:keys [value], :as field-filter} :- [:map
                                         [:field ::lib.schema.metadata/column]
                                         [:value :any]]]
  (cond
    ;; otherwise if the value isn't present just put in something that will always be true, such as `1` (e.g. `WHERE 1
    ;; = 1`). This is only used for field filters outside of optional clauses
    (= value params/no-value) {:replacement-snippet "1 = 1"}
    ;; if we have a vector of multiple values recursively convert them to SQL and combine into an `AND` clause
    ;; (This is multiple values in the sense that the frontend provided multiple maps with value values for the same
    ;; FieldFilter, not in the sense that we have a single map with multiple values for `:value`.)
    (sequential? value)
    (combine-replacement-snippet-maps (for [v value]
                                        (->replacement-snippet-info driver (assoc field-filter :value v))))
    ;; otherwise convert single value to SQL.
    :else
    (field-filter->replacement-snippet-info driver field-filter)))

;;; ------------------------------------ Referenced Card replacement snippet info ------------------------------------

(defmethod ->replacement-snippet-info [:sql ReferencedCardQuery]
  [_ {:keys [query params]}]
  {:prepared-statement-args (not-empty params)
   :replacement-snippet     (sql.qp/make-nestable-sql query)})

;;; ---------------------------------- Native Query Snippet replacement snippet info ---------------------------------

(defmethod ->replacement-snippet-info [:sql ReferencedQuerySnippet]
  [_ {:keys [content]}]
  {:prepared-statement-args nil
   :replacement-snippet     content})
