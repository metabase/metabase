(ns metabase.driver.druid.query-processor
  (:require [cheshire.core :as json]
            [clj-time
             [coerce :as tcoerce]
             [core :as time]
             [format :as tformat]]
            [clojure.core.match :refer [match]]
            [clojure.math.numeric-tower :as math]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.driver.druid.js :as js]
            [metabase.query-processor
             [annotate :as annotate]
             [interface :as i]]
            [metabase.util :as u]
            [metabase.util.date :as du])
  (:import java.util.TimeZone
           [metabase.query_processor.interface AgFieldRef DateTimeField DateTimeValue Expression Field
            RelativeDateTimeValue Value]
           org.joda.time.DateTimeZone))

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
  DateTimeValue         (->rvalue [{{unit :unit} :field, value :value}] (du/date->iso-8601 (du/date-trunc unit value (get-timezone-id))))
  RelativeDateTimeValue (->rvalue [{:keys [unit amount]}] (du/date->iso-8601 (du/date-trunc unit (du/relative-date unit amount) (get-timezone-id)))))

(defprotocol ^:private IDimensionOrMetric
  (^:private dimension-or-metric? [this]
   "Is this `Field`/`DateTimeField` a `:dimension` or `:metric`?"))

(extend-protocol IDimensionOrMetric
  Field         (dimension-or-metric? [{:keys [base-type]}]
                  (cond
                    (isa? base-type :type/Text)             :dimension
                    (isa? base-type :type/Float)            :metric
                    (isa? base-type :type/Integer)          :metric
                    (isa? base-type :type/DruidHyperUnique) :metric))

  DateTimeField (dimension-or-metric? [this]
                  (dimension-or-metric? (:field this))))


(def ^:private ^:const query-type->default-query
  (let [defaults {:intervals   ["1900-01-01/2100-01-01"]
                  :granularity :all
                  :context     {:timeout 60000
                                :queryId (str (java.util.UUID/randomUUID))}}]
    {::select             (merge defaults {:queryType  :select
                                           :pagingSpec {:threshold i/absolute-max-results}})
     ::total              (merge defaults {:queryType :timeseries})
     ::grouped-timeseries (merge defaults {:queryType :timeseries})
     ::topN               (merge defaults {:queryType :topN
                                           :threshold topN-max-results})
     ::groupBy            (merge defaults {:queryType :groupBy})}))




;;; ### handle-source-table

(defn- handle-source-table [_ {{source-table-name :name} :source-table} query-context]
  {:pre [(or (string? source-table-name)
             (keyword? source-table-name))]}
  (assoc-in query-context [:query :dataSource] source-table-name))


;;; ### handle-aggregation

(declare filter:not filter:nil?)

(defn- field? [arg]
  (or (instance? Field arg)
      (instance? DateTimeField arg)))

(defn- expression->field-names [{:keys [args]}]
  {:post [(every? (some-fn keyword? string?) %)]}
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
    ;; metrics can use the built-in :doubleSum aggregator, but for dimensions we have to roll something that does the
    ;; same thing in JS
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

(defn- ag:distinct [field output-name]
  (if (isa? (:base-type field) :type/DruidHyperUnique)
    {:type      :hyperUnique
     :name      output-name
     :fieldName (->rvalue field)}
    {:type       :cardinality
     :name       output-name
     :fieldNames [(->rvalue field)]}))

(defn- ag:count
  ([output-name]       {:type :count, :name output-name})
  ([field output-name] (ag:filtered (filter:not (filter:nil? field))
                                    (ag:count output-name))))

(defn- create-aggregation-clause [output-name ag-type ag-field]
  (let [output-name-kwd (keyword output-name)]
    (match [ag-type ag-field]
      ;; For 'distinct values' queries (queries with a breakout by no aggregation) just aggregate by count, but name
      ;; it :___count so it gets discarded automatically
      [nil     nil] [[(or output-name-kwd :___count)] {:aggregations [(ag:count (or output-name :___count))]}]

      [:count  nil] [[(or output-name-kwd :count)] {:aggregations [(ag:count (or output-name :count))]}]

      [:count    _] [[(or output-name-kwd :count)] {:aggregations [(ag:count ag-field (or output-name :count))]}]

      [:avg      _] (let [count-name (name (gensym "___count_"))
                          sum-name   (name (gensym "___sum_"))]
                      [[(keyword count-name) (keyword sum-name) (or output-name-kwd :avg)]
                       {:aggregations     [(ag:count ag-field count-name)
                                           (ag:doubleSum ag-field sum-name)]
                        :postAggregations [{:type   :arithmetic
                                            :name   (or output-name :avg)
                                            :fn     :/
                                            :fields [{:type :fieldAccess, :fieldName sum-name}
                                                     {:type :fieldAccess, :fieldName count-name}]}]}])
      [:distinct _] [[(or output-name-kwd :distinct___count)]
                     {:aggregations [(ag:distinct ag-field (or output-name :distinct___count))]}]
      [:sum      _] [[(or output-name-kwd :sum)] {:aggregations [(ag:doubleSum ag-field (or output-name :sum))]}]
      [:min      _] [[(or output-name-kwd :min)] {:aggregations [(ag:doubleMin ag-field (or output-name :min))]}]
      [:max      _] [[(or output-name-kwd :max)] {:aggregations [(ag:doubleMax ag-field (or output-name :max))]}])))

(defn- handle-aggregation
  [query-type
   {ag-type :aggregation-type, ag-field :field, output-name :output-name, custom-name :custom-name, :as ag}
   query-context]
  (let [output-name (or custom-name output-name)]
    (if-not (isa? query-type ::ag-query)
      query-context
      (let [ag-type (when-not (= ag-type :rows) ag-type)
            [projections ag-clauses] (create-aggregation-clause output-name ag-type ag-field)]
        (-> query-context
            (update :projections #(vec (concat % projections)))
            (update :query #(merge-with concat % ag-clauses)))))))

(defn- add-expression-aggregation-output-names [args]
  (for [arg args]
    (cond
      (number? arg)
      arg

      (:aggregation-type arg)
      (assoc arg :output-name (or (:output-name arg)
                                  (name (gensym (str "___" (name (:aggregation-type arg)) "_")))))

      (instance? Expression arg)
      (update arg :args add-expression-aggregation-output-names))))

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

(defn- handle-expression-aggregation [query-type {:keys [operator args], :as expression} query-context]
  ;; filter out constants from the args list
  (let [expression    (update expression :args add-expression-aggregation-output-names)
        ags           (expression->actual-ags expression)
        query-context (handle-aggregations query-type {:aggregation ags} query-context)
        post-agg      (expression-post-aggregation expression)]
    (-> query-context
        (update :projections conj (keyword (:name post-agg)))
        (update :query #(merge-with concat % {:postAggregations [post-agg]})))))

(defn- handle-aggregations [query-type {aggregations :aggregation} query-context]
  (loop [[ag & more] aggregations, query query-context]
    (if (instance? Expression ag)
      (handle-expression-aggregation query-type ag query-context)
      (let [query (handle-aggregation query-type ag query)]
        (if-not (seq more)
          query
          (recur more query))))))


;;; ### handle-breakout

(defprotocol ^:private IDimension
  (^:private ->dimension-rvalue [this]
   "Format `Field` for use in a `:dimension` or `:dimensions` clause."))

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
  (conj {:type     "period"
         :period   (case unit
                     :minute  "PT1M"
                     :hour    "PT1H"
                     :day     "P1D"
                     :week    "P1W"
                     :month   "P1M"
                     :quarter "P3M"
                     :year    "P1Y")
         :timeZone (get-timezone-id)}
        ;; Druid uses Monday for the start of its weekly calculations. Metabase uses Sundays. When grouping by week,
        ;; the origin keypair will use the date specified as it's start of the week. The below date is the first
        ;; Sunday after Epoch. The date itself isn't significant, it just uses it to figure out what day it should
        ;; start from.
        (when (= :week unit)
          {:origin "1970-01-04T00:00:00Z"})))

(def ^:private ^:const units-that-need-post-processing-int-parsing
  "`extract:timeFormat` always returns a string; there are cases where we'd like to return an integer instead, such as
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
    :quarter-of-year
    :year})

(extend-protocol IDimension
  nil    (->dimension-rvalue [this] (->rvalue this))
  Object (->dimension-rvalue [this] (->rvalue this))
  ;; :timestamp is a special case, and we need to do an 'extraction' against the secret special value :__time to get
  ;; at it
  DateTimeField
  (->dimension-rvalue [{:keys [unit]}]
    {:type         :extraction
     :dimension    :__time
     :outputName   (if (contains? units-that-need-post-processing-int-parsing unit)
                     :timestamp___int
                     :timestamp)
     :extractionFn (unit->extraction-fn unit)}))

(defmulti ^:private handle-breakout query-type-dispatch-fn)

(defmethod handle-breakout ::query [_ _ query-context] ; only topN , grouped-timeseries & groupBy handle breakouts
  query-context)

(defmethod handle-breakout ::grouped-timeseries [_ {[breakout-field] :breakout} query-context]
  (assoc-in query-context [:query :granularity] (unit->granularity (:unit breakout-field))))

(defmethod handle-breakout ::topN [_ {[breakout-field] :breakout} query-context]
  (let [dim-rvalue (->dimension-rvalue breakout-field)]
    (-> query-context
        (update :projections conj (keyword (if (and (map? dim-rvalue)
                                                    (contains? dim-rvalue :outputName))
                                             (:outputName dim-rvalue)
                                             (name breakout-field))))
        (assoc-in [:query :dimension] dim-rvalue))))

(defmethod handle-breakout ::groupBy [_ {breakout-fields :breakout} query-context]
  (-> query-context
      (update :projections into (map (fn [breakout-field]
                                       (let [dim-rvalue (->dimension-rvalue breakout-field)]
                                         (keyword (if (and (map? dim-rvalue)
                                                           (contains? dim-rvalue :outputName))
                                                    (:outputName dim-rvalue)
                                                    (name breakout-field)))))
                                     breakout-fields))
      (assoc-in [:query :dimensions] (mapv ->dimension-rvalue breakout-fields))))


;;; ### handle-filter. See http://druid.io/docs/latest/querying/filters.html

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
  "Numeric `bound` filter, for finding values of `field` that are less than some value, greater than some value, or
  both. Defaults to being `inclusive` (e.g. `<=` instead of `<`) but specify option `inclusive?` to change this."
  [field & {:keys [lower upper inclusive?]
            :or   {inclusive? true}}]
  {:type        :bound
   :ordering    :numeric
   :dimension   (->rvalue field)
   :lower       (num (->rvalue lower))
   :upper       (num (->rvalue upper))
   :lowerStrict (not inclusive?)
   :upperStrict (not inclusive?)})

(defn- check-filter-fields [filter-type & fields]
  (doseq [field fields]
    (when (= (dimension-or-metric? field) :metric)
      (throw
       (IllegalArgumentException.
        (u/format-color 'red "WARNING: Filtering only works on dimensions! '%s' is a metric. Ignoring %s filter."
          (->rvalue field) filter-type))))))

(defn- parse-filter-subclause:filter [{:keys [filter-type field value case-sensitive?] :as filter}]
  {:pre [filter]}
  ;; We'll handle :timestamp separately. It needs to go in :intervals instead
  (when-not (instance? DateTimeField field)
    (try (when field
           (check-filter-fields filter-type field))
         (let [value (->rvalue value)]
           (case filter-type
             :inside
             (let [lat       (:lat filter)
                   lon       (:lon filter)
                   lat-field (:field lat)
                   lon-field (:field lon)]
               (check-filter-fields :inside lat-field lon-field)
               (filter:and
                [(filter:bound lat-field, :lower (:min lat), :upper (:max lat))
                 (filter:bound lon-field, :lower (:min lon), :upper (:max lon))]))

             :between
             (let [{:keys [min-val max-val]} filter]
               (filter:bound field, :lower min-val, :upper max-val))

             :is-null
             (filter:nil? field)

             :not-null
             (filter:not (filter:nil? field))

             :contains
             {:type      :search
              :dimension (->rvalue field)
              :query     {:type          :contains
                          :value         value
                          :caseSensitive case-sensitive?}}

             :starts-with (filter:like field (str (escape-like-filter-pattern value) \%) case-sensitive?)
             :ends-with   (filter:like field (str \% (escape-like-filter-pattern value)) case-sensitive?)

             :=  (filter:= field value)
             :!= (filter:not (filter:= field value))
             :<  (filter:bound field, :upper value, :inclusive? false)
             :>  (filter:bound field, :lower value, :inclusive? false)
             :<= (filter:bound field, :upper value)
             :>= (filter:bound field, :lower value)))
         (catch Throwable e
           (log/warn (.getMessage e))))))

(defn- parse-filter-clause:filter [{:keys [compound-type subclauses subclause], :as clause}]
  {:pre [clause]}
  (case compound-type
    :and {:type :and, :fields (filterv identity (map parse-filter-clause:filter subclauses))}
    :or  {:type :or,  :fields (filterv identity (map parse-filter-clause:filter subclauses))}
    :not (when-let [subclause (parse-filter-clause:filter subclause)]
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
      ;; This is technically allowed by the QL here but doesn't make sense since every Druid event has a timestamp.
      ;; Just ignore it
      :is-null  (log/warn (u/format-color 'red (str "WARNING: timestamps can never be nil. Ignoring IS_NULL filter "
                                                    "for timestamp.")))
      ;; :timestamp is always non-nil so nothing to do here
      :not-null nil)))

(defn- parse-filter-clause:intervals [{:keys [compound-type subclauses], :as clause}]
  (if-not compound-type
    (parse-filter-subclause:intervals clause)
    (let [subclauses (filterv identity (mapcat parse-filter-clause:intervals subclauses))]
      (when (seq subclauses)
        (case compound-type
          ;; A date can't be in more than one interval, so ANDing them together doesn't really make sense. In this
          ;; situation, just ignore all intervals after the first
          :and (do (when (> (count subclauses) 1)
                     (log/warn (u/format-color 'red (str "WARNING: A date can't belong to multiple discrete "
                                                         "intervals, so ANDing them together doesn't make sense.\n"
                                                         "Ignoring these intervals: %s") (rest subclauses))))
                   [(first subclauses)])
          ;; Ok to specify multiple intervals for OR
          :or  subclauses
          ;; We should never get to this point since the all non-string negations should get automatically rewritten
          ;; by the query expander.
          :not (log/warn (u/format-color 'red "WARNING: Don't know how to negate: %s" clause)))))))


(defn- handle-filter [_ {filter-clause :filter} query-context]
  (if-not filter-clause
    query-context
    (let [filter    (parse-filter-clause:filter    filter-clause)
          intervals (parse-filter-clause:intervals filter-clause)]
      (cond-> query-context
        (seq filter)    (assoc-in [:query :filter] filter)
        (seq intervals) (assoc-in [:query :intervals] intervals)))))


;;; ### handle-order-by

(defmulti ^:private handle-order-by query-type-dispatch-fn)

(defmethod handle-order-by ::query [_ _ query-context]
  (log/warn (u/format-color 'red (str "Sorting with Druid is only allowed in queries that have one or more breakout "
                                      "columns. Ignoring :order-by clause.")))
  query-context)


(defmethod handle-order-by ::topN
  [_
   {[{ag-type :aggregation-type}] :aggregation, [breakout-field] :breakout, [{:keys [field direction]}] :order-by}
   query-context]
  (let [field             (->rvalue field)
        breakout-field    (->rvalue breakout-field)
        sort-by-breakout? (= field breakout-field)
        ag-field          (if (= ag-type :distinct) :distinct___count ag-type)]
    (assoc-in query-context [:query :metric] (match [sort-by-breakout? direction]
                                               [true  :ascending]  {:type :alphaNumeric}
                                               [true  :descending] {:type :inverted, :metric {:type :alphaNumeric}}
                                               [false :ascending]  {:type :inverted, :metric ag-field}
                                               [false :descending] ag-field))))

(defmethod handle-order-by ::groupBy [_ {:keys [order-by]} query-context]
  (assoc-in query-context [:query :limitSpec :columns] (vec (for [{:keys [field direction]} order-by]
                                                              {:dimension (->rvalue field)
                                                               :direction direction}))))

;; Handle order by timstamp field
(defn- handle-order-by-timestamp [field direction query-context]
  (assoc-in query-context [:query :descending] (and (instance? DateTimeField field)
                                                    (= direction :descending))))

(defmethod handle-order-by ::grouped-timeseries [_ {[{field :field, direction :direction}] :order-by} query-context]
  (handle-order-by-timestamp field direction query-context))

(defmethod handle-order-by ::select [_ {[{field :field, direction :direction}] :order-by} query-context]
  (handle-order-by-timestamp field direction query-context))

;;; ### handle-fields

(defmulti ^:private handle-fields query-type-dispatch-fn)

(defmethod handle-fields ::query [_ {fields :fields} query-context]
  (when fields
    (log/warn (u/format-color 'red (str "WARNING: It only makes sense to specify :fields for a bare rows query. "
                                        "Ignoring the clause."))))
  query-context)

(defmethod handle-fields ::select [_ {fields :fields} query-context]
  (if-not (seq fields)
    query-context
    (loop [dimensions [], metrics [], projections (:projections query-context), [field & more] fields]
      (cond
        ;; If you specify nil or empty `:dimensions` or `:metrics` Druid will just return all of the ones available.
        ;; In cases where we don't want anything to be returned in one or the other, we'll ask for a `:___dummy`
        ;; column instead. Druid happily returns `nil` for the column in every row, and it will get auto-filtered out
        ;; of the results so the User will never see it.
        (not field)
        (-> query-context
            (assoc :projections (conj projections :timestamp))
            (assoc-in [:query :dimensions] (or (seq dimensions) [:___dummy]))
            (assoc-in [:query :metrics]    (or (seq metrics)    [:___dummy])))

        (instance? DateTimeField field)
        (recur dimensions metrics projections more)

        (= (dimension-or-metric? field) :dimension)
        (recur (conj dimensions (->rvalue field)) metrics (conj projections (keyword (name field))) more)

        (= (dimension-or-metric? field) :metric)
        (recur dimensions (conj metrics (->rvalue field)) (conj projections (keyword (name field))) more)))))


;;; ### handle-limit

(defmulti ^:private handle-limit query-type-dispatch-fn)

(defmethod handle-limit ::select [_ {limit :limit} query-context]
  (if-not limit
    query-context
    (assoc-in query-context [:query :pagingSpec :threshold] limit)))

(defmethod handle-limit ::timeseries [_ {limit :limit} query-context]
  (when limit
    (log/warn (u/format-color 'red (str "WARNING: Druid doenst allow limitSpec in timeseries queries. Ignoring the "
                                        "LIMIT clause."))))
  query-context)

(defmethod handle-limit ::topN [_ {limit :limit} query-context]
  (if-not limit
    query-context
    (assoc-in query-context [:query :threshold] limit)))

(defmethod handle-limit ::groupBy [_ {limit :limit} query-context]
  (if-not limit
    query-context
    (-> query-context
        (assoc-in [:query :limitSpec :type]  :default)
        (assoc-in [:query :limitSpec :limit] limit))))


;;; ### handle-page TODO - no real way to implement this DB side, probably have to do Clojure-side w/ `take`/`drop`

(defmulti ^:private handle-page query-type-dispatch-fn)

(defmethod handle-page ::query [_ {page-clause :page} query-context]
  (when page-clause
    (log/warn (u/format-color 'red "WARNING: 'page' is not yet implemented.")))
  query-context)


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
    (reduce (fn [query-context f]
              (f query-type query query-context))
            {:projections [] :query (query-type->default-query query-type) :query-type query-type :mbql? true}
            [handle-source-table
             handle-aggregations
             handle-breakout
             handle-filter
             handle-order-by
             handle-fields
             handle-limit
             handle-page])))


;;;  ### post-processing

(defmulti ^:private post-process query-type-dispatch-fn)

(defn- post-process-map [projections results]
  {:projections projections
   :results     results})

(def ^:private druid-ts-format (tformat/formatters :date-time))

(defn- parse-timestamp
  [timestamp]
  (->> timestamp (tformat/parse druid-ts-format) tcoerce/to-date))

(defn- reformat-timestamp [timestamp target-formatter]
  (->> timestamp
       (tformat/parse druid-ts-format)
       (tformat/unparse target-formatter)))

(defmethod post-process ::select  [_ projections {:keys [timezone middleware]} results]
  (let [target-formater (and timezone (tformat/with-zone druid-ts-format timezone))
        update-ts-fn (cond
                       (not (:format-rows? middleware true))
                       #(update % :timestamp parse-timestamp)

                       target-formater
                       #(update % :timestamp reformat-timestamp target-formater)

                       :else
                       identity)]
    (->> results
         first
         :result
         :events
         (map (comp update-ts-fn :event))
         (post-process-map projections))))

(defmethod post-process ::total   [_ projections _ results]
  (post-process-map projections (map :result results)))

(defmethod post-process ::topN    [_ projections {:keys [middleware]} results]
  (post-process-map projections
                    (let [results (-> results first :result)]
                      (if (:format-rows? middleware true)
                        results
                        (map #(u/update-when % :timestamp parse-timestamp) results)))))

(defmethod post-process ::groupBy [_ projections {:keys [middleware]} results]
  (post-process-map projections
                    (if (:format-rows? middleware true)
                      (map :event results)
                      (map (comp #(u/update-when % :timestamp parse-timestamp)
                                 :event)
                           results))))

(defmethod post-process ::timeseries [_ projections {:keys [middleware]} results]
  (post-process-map (conj projections :timestamp)
                    (let [ts-getter (if (:format-rows? middleware true)
                                      :timestamp
                                      (comp parse-timestamp :timestamp))]
                      (for [event results]
                        (conj {:timestamp (ts-getter event)} (:result event))))))

(defn post-process-native
  "Post-process the results of a *native* Druid query. The appropriate ns-qualified query type keyword (e.g. `::select`,
  used for mutlimethod dispatch) is inferred from the query itself."
  [{:keys [queryType], :as query} results]
  {:pre [queryType]}
  (post-process (keyword "metabase.driver.druid.query-processor" (name queryType))
                results))

(defn- remove-bonus-keys
  "Remove keys that start with `___` from the results -- they were temporary, and we don't want to return them."
  [columns]
  (let [keys-to-remove (for [k     columns
                             :when (re-find #"^___" (name k))]
                         k)]
    (if-not (seq keys-to-remove)
      columns
      (filterv (complement (set keys-to-remove)) columns))))

;;; ### MBQL Processor

(defn mbql->native
  "Transpile an MBQL (inner) query into a native form suitable for a Druid DB."
  [query]
  ;; Merge `:settings` into the inner query dict so the QP has access to it
  (let [mbql-query (assoc (:query query)
                     :settings (:settings query))]
    (binding [*query* mbql-query]
      (build-druid-query mbql-query))))


(defn- columns->getter-fns
  "Given a sequence of COLUMNS keywords, return a sequence of appropriate getter functions to get values from a single
  result row. Normally, these are just the keyword column names themselves, but for `:timestamp___int`, we'll also
  parse the result as an integer (for further explanation, see the docstring for
  `units-that-need-post-processing-int-parsing`). We also round `:distinct___count` in order to return an integer
  since Druid returns the approximate floating point value for cardinality queries (See Druid documentation regarding
  cardinality and HLL)."
  [columns]
  (vec (for [k columns]
         (case k
            :distinct___count (comp math/round k)
            :timestamp___int  (comp (fn [^String s]
                                      (when (seq s)
                                        (Integer/parseInt s)))
                                    k)
            k))))

(defn- utc?
  "There are several timezone ids that mean UTC. This will create a TimeZone object from `TIMEZONE` and check to see if
  it's a UTC timezone"
  [^DateTimeZone timezone]
  (.hasSameRules (TimeZone/getTimeZone "UTC")
                 (.toTimeZone timezone)))

(defn- resolve-timezone
  "Returns the timezone object (either report-timezone or JVM timezone). Returns nil if the timezone is UTC as the
  timestamps from Druid are already in UTC and don't need to be converted"
  [{:keys [settings]}]
  (let [tz (time/time-zone-for-id (:report-timezone settings (System/getProperty "user.timezone")))]
    (when-not (utc? tz)
      tz)))

(defn execute-query
  "Execute a query for a Druid DB."
  [do-query
   {database                                     :database
    {:keys [query query-type mbql? projections]} :native
    middleware                                   :middleware
    :as                                          query-context}]
  {:pre [database query]}
  (let [details       (:details database)
        query         (if (string? query)
                        (json/parse-string query keyword)
                        query)
        query-type    (or query-type (keyword "metabase.driver.druid.query-processor" (name (:queryType query))))
        post-proc-map (->> query
                           (do-query details)
                           (post-process query-type projections
                                         {:timezone   (resolve-timezone query-context)
                                          :middleware middleware}))
        columns       (if mbql?
                        (->> post-proc-map
                             :projections
                             remove-bonus-keys
                             vec)
                        (-> post-proc-map :results first keys))
        getters       (columns->getter-fns columns)]
    ;; rename any occurances of `:timestamp___int` to `:timestamp` in the results so the user doesn't know about our
    ;; behind-the-scenes conversion and apply any other post-processing on the value such as parsing some units to int
    ;; and rounding up approximate cardinality values.
    {:columns   (vec (replace {:timestamp___int :timestamp :distinct___count :count} columns))
     :rows      (for [row (:results post-proc-map)]
                  (for [getter getters]
                    (getter row)))
     :annotate? mbql?}))
