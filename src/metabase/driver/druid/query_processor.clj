(ns metabase.driver.druid.query-processor
  (:require [cheshire.core :as json]
            [clojure.core.match :refer [match]]
            [clojure.math.numeric-tower :as math]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.driver.druid.js :as js]
            [metabase.query-processor
             [annotate :as annotate]
             [interface :as i]]
            [metabase.util :as u])
  (:import [metabase.query_processor.interface AgFieldRef DateTimeField DateTimeValue Expression Field RelativeDateTimeValue Value]))

(def ^:private ^:const topN-max-results
  "Maximum number of rows the topN query in Druid should return. Huge values cause significant issues with the engine.

   Coming from the default value hardcoded in the Druid engine itself
   http://druid.io/docs/latest/querying/topnquery.html"
  1000)

;;             +-----> ::select      +----> :groupBy
;; ::query ----|                     |
;;             +----> ::ag-query ----+----> ::topN
;;                                   |                       +----> total
;;                                   +----> ::timeseries ----|
;;                                                           +----> grouped-timeseries

(derive ::select             ::query)
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

(defn- get-timezone-id [] (or (get-in *query* [:settings :report-timezone]) "UTC"))

(defn- query-type-dispatch-fn [query-type & _] query-type)

(defprotocol ^:private IRValue
  (^:private ->rvalue [this]))

(extend-protocol IRValue
  nil                   (->rvalue [_] nil)
  Object                (->rvalue [this] this)
  AgFieldRef            (->rvalue [{index :index}] (let [ag      (nth (:aggregation *query*) index)
                                                         ag-type (or (:aggregation-type ag)
                                                                     (throw (Exception. "Unknown aggregation type!")))]
                                                     (if (= ag-type :distinct)
                                                       :distinct___count
                                                       ag-type)))
  Field                 (->rvalue [this] (:field-name this))
  DateTimeField         (->rvalue [this] (->rvalue (:field this)))
  Value                 (->rvalue [this] (:value this))
  DateTimeValue         (->rvalue [{{unit :unit} :field, value :value}] (u/date->iso-8601 (u/date-trunc unit value (get-timezone-id))))
  RelativeDateTimeValue (->rvalue [{:keys [unit amount]}] (u/date->iso-8601 (u/date-trunc unit (u/relative-date unit amount) (get-timezone-id)))))

(defprotocol ^:private IDimensionOrMetric
  (^:private dimension-or-metric? [this]
   "Is this `Field`/`DateTimeField` a `:dimension` or `:metric`?"))

(extend-protocol IDimensionOrMetric
  Field         (dimension-or-metric? [{:keys [base-type]}]
                  (cond
                    (isa? base-type :type/Text)    :dimension
                    (isa? base-type :type/Float)   :metric
                    (isa? base-type :type/Integer) :metric))

  DateTimeField (dimension-or-metric? [this]
                  (dimension-or-metric? (:field this))))


(def ^:private ^:const query-type->default-query
  (let [defaults {:intervals   ["1900-01-01/2100-01-01"]
                  :granularity :all
                  :context     {:timeout 60000}}]
    {::select             (merge defaults {:queryType  :select
                                           :pagingSpec {:threshold i/absolute-max-results}})
     ::total              (merge defaults {:queryType :timeseries})
     ::grouped-timeseries (merge defaults {:queryType :timeseries})
     ::topN               (merge defaults {:queryType :topN
                                           :threshold topN-max-results})
     ::groupBy            (merge defaults {:queryType :groupBy})}))




;;; ### handle-source-table

(defn- handle-source-table [_ {{source-table-name :name} :source-table} druid-query]
  {:pre [(or (string? source-table-name)
             (keyword? source-table-name))]}
  (assoc druid-query :dataSource source-table-name))


;;; ### handle-aggregation

(declare filter:not filter:nil?)

(defn- field? [arg]
  (or (instance? Field arg)
      (instance? DateTimeField arg)))

(defn- expression->field-names [{:keys [args]}]
  {:post [(every? u/string-or-keyword? %)]}
  (flatten (for [arg   args
                 :when (or (field? arg)
                           (instance? Expression arg))]
             (cond
               (instance? Expression arg) (expression->field-names arg)
               (field? arg)               (->rvalue arg)))))

(defn- expression-arg->js [arg default-value]
  (if-not (field? arg)
    arg
    (js/or (js/parse-float (->rvalue arg))
           default-value)))

(defn- expression->js [{:keys [operator args]} default-value]
  (apply (case operator
           :+ js/+
           :- js/-
           :* js/*
           :/ js//)
         (for [arg args]
           (expression-arg->js arg default-value))))

(defn- ag:doubleSum:expression [{operator :operator,  :as expression} output-name]
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

(defn- ag:doubleSum [field output-name]
  (if (instance? Expression field)
    (ag:doubleSum:expression field output-name)
    ;; metrics can use the built-in :doubleSum aggregator, but for dimensions we have to roll something that does the same thing in JS
    (case (dimension-or-metric? field)
      :metric    {:type      :doubleSum
                  :name      output-name
                  :fieldName (->rvalue field)}
      :dimension {:type        :javascript
                  :name        output-name
                  :fieldNames  [(->rvalue field)]
                  :fnReset     "function() { return 0 ; }"
                  :fnAggregate "function(current, x) { return current + (parseFloat(x) || 0); }"
                  :fnCombine   "function(x, y) { return x + y; }"})))

(defn- ag:doubleMin:expression [expression output-name]
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

(defn- ag:doubleMin [field output-name]
  (if (instance? Expression field)
    (ag:doubleMin:expression field output-name)
    (case (dimension-or-metric? field)
      :metric    {:type      :doubleMin
                  :name      output-name
                  :fieldName (->rvalue field)}
      :dimension {:type        :javascript
                  :name        output-name
                  :fieldNames  [(->rvalue field)]
                  :fnReset     "function() { return Number.MAX_VALUE ; }"
                  :fnAggregate "function(current, x) { return Math.min(current, (parseFloat(x) || Number.MAX_VALUE)); }"
                  :fnCombine   "function(x, y) { return Math.min(x, y); }"})))

(defn- ag:doubleMax:expression [expression output-name]
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

(defn- ag:doubleMax [field output-name]
  (if (instance? Expression field)
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

(defn- ag:filtered  [filtr aggregator] {:type :filtered, :filter filtr, :aggregator aggregator})

(defn- ag:count
  ([output-name]       {:type :count, :name output-name})
  ([field output-name] (ag:filtered (filter:not (filter:nil? field))
                                    (ag:count output-name))))


(defn- handle-aggregation [query-type {ag-type :aggregation-type, ag-field :field, output-name :output-name, custom-name :custom-name, :as ag} druid-query]
  (let [output-name (or custom-name output-name)]
    (when (isa? query-type ::ag-query)
      (merge-with concat
        druid-query
        (let [ag-type (when-not (= ag-type :rows) ag-type)]
          (match [ag-type ag-field]
            ;; For 'distinct values' queries (queries with a breakout by no aggregation) just aggregate by count, but name it :___count so it gets discarded automatically
            [nil     nil] {:aggregations [(ag:count (or output-name :___count))]}

            [:count  nil] {:aggregations [(ag:count (or output-name :count))]}

            [:count    _] {:aggregations [(ag:count ag-field (or output-name :count))]}

            [:avg      _] (let [count-name (name (gensym "___count_"))
                                sum-name   (name (gensym "___sum_"))]
                            {:aggregations     [(ag:count ag-field count-name)
                                                (ag:doubleSum ag-field sum-name)]
                             :postAggregations [{:type   :arithmetic
                                                 :name   (or output-name :avg)
                                                 :fn     :/
                                                 :fields [{:type :fieldAccess, :fieldName sum-name}
                                                          {:type :fieldAccess, :fieldName count-name}]}]})
            [:distinct _] {:aggregations [{:type       :cardinality
                                           :name       (or output-name :distinct___count)
                                           :fieldNames [(->rvalue ag-field)]}]}
            [:sum      _] {:aggregations [(ag:doubleSum ag-field (or output-name :sum))]}
            [:min      _] {:aggregations [(ag:doubleMin ag-field (or output-name :min))]}
            [:max      _] {:aggregations [(ag:doubleMax ag-field (or output-name :max))]}))))))

(defn- add-expression-aggregation-output-names [args]
  (for [arg args]
    (cond
      (number? arg)              arg
      (:aggregation-type arg)    (assoc arg :output-name (or (:output-name arg)
                                                             (name (gensym (str "___" (name (:aggregation-type arg)) "_")))))
      (instance? Expression arg) (update arg :args add-expression-aggregation-output-names))))

(defn- expression-post-aggregation [{:keys [operator args], :as expression}]
  {:type   :arithmetic
   :name   (annotate/aggregation-name expression)
   :fn     operator
   :fields (for [arg args]
             (cond
               (number? arg)              {:type :constant, :name (str arg), :value arg}
               (:output-name arg)         {:type :fieldAccess, :fieldName (:output-name arg)}
               (instance? Expression arg) (expression-post-aggregation arg)))})

(declare handle-aggregations)

(defn- expression->actual-ags
  "Return a flattened list of actual aggregations that are needed for EXPRESSION."
  [expression]
  (apply concat (for [arg   (:args expression)
                      :when (not (number? arg))]
                  (if (instance? Expression arg)
                    (expression->actual-ags arg)
                    [arg]))))

(defn- handle-expression-aggregation [query-type {:keys [operator args], :as expression} druid-query]
  ;; filter out constants from the args list
  (let [expression  (update expression :args add-expression-aggregation-output-names)
        ags         (expression->actual-ags expression)
        druid-query (handle-aggregations query-type {:aggregation ags} druid-query)]
    (merge-with concat
      druid-query
      {:postAggregations [(expression-post-aggregation expression)]})))

(defn- handle-aggregations [query-type {aggregations :aggregation} druid-query]
  (loop [[ag & more] aggregations, query druid-query]
    (if (instance? Expression ag)
      (handle-expression-aggregation query-type ag druid-query)
      (let [query (handle-aggregation query-type ag query)]
        (if-not (seq more)
          query
          (recur more query))))))


;;; ### handle-breakout

(defprotocol ^:private IDimension
  (^:private ->dimension-rvalue [this]
   "Format `Field` for use in a `:dimension` or `:dimensions` clause."))

(defn- extract:timeFormat
  "Create a time format extraction. Returns a string. See http://druid.io/docs/0.9.1.1/querying/dimensionspecs.html#time-format-extraction-function"
  [format-str]
  {:pre [(string? format-str)]}
  {:type     :timeFormat
   :format   format-str
   :timeZone (or (get-in *query* [:settings :report-timezone])
                 "UTC")
   :locale   "en-US"})

(defn- extract:js
  "Create an extraction function from JavaScript -- see http://druid.io/docs/0.9.1.1/querying/dimensionspecs.html#javascript-extraction-function"
  [& function-str-parts]
  {:pre [(every? string? function-str-parts)]}
  {:type     :javascript
   :function (s/replace (apply str function-str-parts) #"\s+" " ")})

;; don't try to make this a ^:const map -- extract:timeFormat looks up timezone info at query time
(defn- unit->extraction-fn [unit]
  (case unit
    :default         (extract:timeFormat "yyyy-MM-dd'T'HH:mm:ssZZ")
    :minute          (extract:timeFormat "yyyy-MM-dd'T'HH:mm:00ZZ")
    :minute-of-hour  (extract:timeFormat "mm")
    :hour            (extract:timeFormat "yyyy-MM-dd'T'HH:00:00ZZ")
    :hour-of-day     (extract:timeFormat "HH")
    :day             (extract:timeFormat "yyyy-MM-ddZZ")
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
    :year            (extract:timeFormat "yyyy")))

(defn- unit->granularity [unit]
  {:type     "period"
   :period   (case unit
               :minute  "PT1M"
               :hour    "PT1H"
               :day     "P1D"
               :week    "P1W"
               :month   "P1M"
               :quarter "P3M"
               :year    "P1Y")
   :timeZone (get-timezone-id)})

(def ^:private ^:const units-that-need-post-processing-int-parsing
  "`extract:timeFormat` always returns a string; there are cases where we'd like to return an integer instead, such as `:day-of-month`.
   There's no simple way to do this in Druid -- Druid 0.9.0+ *does* let you combine extraction functions with `:cascade`, but we're still supporting 0.8.x.
   Instead, we will perform the conversions in Clojure-land during post-processing. If we need to perform the extra post-processing step, we'll name the resulting
   column `:timestamp___int`; otherwise we'll keep the name `:timestamp`."
  #{:minute-of-hour
    :hour-of-day
    :day-of-week
    :day-of-month
    :day-of-year
    :week-of-year
    :month-of-year
    :quarter-of-year
    :year})

(extend-protocol IDimension
  nil    (->dimension-rvalue [this] (->rvalue this))
  Object (->dimension-rvalue [this] (->rvalue this))
  ;; :timestamp is a special case, and we need to do an 'extraction' against the secret special value :__time to get at it
  DateTimeField
  (->dimension-rvalue [{:keys [unit]}]
    {:type         :extraction
     :dimension    :__time
     :outputName   (if (contains? units-that-need-post-processing-int-parsing unit)
                     :timestamp___int
                     :timestamp)
     :extractionFn (unit->extraction-fn unit)}))

(defmulti ^:private handle-breakout query-type-dispatch-fn)

(defmethod handle-breakout ::query [_ _ _]) ; only topN , grouped-timeseries & groupBy handle breakouts

(defmethod handle-breakout ::grouped-timeseries [_ {[breakout-field] :breakout} druid-query]
  (assoc druid-query :granularity (unit->granularity (:unit breakout-field))))

(defmethod handle-breakout ::topN [_ {[breakout-field] :breakout} druid-query]
  (assoc druid-query :dimension (->dimension-rvalue breakout-field)))

(defmethod handle-breakout ::groupBy [_ {breakout-fields :breakout} druid-query]
  (assoc druid-query :dimensions (mapv ->dimension-rvalue breakout-fields)))


;;; ### handle-filter

(defn- filter:and [filters]
  {:type   :and
   :fields filters})

(defn- filter:not [filtr]
  {:pre [filtr]}
  (if (= (:type filtr) :not)     ; it looks like "two nots don't make an identity" with druid
    (:field filtr)
    {:type :not, :field filtr}))

(defn- filter:= [field value]
  {:type      :selector
   :dimension (->rvalue field)
   :value     value})

(defn- filter:nil? [field]
  (if (instance? Expression field)
    (filter:and (for [arg   (:args field)
                      :when (field? arg)]
                  (filter:nil? arg)))
    (filter:= field (case (dimension-or-metric? field)
                      :dimension nil
                      :metric    0))))

(defn- filter:js [field fn-format-str & args]
  {:pre [field (string? fn-format-str)]}
  {:type      :javascript
   :dimension (->rvalue field)
   :function  (apply format fn-format-str args)})

(defn- check-filter-fields [filter-type & fields]
  (doseq [field fields]
    (when (= (dimension-or-metric? field) :metric)
      (throw (IllegalArgumentException. (u/format-color 'red "WARNING: Filtering only works on dimensions! '%s' is a metric. Ignoring %s filter." (->rvalue field) filter-type))))))

(defn- parse-filter-subclause:filter [{:keys [filter-type field value] :as filter}]
  {:pre [filter]}
  ;; We'll handle :timestamp separately. It needs to go in :intervals instead
  (when-not (instance? DateTimeField field)
    (try (when field
           (check-filter-fields filter-type field))
         (let [value (->rvalue value)]
           (case filter-type
             :inside      (let [lat       (:lat filter)
                                lon       (:lon filter)
                                lat-field (:field lat)
                                lon-field (:field lon)]
                            (check-filter-fields :inside lat-field lon-field)
                            {:type   :and
                             :fields [(filter:js lat-field "function (x) { return x >= %s && x <= %s; }" (num (->rvalue (:min lat))) (num (->rvalue (:max lat))))
                                      (filter:js lon-field "function (x) { return x >= %s && x <= %s; }" (num (->rvalue (:min lon))) (num (->rvalue (:max lon))))]})
             :between     (let [{:keys [min-val max-val]} filter]
                            (filter:js field "function (x) { return x >= %s && x <= %s; }" (num (->rvalue (:value min-val))) (num (->rvalue (:value max-val)))))
             :is-null     (filter:nil? field)
             :not-null    (filter:not (filter:nil? field))
             :contains    {:type      :search
                           :dimension (->rvalue field)
                           :query     {:type  :insensitive_contains
                                       :value value}}
             :starts-with (filter:js field "function (x) { return typeof x === 'string' && x.length >= %d && x.slice(0, %d) === '%s'; }"
                                     (count value) (count value) (s/replace value #"'" "\\\\'"))
             :ends-with   (filter:js field "function (x) { return typeof x === 'string' && x.length >= %d && x.slice(-%d) === '%s'; }"
                                     (count value) (count value) (s/replace value #"'" "\\\\'"))
             :=           (filter:= field value)
             :!=          (filter:not (filter:= field value))
             :<           (filter:js field "function (x) { return x < %s; }"  (num value))
             :>           (filter:js field "function (x) { return x > %s; }"  (num value))
             :<=          (filter:js field "function (x) { return x <= %s; }" (num value))
             :>=          (filter:js field "function (x) { return x >= %s; }" (num value))))
         (catch Throwable e
           (log/warn (.getMessage e))))))

(defn- parse-filter-clause:filter [{:keys [compound-type subclauses subclause], :as clause}]
  {:pre [clause]}
  (case compound-type
    :and {:type :and, :fields (filterv identity (map parse-filter-clause:filter subclauses))}
    :or  {:type :or,  :fields (filterv identity (map parse-filter-clause:filter subclauses))}
    :not (when-let [subclause (parse-filter-subclause:filter subclause)]
           (filter:not subclause))
    nil  (parse-filter-subclause:filter clause)))


(defn- make-intervals
  "Make a value for the `:intervals` in a Druid query.

     ;; Return results in 2012 or 2015
     (make-intervals 2012 2013 2015 2016) -> [\"2012/2013\" \"2015/2016\"]"
  [interval-min interval-max & more]
  (vec (concat [(str (or (->rvalue interval-min) -5000) "/" (or (->rvalue interval-max) 5000))]
               (when (seq more)
                 (apply make-intervals more)))))


(defn- parse-filter-subclause:intervals [{:keys [filter-type field value] :as filter}]
  (when (instance? DateTimeField field)
    (case filter-type
      ;; BETWEEN "2015-12-09", "2015-12-11" -> ["2015-12-09/2015-12-12"], because BETWEEN is inclusive
      :between  (let [{:keys [min-val max-val]} filter]
                  (make-intervals min-val (i/add-date-time-units max-val 1)))
      ;; =  "2015-12-11" -> ["2015-12-11/2015-12-12"]
      :=        (make-intervals value (i/add-date-time-units value 1))
      ;; != "2015-12-11" -> ["-5000/2015-12-11", "2015-12-12/5000"]
      :!=       (make-intervals nil value, (i/add-date-time-units value 1) nil)
      ;; >  "2015-12-11" -> ["2015-12-12/5000"]
      :>        (make-intervals (i/add-date-time-units value 1) nil)
      ;; >= "2015-12-11" -> ["2015-12-11/5000"]
      :>=       (make-intervals value nil)
      ;; <  "2015-12-11" -> ["-5000/2015-12-11"]
      :<        (make-intervals nil value)
      ;; <= "2015-12-11" -> ["-5000/2015-12-12"]
      :<=       (make-intervals nil (i/add-date-time-units value 1))
      ;; This is technically allowed by the QL here but doesn't make sense since every Druid event has a timestamp. Just ignore it
      :is-null  (log/warn (u/format-color 'red "WARNING: timestamps can never be nil. Ignoring IS_NULL filter for timestamp."))
      ;; :timestamp is always non-nil so nothing to do here
      :not-null nil)))

(defn- parse-filter-clause:intervals [{:keys [compound-type subclauses], :as clause}]
  (if-not compound-type
    (parse-filter-subclause:intervals clause)
    (let [subclauses (filterv identity (mapcat parse-filter-clause:intervals subclauses))]
      (when (seq subclauses)
        (case compound-type
          ;; A date can't be in more than one interval, so ANDing them together doesn't really make sense. In this situation, just ignore all intervals after the first
          :and (do (when (> (count subclauses) 1)
                     (log/warn (u/format-color 'red (str "WARNING: A date can't belong to multiple discrete intervals, so ANDing them together doesn't make sense.\n"
                                                         "Ignoring these intervals: %s") (rest subclauses))))
                   [(first subclauses)])
          ;; Ok to specify multiple intervals for OR
          :or  subclauses
          ;; We should never get to this point since the all non-string negations should get automatically rewritten by the query expander.
          :not (log/warn (u/format-color 'red "WARNING: Don't know how to negate: %s" clause)))))))


(defn- handle-filter [_ {filter-clause :filter} druid-query]
  (when filter-clause
    (let [filter    (parse-filter-clause:filter    filter-clause)
          intervals (parse-filter-clause:intervals filter-clause)]
      (cond-> druid-query
        (seq filter)    (assoc :filter filter)
        (seq intervals) (assoc :intervals intervals)))))


;;; ### handle-order-by

(defmulti ^:private handle-order-by query-type-dispatch-fn)

(defmethod handle-order-by ::query [_ _ _]
  (log/warn (u/format-color 'red "Sorting with Druid is only allowed in queries that have one or more breakout columns. Ignoring :order-by clause.")))


(defmethod handle-order-by ::topN [_ {[{ag-type :aggregation-type}] :aggregation, [breakout-field] :breakout, [{field :field, direction :direction}] :order-by} druid-query]
  (let [field             (->rvalue field)
        breakout-field    (->rvalue breakout-field)
        sort-by-breakout? (= field breakout-field)
        ag-field          (if (= ag-type :distinct) :distinct___count ag-type)]
    (assoc druid-query :metric (match [sort-by-breakout? direction]
                                 [true  :ascending]  {:type :alphaNumeric}
                                 [true  :descending] {:type :inverted, :metric {:type :alphaNumeric}}
                                 [false :ascending]  {:type :inverted, :metric ag-field}
                                 [false :descending] ag-field))))

(defmethod handle-order-by ::groupBy [_ {:keys [order-by]} druid-query]
  (assoc-in druid-query [:limitSpec :columns] (vec (for [{:keys [field direction]} order-by]
                                                     {:dimension (->rvalue field)
                                                      :direction direction}))))

;; Handle order by timstamp field
(defn- handle-order-by-timestamp [field direction druid-query]
  (assoc druid-query :descending (and (instance? DateTimeField field)
                                      (= direction :descending))))

(defmethod handle-order-by ::grouped-timeseries [_ {[{field :field, direction :direction}] :order-by} druid-query]
  (handle-order-by-timestamp field direction druid-query))

(defmethod handle-order-by ::select [_ {[{field :field, direction :direction}] :order-by} druid-query]
  (handle-order-by-timestamp field direction druid-query))

;;; ### handle-fields

(defmulti ^:private handle-fields query-type-dispatch-fn)

(defmethod handle-fields ::query [_ {fields :fields} _]
  (when fields
    (log/warn (u/format-color 'red "WARNING: It only makes sense to specify :fields for a bare rows query. Ignoring the clause."))))

(defmethod handle-fields ::select [_ {fields :fields} druid-query]
  (when (seq fields)
    (loop [dimensions [], metrics [], [field & more] fields]
      (cond
        ;; If you specify nil or empty `:dimensions` or `:metrics` Druid will just return all of the ones available. In cases where we don't
        ;; want anything to be returned in one or the other, we'll ask for a `:___dummy` column instead. Druid happily returns `nil` for the
        ;; column in every row, and it will get auto-filtered out of the results so the User will never see it.
        (not field)                                 (assoc druid-query
                                                           :dimensions (or (seq dimensions) [:___dummy])
                                                           :metrics    (or (seq metrics)    [:___dummy]))
        (instance? DateTimeField field)             (recur dimensions metrics more)
        (= (dimension-or-metric? field) :dimension) (recur (conj dimensions (->rvalue field)) metrics more)
        (= (dimension-or-metric? field) :metric)    (recur dimensions (conj metrics (->rvalue field)) more)))))


;;; ### handle-limit

(defmulti ^:private handle-limit query-type-dispatch-fn)

(defmethod handle-limit ::select [_ {limit :limit} druid-query]
  (when limit
    (assoc-in druid-query [:pagingSpec :threshold] limit)))

(defmethod handle-limit ::timeseries [_ {limit :limit} _]
  (when limit
    (log/warn (u/format-color 'red "WARNING: Druid doenst allow limitSpec in timeseries queries. Ignoring the LIMIT clause."))))

(defmethod handle-limit ::topN [_ {limit :limit} druid-query]
  (when limit
    (assoc druid-query :threshold limit)))

(defmethod handle-limit ::groupBy [_ {limit :limit} druid-query]
  (when limit
    (-> druid-query
        (assoc-in [:limitSpec :type]  :default)
        (assoc-in [:limitSpec :limit] limit))))


;;; ### handle-page TODO - no real way to implement this DB side, probably have to do Clojure-side w/ `take`/`drop`

(defmulti ^:private handle-page query-type-dispatch-fn)

(defmethod handle-page ::query [_ {page-clause :page} druid-query]
  (when page-clause
    (log/warn (u/format-color 'red "WARNING: 'page' is not yet implemented."))))


;;; ## Build + Log + Process Query

(def ^:private ^:const timeseries-units
  #{:minute :hour :day :week :month :quarter :year})

(defn- druid-query-type
  "What type of Druid query type should we perform?"
  [{breakout-fields :breakout, [{ag-type :aggregation-type}] :aggregation, limit :limit}]
  (let [breakouts (condp = (count breakout-fields)
                    0 :none
                    1 :one
                      :many)
        agg?      (boolean (and ag-type (not= ag-type :rows)))
        ts?       (and (instance? DateTimeField (first breakout-fields))            ; Checks whether the query is a timeseries
                       (contains? timeseries-units (:unit (first breakout-fields))) ; (excludes x-of-y type breakouts)
                       (nil? limit))]                                               ; (excludes queries with LIMIT)
    (match [breakouts agg? ts?]
      [:none  false    _] ::select
      [:none  true     _] ::total
      [:one   _     true] ::grouped-timeseries
      [:one   _    false] ::topN
      [:many  _        _] ::groupBy)))


(defn- build-druid-query [query]
  {:pre [(map? query)]}
  (let [query-type (druid-query-type query)]
    (loop [druid-query (query-type->default-query query-type), [f & more] [handle-source-table
                                                                           handle-aggregations
                                                                           handle-breakout
                                                                           handle-filter
                                                                           handle-order-by
                                                                           handle-fields
                                                                           handle-limit
                                                                           handle-page]]
      (let [druid-query (or (f query-type query druid-query)
                            druid-query)]
        (if (seq more)
          (recur druid-query more)
          ;; Return pair of [query-type druid-query]
          [query-type druid-query])))))


;;;  ### post-processing

(defmulti ^:private post-process query-type-dispatch-fn)

(defmethod post-process ::select  [_ results] (->> results first :result :events (map :event)))
(defmethod post-process ::total   [_ results] (map :result results))
(defmethod post-process ::topN    [_ results] (-> results first :result))
(defmethod post-process ::groupBy [_ results] (map :event results))

(defmethod post-process ::timeseries [_ results]
  (for [event results]
    (conj {:timestamp (:timestamp event)} (:result event))))

(defn post-process-native
  "Post-process the results of a *native* Druid query.
   The appropriate ns-qualified query type keyword (e.g. `::select`, used for mutlimethod dispatch) is inferred from the query itself."
  [{:keys [queryType], :as query} results]
  {:pre [queryType]}
  (post-process (keyword "metabase.driver.druid.query-processor" (name queryType))
                results))


(defn- remove-bonus-keys
  "Remove keys that start with `___` from the results -- they were temporary, and we don't want to return them."
  [[first-row :as results]]
  (let [keys-to-remove (for [k     (keys first-row)
                             :when (re-find #"^___" (name k))]
                         k)]
    (if-not (seq keys-to-remove)
      results
      (for [result results]
        (apply dissoc result keys-to-remove)))))


;;; ### MBQL Processor

(defn mbql->native
  "Transpile an MBQL (inner) query into a native form suitable for a Druid DB."
  [query]
  ;; Merge `:settings` into the inner query dict so the QP has access to it
  (let [mbql-query (assoc (:query query)
                     :settings (:settings query))]
    (binding [*query* mbql-query]
      (let [[query-type druid-query] (build-druid-query mbql-query)]
        {:query      druid-query
         :query-type query-type}))))


(defn- columns->getter-fns
  "Given a sequence of COLUMNS keywords, return a sequence of appropriate getter functions to get values from a single result row. Normally,
   these are just the keyword column names themselves, but for `:timestamp___int`, we'll also parse the result as an integer (for further
   explanation, see the docstring for `units-that-need-post-processing-int-parsing`). We also round `:distinct___count` in order to return an
   integer since Druid returns the approximate floating point value for cardinality queries (See Druid documentation regarding cardinality and HLL)."
  [columns]
  (vec (for [k columns]
         (case k
            :distinct___count (comp math/round k)
            :timestamp___int  (comp (fn [^String s]
                                      (when (seq s)
                                        (Integer/parseInt s)))
                                    k)
            k))))

(defn execute-query
  "Execute a query for a Druid DB."
  [do-query {database :database, {:keys [query query-type mbql?]} :native}]
  {:pre [database query]}
  (let [details    (:details database)
        query      (if (string? query)
                     (json/parse-string query keyword)
                     query)
        query-type (or query-type (keyword "metabase.driver.druid.query-processor" (name (:queryType query))))
        results    (->> (do-query details query)
                        (post-process query-type)
                        remove-bonus-keys)
        columns    (keys (first results))
        getters    (columns->getter-fns columns)]
    ;; rename any occurances of `:timestamp___int` to `:timestamp` in the results so the user doesn't know about our behind-the-scenes conversion
    ;; and apply any other post-processing on the value such as parsing some units to int and rounding up approximate cardinality values.
    {:columns   (vec (replace {:timestamp___int :timestamp :distinct___count :count} columns))
     :rows      (for [row results]
                  (for [getter getters]
                    (getter row)))
     :annotate? mbql?}))
