(ns metabase.driver.druid.query-processor
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [types :as types]
             [util :as u]]
            [metabase.driver.druid.js :as js]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.query-processor
             [error-type :as qp.error-type]
             [interface :as i]
             [store :as qp.store]
             [timezone :as qp.timezone]]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.util
             [date-2 :as u.date]
             [i18n :as ui18n :refer [trs tru]]]
            [schema.core :as s]))

(def ^:private ^:const topN-max-results
  "Maximum number of rows the topN query in Druid should return. Huge values cause significant issues with the engine.

   Coming from the default value hardcoded in the Druid engine itself
   http://druid.io/docs/latest/querying/topnquery.html"
  1000)

;;             +-----> ::scan        +----> :groupBy
;; ::query ----|                     |
;;             +----> ::ag-query ----+----> ::topN
;;                                   |                       +----> total
;;                                   +----> ::timeseries ----|
;;                                                           +----> grouped-timeseries

(derive ::scan               ::query)
(derive ::ag-query           ::query)
(derive ::topN               ::ag-query)
(derive ::groupBy            ::ag-query)
(derive ::timeseries         ::ag-query)
(derive ::total              ::timeseries)
(derive ::grouped-timeseries ::timeseries)

(def ^:private ^:dynamic *query*
  "The INNER part of the query currently being processed.
   (`:settings` is merged in from the outer query as well so we can access timezone info)."
  nil)

(defn- query-type-dispatch-fn
  [query-type & _]
  query-type)

(defmulti ^:private ->rvalue
  "Convert something to an 'rvalue`, i.e. a value that could be used in the right-hand side of an assignment expression.

    (let [x 100] ...) ; x is the lvalue; 100 is the rvalue"
  {:arglists '([x])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod ->rvalue nil
  [_]
  nil)

(defmethod ->rvalue Object
  [this]
  this)

(defn- ag-clause->rvalue [[ag-type :as ag]]
  (cond
    (= [:count] ag)
    :count

    (= ag-type :distinct)
    :distinct___count

    (= ag-type :aggregation-options)
    (let [[_ wrapped-ag options] ag]
      (or (:name options) (recur wrapped-ag)))

    ag-type
    ag-type

    :else
    (throw (Exception. "Unknown aggregation type!"))))

(defmethod ->rvalue :aggregation
  [[_ index]]
  (ag-clause->rvalue (nth (:aggregation *query*) index)))

(defmethod ->rvalue :field-id
  [[_ field-id]]
  (:name (qp.store/field field-id)))

(defmethod ->rvalue :datetime-field
  [[_ field]]
  (->rvalue field))

(defmethod ->rvalue :absolute-datetime
  [[_ t unit]]
  (u.date/format
   (if (= unit :default)
     t
     (u.date/truncate t unit))))

;; TODO - not 100% sure how to handle times here, just treating it exactly like a date will have to do for now
(defmethod ->rvalue :time
  [[_ t unit]]
  (u.date/format (u.date/truncate t unit)))

(defmethod ->rvalue :relative-datetime
  [[_ amount unit]]
  (u.date/format (u.date/truncate (u.date/add unit amount) unit)))

(defmethod ->rvalue :value
  [[_ value]]
  (->rvalue value))


(defmulti ^:private dimension-or-metric?
  "Is this field clause a `:dimension` or `:metric`?"
  {:arglists '([field-clause])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod dimension-or-metric? :field-id
  [[_ field-id]]
  (let [{base-type :base_type, database-type :database_type} (qp.store/field field-id)]
    (cond
      (str/includes? database-type "[metric]") :metric
      (isa? base-type :type/DruidHyperUnique)  :metric
      :else                                    :dimension)))

(defmethod dimension-or-metric? :datetime-field
  [[_ field]]
  (dimension-or-metric? field))

(defn- random-query-id []
  (str (java.util.UUID/randomUUID)))

(defn- query-type->default-query [query-type]
  (merge
   {:intervals   ["1900-01-01/2100-01-01"]
    :granularity :all
    :context     {:timeout 60000
                  :queryId (random-query-id)}}
   (case query-type
     ::scan               {:queryType :scan
                           :limit     i/absolute-max-results}
     ::total              {:queryType :timeseries}
     ::grouped-timeseries {:queryType :timeseries}
     ::topN               {:queryType :topN
                           :threshold topN-max-results}
     ::groupBy            {:queryType :groupBy})))


;;; ---------------------------------------------- handle-source-table -----------------------------------------------

(defn- handle-source-table
  [_ {source-table-id :source-table} druid-query]
  (let [{source-table-name :name} (qp.store/table source-table-id)]
    (assoc-in druid-query [:query :dataSource] source-table-name)))


;;; ---------------------- handle-filter. See http://druid.io/docs/latest/querying/filters.html ----------------------

(def ^:private ^{:arglists '([clause])} field?
  (partial mbql.u/is-clause? #{:field-id :datetime-field}))

(defn- filter:and
  [filters]
  {:type   :and
   :fields filters})

(defn- filter:not
  [filtr]
  {:pre [filtr]}
  (if (= (:type filtr) :not)     ; it looks like "two nots don't make an identity" with druid
    (:field filtr)
    {:type :not, :field filtr}))

(defn- filter:=
  [field value]
  {:type      :selector
   :dimension (->rvalue field)
   :value     (->rvalue value)})

(defn- filter:nil?
  [clause-or-field]
  (if (mbql.u/is-clause? #{:+ :- :/ :*} clause-or-field)
    (filter:and (for [arg   (rest clause-or-field)
                      :when (field? arg)]
                  (filter:nil? arg)))
    (filter:= clause-or-field (case (dimension-or-metric? clause-or-field)
                                :dimension nil
                                :metric    0))))

(defn- filter:like
  "Build a `like` filter clause, which is almost just like a SQL `LIKE` clause."
  [field pattern case-sensitive?]
  {:type         :like
   :dimension    (->rvalue field)
   ;; tell Druid to use backslash as an escape character
   :escape       "\\"
   ;; if this is a case-insensitive search we'll lower-case the search pattern and add an extraction function to
   ;; lower-case the dimension values we're matching against
   :pattern      (cond-> pattern
                   (not case-sensitive?) str/lower-case)
   :extractionFn (when-not case-sensitive?
                   {:type :lower})})

(defn- escape-like-filter-pattern
  "Escape `%`, `_`, and backslash symbols that aren't meant to have special meaning in `like` filters
  patterns. Backslashes wouldn't normally have a special meaning, but we specify backslash as our escape character in
  the `filter:like` function above, so they need to be escaped as well."
  [s]
  (str/replace s #"([%_\\])" "\\\\$1"))

(defn- filter:bound
  "Numeric `bound` filter, for finding values of `field` that are less than some value-or-field, greater than some
  value-or-field, or both. Defaults to being `inclusive` (e.g. `<=` instead of `<`) but specify option `inclusive?` to
  change this."
  [field & {:keys [lower upper inclusive?]
            :or   {inclusive? true}}]
  {:type        :bound
   :ordering    :numeric
   :dimension   (->rvalue field)
   :lower       (num (->rvalue lower))
   :upper       (num (->rvalue upper))
   :lowerStrict (not inclusive?)
   :upperStrict (not inclusive?)})

(defmulti ^:private parse-filter
  "Parse an MBQL `filter-clause` and generate an appropriate Druid filter map.

    (parse-filter [:= [:field-id 1] 2]) ; -> {:type :selector, :dimension \"venue_price\", :value 2}"
  {:arglists '([filter-clause])}
  ;; dispatch function first checks to make sure this is a valid filter clause, then dispatches off of the clause name
  ;; if it is.
  (fn [[clause-name & args, :as filter-clause]]
    (let [fields (filter (partial mbql.u/is-clause? #{:field-id :datetime-field}) args)]
      ;; and make sure none of the Fields are datetime Fields We'll handle :timestamp separately. It needs to go in
      ;; :intervals instead
      (when (not-any? (partial mbql.u/is-clause? :datetime-field) fields)
        clause-name))))

(defmethod parse-filter nil
  [_]
  nil)

(defmethod parse-filter :between
  [[_ field min-val max-val]]
  (filter:bound field, :lower min-val, :upper max-val))

(defmethod parse-filter :contains
  [[_ field string-or-field options]]
  {:type      :search
   :dimension (->rvalue field)
   :query     {:type          :contains
               :value         (->rvalue string-or-field)
               :caseSensitive (get options :case-sensitive true)}})

(defmethod parse-filter :starts-with
  [[_ field string-or-field options]]
  (filter:like field
               (str (escape-like-filter-pattern (->rvalue string-or-field)) \%)
               (get options :case-sensitive true)))

(defmethod parse-filter :ends-with
  [[_ field string-or-field options]]
  (filter:like field
               (str \% (escape-like-filter-pattern (->rvalue string-or-field)))
               (get options :case-sensitive true)))

(defmethod parse-filter :=
  [[_ field value-or-field]]
  (filter:= field value-or-field))

(defmethod parse-filter :!=
  [[_ field value-or-field]]
  (filter:not (filter:= field value-or-field)))

(defmethod parse-filter :<
  [[_ field value-or-field]]
  (filter:bound field, :upper value-or-field, :inclusive? false))

(defmethod parse-filter :>
  [[_ field value-or-field]]
  (filter:bound field, :lower value-or-field, :inclusive? false))

(defmethod parse-filter :<=
  [[_ field value-or-field]]
  (filter:bound field, :upper value-or-field))

(defmethod parse-filter :>=
  [[_ field value-or-field]]
  (filter:bound field, :lower value-or-field))

(defmethod parse-filter :and
  [[_ & args]]
  (when-let [fields (seq (keep identity (map parse-filter args)))]
    {:type :and, :fields (vec fields)}))

(defmethod parse-filter :or
  [[_ & args]]
  (when-let [fields (seq (keep identity (map parse-filter args)))]
    {:type :or, :fields (vec fields)}))

(defmethod parse-filter :not
  [[_ subclause]]
  (when-let [subclause (parse-filter subclause)]
    (filter:not subclause)))

(defn- add-datetime-units
  "Adding `n` `:default` units doesn't make sense. So if an `:absoulte-datetime` has `:default` as its unit, add `n`
  milliseconds, because that is the smallest unit Druid supports."
  [clause n]
  (mbql.u/replace clause
    [:absolute-datetime t :default]
    [:absolute-datetime (u.date/add t :millisecond n) :millisecond]

    _
    (mbql.u/add-datetime-units clause n)))

(defn- ->absolute-timestamp ^java.time.temporal.Temporal [clause]
  (mbql.u/match-one clause
    [:absolute-datetime t :default]
    t

    [:absolute-datetime t unit]
    (u.date/truncate t unit)

    [:relative-datetime amount unit]
    (u.date/truncate (u.date/add unit amount) unit)

    _
    nil))

(defmulti ^:private filter-clause->intervals
  "Generate query intervals as appropriate from a `filter-clause` containing a `:datetime-field`. `:intervals` are
  specified seperately from other things we think of as filter clauses in Druid. For temporal filter clauses, this
  returns a sequence of min/max datetime tuples; like `[#t 2019-01-01 #t 2019-10-01]`; for irrelevant filter
  clauses, the methods are skipped entirely."
  {:arglists '([filter-clause])}
  (fn [clause]
    (when (mbql.u/match-one clause :datetime-field)
      (mbql.u/dispatch-by-clause-name-or-class clause))))

(defmethod filter-clause->intervals :default
  [_]
  nil)

;; BETWEEN "2015-12-09", "2015-12-11" -> ["2015-12-09/2015-12-12"], because BETWEEN is inclusive
(defmethod filter-clause->intervals :between
  [[_ _ min-value max-value]]
  [[(->absolute-timestamp min-value) (->absolute-timestamp (add-datetime-units max-value 1))]])

(defmethod filter-clause->intervals :=
  [[_ _ v]]
  [[(->absolute-timestamp v) (->absolute-timestamp (add-datetime-units v 1))]])

(defmethod filter-clause->intervals :!=
  [[_ _ v]]
  [[nil (->absolute-timestamp v)] [(->absolute-timestamp (add-datetime-units v 1)) nil]])

(defmethod filter-clause->intervals :>
  [[_ _ v]]
  [[(->absolute-timestamp (add-datetime-units v 1)) nil]])

(defmethod filter-clause->intervals :>=
  [[_ _ v]]
  [[(->absolute-timestamp v) nil]])

(defmethod filter-clause->intervals :<
  [[_ _ v]]
  [[nil (->absolute-timestamp v)]])

(defmethod filter-clause->intervals :<=
  [[_ _ v]]
  [[nil (->absolute-timestamp (add-datetime-units v 1))]])

;; When you're anding together multiple intervals we have to combine them into a single interval that is the
;; logical equivalent of all the intervals. e.g.
;;
;; `[:and [:>= x 2018] [:< x 2019]]` should get converted to a `2018/2019` interval.
(defn- combine-intervals [[min-1 max-1] [min-2 max-2]]
  (let [datetime-max (fn [x y] (if (pos? (compare x y)) x y))
        datetime-min (fn [x y] (if (neg? (compare x y)) x y))]
    [(if (and min-1 min-2)
       (datetime-max min-1 min-2)
       (or min-1 min-2))
     (if (and max-1 max-2)
       (datetime-min max-1 max-2)
       (or max-1 max-2))]))

(defmethod filter-clause->intervals :and
  [[_ & subclauses]]
  (let [subclause-intervals           (map filter-clause->intervals subclauses)
        flattened-subclause-intervals (apply concat (filter #(= (count %) 1) subclause-intervals))]
    ;; log a warning about all the intervals we filtered out above
    (doseq [intervals subclause-intervals
            :when     (> (count intervals) 1)]
      (log/warn (tru "WARNING: Don't know how to combine these intervals into a single interval.")
                "\n"
                (tru "Ignoring intervals: {0}" intervals)))
    (reduce
     (fn [[acc] interval]
       [(combine-intervals acc interval)])
     nil
     flattened-subclause-intervals)))

(defmethod filter-clause->intervals :or
  [[_ & subclauses]]
  (mapcat filter-clause->intervals subclauses))

(defmethod filter-clause->intervals :not
  [[_ subclause]]
  ;; first, check and see if the subclause is actually something that will produce intervals (i.e., if it is a
  ;; temporal filter). If it is, then negate the logic and use the intervals for that. We don't want to call negate
  ;; without checking first because some filters like string `:contains` can't be negated without using a `:not`
  ;; filter and we don't want to stack overflow
  (when (seq (filter-clause->intervals subclause))
    (filter-clause->intervals (mbql.u/negate-filter-clause subclause))))

(defn- compile-intervals
  "Compile the interval pairs generated by `filter-clause->intervals` into the format expected by Druid (`min/max`
  strings)."
  [intervals]
  (when-let [intervals (seq (filter some? intervals))]
    (for [[min-value max-value] intervals]
      (format "%s/%s"
              (or (some-> min-value u.date/format) "-5000")
              (or (some-> max-value u.date/format) "5000")))))

(defn- handle-filter
  [_ {filter-clause :filter} druid-query]
  (if-not filter-clause
    druid-query
    (let [filter    (parse-filter filter-clause)
          intervals (compile-intervals (filter-clause->intervals filter-clause))]
      (cond-> druid-query
        (seq filter)    (assoc-in [:query :filter] filter)
        (seq intervals) (assoc-in [:query :intervals] intervals)))))


;;; ----------------------------------------------- handle-aggregation -----------------------------------------------


(defn- expression->field-names
  [[_ & args]]
  {:post [(every? (some-fn keyword? string?) %)]}
  (flatten (for [arg   args
                 :when (or (field? arg)
                           (mbql.u/is-clause? #{:+ :- :/ :*} arg))]
             (cond
               (mbql.u/is-clause? #{:+ :- :/ :*} arg) (expression->field-names arg)
               (field? arg)                           (->rvalue arg)))))

(defn- expression-arg->js
  [arg default-value]
  (if-not (field? arg)
    arg
    (js/or (js/parse-float (->rvalue arg))
           default-value)))

(defn- expression->js
  [[operator & args] default-value]
  (apply (case operator
           :+ js/+
           :- js/-
           :* js/*
           :/ js//)
         (for [arg args]
           (expression-arg->js arg default-value))))

(defn- ag:doubleSum:expression
  [[operator :as expression] output-name]
  (let [field-names (expression->field-names expression)]
    {:type        :javascript
     :name        output-name
     :fieldNames  field-names
     :fnReset     (js/function []
                    (js/return 0))
     :fnAggregate (js/function (cons :current field-names)
                    (js/return (js/+ :current (expression->js expression (if (= operator :/) 1 0)))))
     :fnCombine   (js/function [:x :y]
                    (js/return (js/+ :x :y)))}))

(defn- ag:doubleSum
  [field-clause output-name]
  (if (mbql.u/is-clause? #{:+ :- :/ :*} field-clause)
    (ag:doubleSum:expression field-clause output-name)
    ;; metrics can use the built-in :doubleSum aggregator, but for dimensions we have to roll something that does the
    ;; same thing in JS
    (case (dimension-or-metric? field-clause)
      :metric    {:type      :doubleSum
                  :name      output-name
                  :fieldName (->rvalue field-clause)}
      :dimension {:type        :javascript
                  :name        output-name
                  :fieldNames  [(->rvalue field-clause)]
                  :fnReset     "function() { return 0 ; }"
                  :fnAggregate "function(current, x) { return current + (parseFloat(x) || 0); }"
                  :fnCombine   "function(x, y) { return x + y; }"})))

(defn- ag:doubleMin:expression
  [expression output-name]
  (let [field-names (expression->field-names expression)]
    {:type        :javascript
     :name        output-name
     :fieldNames  field-names
     :fnReset     (js/function []
                    (js/return "Number.MAX_VALUE"))
     :fnAggregate (js/function (cons :current field-names)
                    (js/return (js/fn-call :Math.min :current (expression->js expression :Number.MAX_VALUE))))
     :fnCombine   (js/function [:x :y]
                    (js/return (js/fn-call :Math.min :x :y)))}))

(defn- ag:doubleMin
  [field-clause output-name]
  (if (mbql.u/is-clause? #{:+ :- :/ :*} field-clause)
    (ag:doubleMin:expression field-clause output-name)
    (case (dimension-or-metric? field-clause)
      :metric    {:type      :doubleMin
                  :name      output-name
                  :fieldName (->rvalue field-clause)}
      :dimension {:type        :javascript
                  :name        output-name
                  :fieldNames  [(->rvalue field-clause)]
                  :fnReset     "function() { return Number.MAX_VALUE ; }"
                  :fnAggregate "function(current, x) { return Math.min(current, (parseFloat(x) || Number.MAX_VALUE)); }"
                  :fnCombine   "function(x, y) { return Math.min(x, y); }"})))

(defn- ag:doubleMax:expression
  [expression output-name]
  (let [field-names (expression->field-names expression)]
    {:type        :javascript
     :name        output-name
     :fieldNames  field-names
     :fnReset     (js/function []
                    (js/return "Number.MIN_VALUE"))
     :fnAggregate (js/function (cons :current field-names)
                    (js/return (js/fn-call :Math.max :current (expression->js expression :Number.MIN_VALUE))))
     :fnCombine   (js/function [:x :y]
                    (js/return (js/fn-call :Math.max :x :y)))}))

(defn- ag:doubleMax
  [field output-name]
  (if (mbql.u/is-clause? #{:+ :- :/ :*} field)
    (ag:doubleMax:expression field output-name)
    (case (dimension-or-metric? field)
      :metric    {:type      :doubleMax
                  :name      output-name
                  :fieldName (->rvalue field)}
      :dimension {:type        :javascript
                  :name        output-name
                  :fieldNames  [(->rvalue field)]
                  :fnReset     "function() { return Number.MIN_VALUE ; }"
                  :fnAggregate "function(current, x) { return Math.max(current, (parseFloat(x) || Number.MIN_VALUE)); }"
                  :fnCombine   "function(x, y) { return Math.max(x, y); }"})))

(defn- ag:filtered
  [filtr aggregator]
  {:pre [(map? filtr)]}
  {:type :filtered, :filter filtr, :aggregator aggregator})

(defn- hyper-unique?
  [[_ field-id]]
  (-> field-id qp.store/field :base_type (isa? :type/DruidHyperUnique)))

(defn- ag:distinct
  [field output-name]
  (cond
    (mbql.u/is-clause? #{:+} field)
    {:type       :cardinality
     :name       output-name
     :fieldNames (mapv ->rvalue (rest field))
     :byRow      true
     :round      true}
    (hyper-unique? field)
    {:type      :hyperUnique
     :name      output-name
     :fieldName (->rvalue field)}
    :else
    {:type       :cardinality
     :name       output-name
     :fieldNames [(->rvalue field)]
     :byRow      true
     :round      true}))

(defn- ag:count
  ([output-name]
   {:type :count, :name output-name})
  ([field output-name]
   (if (and (mbql.u/is-clause? #{:field-id} field)
            (hyper-unique? field))
     {:type      :hyperUnique
      :name      output-name
      :fieldName (->rvalue field)}
     (ag:filtered (filter:not (filter:nil? field)) (ag:count output-name)))))

(defn- ag:countWhere
  [pred output-name]
  (ag:filtered (parse-filter pred) (ag:count output-name)))

(defn- ag:sumWhere
  [field pred output-name]
  (ag:filtered (parse-filter pred) (ag:doubleSum field output-name)))

(def ^:private ^{:arglists '([prefix])} genname
  (comp name gensym))

(defn- create-aggregation-clause
  [output-name ag-type ag-field args]
  (let [output-name-kwd (keyword output-name)]
    (match [ag-type ag-field]
      ;; For 'distinct values' queries (queries with a breakout by no aggregation) just aggregate by count, but name
      ;; it :___count so it gets discarded automatically
      [nil     nil]    [[(or output-name-kwd :___count)] {:aggregations [(ag:count (or output-name :___count))]}]

      [:count  nil]    [[(or output-name-kwd :count)] {:aggregations [(ag:count (or output-name :count))]}]

      [:count    _]    [[(or output-name-kwd :count)] {:aggregations [(ag:count ag-field (or (name output-name) :count))]}]

      [:avg      _]    (let [count-name (genname "___count_")
                             sum-name   (genname "___sum_")]
                         [[(keyword count-name) (keyword sum-name) (or output-name-kwd :avg)]
                          {:aggregations     [(ag:count ag-field count-name)
                                              (ag:doubleSum ag-field sum-name)]
                           :postAggregations [{:type   :arithmetic
                                               :name   (or output-name :avg)
                                               :fn     :/
                                               :fields [{:type :fieldAccess, :fieldName sum-name}
                                                        {:type :fieldAccess, :fieldName count-name}]}]}])

      [:sum-where _]   (let [[pred] args]
                         [[(or output-name-kwd :sum-where)]
                          {:aggregations [(ag:sumWhere ag-field pred output-name-kwd)]}])

      [:count-where _] [[(or output-name-kwd :count-where)]
                        {:aggregations [(ag:countWhere ag-field output-name-kwd)]}]

      [:share    _]    (let [total-count-name (genname "___total_count_")
                             true-count-name  (genname "___true_count_")]
                         [[(keyword total-count-name) (keyword true-count-name) (or output-name-kwd :share)]
                          {:aggregations     [(ag:count total-count-name)
                                              (ag:countWhere ag-field true-count-name)]
                           :postAggregations [{:type   :arithmetic
                                               :name   (or output-name :share)
                                               :fn     :/
                                               :fields [{:type :fieldAccess, :fieldName true-count-name}
                                                        {:type :fieldAccess, :fieldName total-count-name}]}]}])

      [:distinct _]    [[(or output-name-kwd :distinct___count)]
                        {:aggregations [(ag:distinct ag-field (or output-name :distinct___count))]}]
      [:sum      _]    [[(or output-name-kwd :sum)]
                        {:aggregations [(ag:doubleSum ag-field (or (name output-name) :sum))]}]
      [:min      _]    [[(or output-name-kwd :min)]
                        {:aggregations [(ag:doubleMin ag-field (or output-name :min))]}]
      [:max      _]    [[(or output-name-kwd :max)]
                        {:aggregations [(ag:doubleMax ag-field (or output-name :max))]}])))

(s/defn ^:private handle-aggregation
  [query-type, ag-clause :- mbql.s/Aggregation, druid-query]
  (let [output-name               (annotate/aggregation-name ag-clause)
        [ag-type ag-field & args] (mbql.u/match-one ag-clause
                                    [:aggregation-options ag & _] (recur ag)
                                    _                             &match)]
    (if-not (isa? query-type ::ag-query)
      druid-query
      (let [[projections ag-clauses] (try
                                       (create-aggregation-clause output-name ag-type ag-field args)
                                       (catch Throwable e
                                         (throw (ex-info (tru "Error creating aggregation clause")
                                                         {:type        qp.error-type/driver
                                                          :clause-name output-name
                                                          :ag-type     ag-type
                                                          :ag-field    ag-field
                                                          :args        args}
                                                         e))))]
        (-> druid-query
            (update :projections into projections)
            (update :query (partial merge-with concat) ag-clauses))))))

(defn- deduplicate-aggregation-options [expression]
  (mbql.u/replace expression
    [:aggregation-options [:aggregation-options ag options-1] options-2]
    [:aggregation-options ag (merge options-1 options-2)]))

(def ^:private ^:dynamic *query-unique-identifier-counter*
  "Counter used for generating unique identifiers for use in the query. Bound to `(atom 0)` and incremented on each use
  as the MBQL query is compiled."
  nil)

(defn- aggregation-unique-identifier [clause]
  (format "__%s_%d" (name clause) (first (swap-vals! *query-unique-identifier-counter* inc))))

(defn- add-expression-aggregation-output-names
  [expression]
  (mbql.u/replace expression
    [:aggregation-options ag options]
    (deduplicate-aggregation-options [:aggregation-options (add-expression-aggregation-output-names ag) options])

    [(clause :guard #{:count :avg :distinct :stddev :sum :min :max}) & _]
    [:aggregation-options &match {:name (aggregation-unique-identifier clause)}]))

(defn- post-aggregator-type
  "Complex aggregators like `cardinality` and ``hyperUnique` (which we use to implement MBQL
  `:distinct`) require finalizing their return value.
  https://druid.apache.org/docs/latest/querying/post-aggregations.html"
  [[op & _]]
  (if (= :distinct op)
    :finalizingFieldAccess
    :fieldAccess))

(defn- expression-post-aggregation
  [[operator & args, :as expression]]
  (mbql.u/match-one expression
    ;; If it's a named expression, we want to preserve the included name, so recurse, but merge in the name
    [:aggregation-options ag _]
    (merge (expression-post-aggregation (second expression))
           {:name (annotate/aggregation-name expression)})

    _
    {:type   :arithmetic
     :name   (annotate/aggregation-name expression)
     :fn     operator
     :fields (vec (for [arg args]
                    (mbql.u/match-one arg
                      number?
                      {:type :constant, :name (str &match), :value &match}

                      [:aggregation-options ag (options :guard :name)]
                      {:type (post-aggregator-type ag), :fieldName (:name options)}

                      #{:+ :- :/ :*}
                      (expression-post-aggregation &match)

                      ;; we should never get here unless our code is B U S T E D
                      _
                      (throw (ex-info (tru "Expected :aggregation-options, constant, or expression.")
                               {:type :bug, :input arg})))))}))


(declare handle-aggregations)

(defn- expression->actual-ags
  "Return a flattened list of actual aggregations that are needed for `expression`."
  [[_ & args]]
  (apply concat (for [arg   args
                      :when (not (number? arg))]
                  (if (mbql.u/is-clause? #{:+ :- :/ :*} arg)
                    (expression->actual-ags arg)
                    [arg]))))

(defn- unwrap-name
  [x]
  (if (mbql.u/is-clause? :aggregation-options x)
    (second x)
    x))

(defn- handle-expression-aggregation
  [query-type [operator & args, :as expression] druid-query]
  ;; filter out constants from the args list
  (let [expression    (add-expression-aggregation-output-names expression)
        ;; The QP will automatically add a generated name to the expression, if it's there, unwrap it before looking
        ;; for the aggregation
        ags           (expression->actual-ags (unwrap-name expression))
        druid-query (handle-aggregations query-type {:aggregation ags} druid-query)
        post-agg      (expression-post-aggregation expression)]
    (-> druid-query
        (update :projections conj (keyword (:name post-agg)))
        (update-in [:query :postAggregations] concat [post-agg]))))

(defn- handle-aggregations
  [query-type {aggregations :aggregation} druid-query]
  (reduce
   (fn [druid-query aggregation]
     (mbql.u/match-one aggregation
       [:aggregation-options [(_ :guard #{:+ :- :/ :*}) & _] _]
       (handle-expression-aggregation query-type &match druid-query)

       #{:+ :- :/ :*}
       (handle-expression-aggregation query-type &match druid-query)

       _
       (handle-aggregation query-type &match druid-query)))
   druid-query
   aggregations))


;;; ------------------------------------------------ handle-breakout -------------------------------------------------

(defmulti ^:private ->dimension-rvalue
  "Format `Field` for use in a `:dimension` or `:dimensions` clause."
  {:arglists '([field-clause])}
  mbql.u/dispatch-by-clause-name-or-class)

(defn- extract:timeFormat
  "Create a time format extraction. Returns a string. See
  http://druid.io/docs/0.9.1.1/querying/dimensionspecs.html#time-format-extraction-function"
  [format-str]
  {:pre [(string? format-str)]}
  {:type     :timeFormat
   :format   format-str
   :timeZone (or (get-in *query* [:settings :report-timezone])
                 "UTC")
   :locale   "en-US"})

(defn- extract:js
  "Create an extraction function from JavaScript -- see
  http://druid.io/docs/0.9.1.1/querying/dimensionspecs.html#javascript-extraction-function"
  [& function-str-parts]
  {:pre [(every? string? function-str-parts)]}
  {:type     :javascript
   :function (str/replace (apply str function-str-parts) #"\s+" " ")})

;; don't try to make this a ^:const map -- extract:timeFormat looks up timezone info at query time
(defn- unit->extraction-fn [unit]
  (case unit
    :default         (extract:timeFormat "yyyy-MM-dd'T'HH:mm:ssZZ")
    :minute          (extract:timeFormat "yyyy-MM-dd'T'HH:mm:00ZZ")
    :minute-of-hour  (extract:timeFormat "mm")
    :hour            (extract:timeFormat "yyyy-MM-dd'T'HH:00:00ZZ")
    :hour-of-day     (extract:timeFormat "HH")
    :day             (extract:timeFormat "yyyy-MM-dd'T'00:00:00ZZ")
    :day-of-week     (extract:js "function (timestamp) {"
                                 "  var date = new Date(timestamp);"
                                 "  return date.getDay() + 1;"
                                 "}")
    :day-of-month    (extract:timeFormat "dd")
    :day-of-year     (extract:timeFormat "DDD")
    :week            (extract:js "function (timestamp) {"
                                 "  var date     = new Date(timestamp);"
                                 "  var firstDOW = new Date(date - (date.getDay() * 86400000));"
                                 "  var month    = firstDOW.getMonth() + 1;"
                                 "  var day      = firstDOW.getDate();"
                                 "  return '' + firstDOW.getFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;"
                                 "}")
    :week-of-year    (extract:timeFormat "ww")
    :month           (extract:timeFormat "yyyy-MM-01")
    :month-of-year   (extract:timeFormat "MM")
    :quarter         (extract:js "function (timestamp) {"
                                 "  var date         = new Date(timestamp);"
                                 "  var month        = date.getMonth() + 1;" ; js months are 0 - 11
                                 "  var quarterMonth = month - ((month - 1) % 3);"
                                 "  return '' + date.getFullYear() + '-' + (quarterMonth < 10 ? '0' : '') + quarterMonth + '-01';"
                                 "}")
    :quarter-of-year (extract:js "function (timestamp) {"
                                 "  var date = new Date(timestamp);"
                                 "  return Math.floor((date.getMonth() + 3) / 3);"
                                 "}")
    :year            (extract:timeFormat "yyyy-01-01")))

(defn- unit->granularity
  [unit]
  (merge {:type     "period"
          :period   (case unit
                      :minute  "PT1M"
                      :hour    "PT1H"
                      :day     "P1D"
                      :week    "P1W"
                      :month   "P1M"
                      :quarter "P3M"
                      :year    "P1Y")
          :timeZone (qp.timezone/results-timezone-id)}
         ;; Druid uses Monday for the start of its weekly calculations. Metabase uses Sundays. When grouping by week,
         ;; the origin keypair will use the date specified as it's start of the week. The below date is the first
         ;; Sunday after Epoch. The date itself isn't significant, it just uses it to figure out what day it should
         ;; start from.
         (when (= :week unit)
           {:origin "1970-01-04T00:00:00Z"})))

(def ^:private units-that-need-post-processing-int-parsing
  "`extract:timeFormat` always returns a string; there are cases where we'd like to return an integer tead, such as
  `:day-of-month`. There's no simple way to do this in Druid -- Druid 0.9.0+ *does* let you combine extraction
  functions with `:cascade`, but we're still supporting 0.8.x. Instead, we will perform the conversions in
  Clojure-land during post-processing. If we need to perform the extra post-processing step, we'll name the resulting
  column `:timestamp___int`; otherwise we'll keep the name `:timestamp`."
  #{:minute-of-hour
    :hour-of-day
    :day-of-week
    :day-of-month
    :day-of-year
    :week-of-year
    :month-of-year
    :quarter-of-year})

(defmethod ->dimension-rvalue nil
  [_]
  (->rvalue nil))

(defmethod ->dimension-rvalue Object
  [this]
  (->rvalue this))

(defmethod ->dimension-rvalue :field-id
  [this]
  (->rvalue this))

(defmethod ->dimension-rvalue :datetime-field
  [[_ _ unit]]
  {:type         :extraction
   :dimension    :__time
   ;; :timestamp is a special case, and we need to do an 'extraction' agat the secret special value :__time to get
   ;; at it
   :outputName   (if (contains? units-that-need-post-processing-int-parsing unit)
                   :timestamp___int
                   :timestamp)
   :extractionFn (unit->extraction-fn unit)})


(defmulti ^:private handle-breakout
  {:arglists '([query-type original-query druid-query])}
  query-type-dispatch-fn)

;; only topN , grouped-timeseries & groupBy handle breakouts
(defmethod handle-breakout ::query
  [_ _ druid-query]
  druid-query)

(defmethod handle-breakout ::grouped-timeseries
  [_ {[breakout-field] :breakout} druid-query]
  (assoc-in druid-query [:query :granularity] (unit->granularity (:unit breakout-field))))

(defn- field-clause->name
  [field-clause]
  (when field-clause
    (let [id (mbql.u/field-clause->id-or-literal field-clause)]
      (if (integer? id)
        (:name (qp.store/field id))
        id))))

(defmethod handle-breakout ::topN
  [_ {[breakout-field] :breakout} druid-query]
  (let [dim-rvalue (->dimension-rvalue breakout-field)]
    (-> druid-query
        (update :projections conj (keyword (if (and (map? dim-rvalue)
                                                    (contains? dim-rvalue :outputName))
                                             (:outputName dim-rvalue)
                                             (field-clause->name breakout-field))))
        (assoc-in [:query :dimension] dim-rvalue))))

(defmethod handle-breakout ::groupBy
  [_ {breakout-fields :breakout} druid-query]
  (-> druid-query
      (update :projections into (for [breakout-field breakout-fields]
                                  (let [dim-rvalue (->dimension-rvalue breakout-field)]
                                    (keyword
                                     (if (and (map? dim-rvalue)
                                              (contains? dim-rvalue :outputName))
                                       (:outputName dim-rvalue)
                                       (field-clause->name breakout-field))))))
      (assoc-in [:query :dimensions] (mapv ->dimension-rvalue breakout-fields))))


;;; ------------------------------------------------ handle-order-by -------------------------------------------------

(defmulti ^:private handle-order-by
  {:arglists '([query-type original-query druid-query])}
  query-type-dispatch-fn)

(defmethod handle-order-by ::query
  [_ _ druid-query]
  (log/warn
   (u/format-color 'red
       (tru "Sorting with Druid is only allowed in queries that have one or more breakout columns. Ignoring :order-by clause.")))
  druid-query)


(defmethod handle-order-by ::topN
  [_ {[ag] :aggregation, [breakout-field] :breakout, [[direction field]] :order-by} druid-query]
  (let [field             (->rvalue field)
        breakout-field    (->rvalue breakout-field)
        sort-by-breakout? (= field breakout-field)
        ag-field          (mbql.u/match-one ag
                            :distinct
                            :distinct___count

                            [:aggregation-options _ (options :guard :name)]
                            (:name options)

                            [:aggregation-options wrapped-ag _]
                            (recur wrapped-ag)

                            [(ag-type :guard keyword?) & _]
                            ag-type)]
    (when-not sort-by-breakout?
      (assert ag-field))
    (assoc-in druid-query [:query :metric] (match [sort-by-breakout? direction]
                                               [true  :asc]  {:type :alphaNumeric}
                                               [true  :desc] {:type :inverted, :metric {:type :alphaNumeric}}
                                               [false :asc]  {:type :inverted, :metric ag-field}
                                               [false :desc] ag-field))))

(defmethod handle-order-by ::groupBy
  [_ {:keys [order-by]} druid-query]
  (assoc-in druid-query [:query :limitSpec :columns] (vec (for [[direction field] order-by]
                                                              {:dimension (->rvalue field)
                                                               :direction (case direction
                                                                            :desc :descending
                                                                            :asc  :ascending)}))))
(defn- datetime-field?
  "Similar to `types/temporal-field?` but works on field ids wrapped in a datetime or on fields that happen to be a
  datetime"
  [field]
  (when field
    (or (mbql.u/is-clause? :datetime-field field)
        (types/temporal-field? (qp.store/field (second field))))))

;; Handle order by timstamp field
(defmethod handle-order-by ::grouped-timeseries
  [_ {[[direction field]] :order-by} druid-query]
  (let [can-sort? (if (datetime-field? field)
                    true
                    (log/warn (trs "grouped timeseries queries can only be sorted by the ''timestamp'' column.")))]
    (cond-> druid-query
      can-sort? (assoc-in [:query :descending] (= direction :desc)))))

(defmethod handle-order-by ::scan
  [_ {[[direction field]] :order-by, fields :fields} druid-query]
  (let [can-sort? (cond
                    (not (some datetime-field? fields))
                    (log/warn (trs "scan queries can only be sorted if they include the ''timestamp'' column."))

                    (not (datetime-field? field))
                    (log/warn (trs "scan queries can only be sorted by the ''timestamp'' column."))

                    :else
                    true)]
    (cond-> druid-query
      can-sort? (assoc-in [:query :order] (case direction
                                            :desc :descending
                                            :asc  :ascending)))))


;;; ------------------------------------------------- handle-fields --------------------------------------------------

(defmulti ^:private handle-fields
  {:arglists '([query-type original-query druid-query])}
  query-type-dispatch-fn)

(defmethod handle-fields ::query
  [_ {fields :fields} druid-query]
  (when fields
    (log/warn
     (u/format-color 'red
         ;; TODO - this is not really true, is it
         (tru "WARNING: It only makes sense to specify :fields for a query with no aggregation. Ignoring the clause."))))
  druid-query)

(defmethod handle-fields ::scan
  [_ {fields :fields} druid-query]
  (transduce
   identity
   (fn
     ([druid-query]
      ;; If you specify nil or empty `:columns` Druid will just return all of the ones available. In cases where
      ;; we don't want anything to be returned in one or the other, we'll ask for a `:___dummy` column intead.
      ;; Druid happily returns `nil` for the column in every row, and it will get auto-filtered out of the results
      ;; so the User will never see it.
      (update-in druid-query [:query :columns] #(or (seq %) [:___dummy])))

     ([druid-query field]
      (if (and (datetime-field? field)
               (= (keyword (field-clause->name field)) :timestamp))
        (-> druid-query
            (update :projections conj :timestamp)
            (update-in [:query :columns] conj :__time))
        (-> druid-query
            (update :projections conj (keyword (field-clause->name field)))
            (update-in [:query :columns] conj (->rvalue field))))))
   druid-query
   fields))


;;; -------------------------------------------------- handle-limit --------------------------------------------------

(defmulti ^:private handle-limit
  {:arglists '([query-type original-query druid-query])}
  query-type-dispatch-fn)

(defmethod handle-limit ::scan
  [_ {limit :limit} druid-query]
  (if-not limit
    druid-query
    (assoc-in druid-query [:query :limit] limit)))

(defmethod handle-limit ::timeseries
  [_ {limit :limit} druid-query]
  (when limit
    (log/warn
     (u/format-color 'red
         (tru "WARNING: Druid does not allow limitSpec in time series queries. Ignoring the LIMIT clause."))))
  druid-query)

(defmethod handle-limit ::topN
  [_ {limit :limit} druid-query]
  (if-not limit
    druid-query
    (assoc-in druid-query [:query :threshold] limit)))

(defmethod handle-limit ::groupBy
  [_ {limit :limit} druid-query]
  (if-not limit
    (-> druid-query
        (assoc-in [:query :limitSpec :type]  :default))
    (-> druid-query
        (assoc-in [:query :limitSpec :type]  :default)
        (assoc-in [:query :limitSpec :limit] limit))))


;;; -------------------------------------------------- handle-page ---------------------------------------------------

;; TODO - no real way to implement this DB side, probably have to do Clojure-side w/ `take`/`drop`

(defmulti ^:private handle-page
  {:arglists '([query-type original-query druid-query])}
  query-type-dispatch-fn)

(defmethod handle-page ::query
  [_ {page-clause :page} druid-query]
  (when page-clause
    (log/warn (u/format-color 'red "WARNING: 'page' is not yet implemented.")))
  druid-query)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Build + Log + Process Query                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^:const timeseries-units #{:minute :hour :day :week :month :quarter :year})

(defn- druid-query-type
  "What type of Druid query type should we perform?"
  [{breakout-fields :breakout, [[ag-type]] :aggregation, limit :limit}]
  (let [breakouts (condp = (count breakout-fields)
                    0 :none
                    1 :one
                      :many)
        agg?      (boolean ag-type)
        ts?       (and (mbql.u/is-clause? :datetime-field (first breakout-fields))  ; Checks whether the query is a timeseries
                       (contains? timeseries-units (:unit (first breakout-fields))) ; (excludes x-of-y type breakouts)
                       (nil? limit))]                                               ; (excludes queries with LIMIT)
    (match [breakouts agg? ts?]
      [:none  false    _] ::scan
      [:none  true     _] ::total
      [:one   _     true] ::grouped-timeseries
      [:one   _    false] ::topN
      [:many  _        _] ::groupBy)))

(defn- build-druid-query
  [original-query]
  {:pre [(map? original-query)]}
  (let [query-type (druid-query-type original-query)]
    (reduce (fn [druid-query f]
              (f query-type original-query druid-query))
            {:projections [], :query (query-type->default-query query-type), :query-type query-type, :mbql? true}
            [handle-source-table
             handle-breakout
             handle-aggregations
             handle-filter
             handle-order-by
             handle-fields
             handle-limit
             handle-page])))

(defn mbql->native
  "Transpile an MBQL (inner) query into a native form suitable for a Druid DB."
  [query]
  ;; Merge `:settings` into the inner query dict so the QP has access to it
  (let [query (assoc (:query query) :settings (:settings query))]
    (binding [*query*                           query
              *query-unique-identifier-counter* (atom 0)]
      (try
        (build-druid-query query)
        (catch Throwable e
          (throw (ex-info (tru "Error generating Druid query")
                          {:type         qp.error-type/driver
                           :source-query query}
                          e)))))))
