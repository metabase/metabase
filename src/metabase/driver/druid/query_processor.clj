(ns metabase.driver.druid.query-processor
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as s]
            [clojure.tools.logging]
            [clojure.tools.logging :as log]
            [metabase.driver.query-processor :as qp]
            [metabase.driver.query-processor.interface :as i]
            [metabase.util :as u])
  (:import clojure.lang.Keyword
           (metabase.driver.query_processor.interface AgFieldRef
                                                      DateTimeField
                                                      DateTimeValue
                                                      Field
                                                      RelativeDateTimeValue
                                                      Value)))

;;             +-----> ::select
;; ::query ----|                     +----> ::timeseries
;;             +----> ::ag-query ----|                             +----> ::topN
;;                                   +----> ::grouped-ag-query ----|
;;                                                                 +----> ::groupBy
(derive ::select           ::query)
(derive ::ag-query         ::query)
(derive ::timeseries       ::ag-query)
(derive ::grouped-ag-query ::ag-query)
(derive ::topN             ::grouped-ag-query)
(derive ::groupBy          ::grouped-ag-query)

(def ^:private ^:dynamic *query* nil)

(defn- query-type-dispatch-fn [query-type & _] query-type)

(defprotocol ^:private IRValue
  (^:private ->rvalue [this]))

(extend-protocol IRValue
  nil                   (->rvalue [_] nil)
  Object                (->rvalue [this] this)
  AgFieldRef            (->rvalue [_] (let [ag-type (or (get-in *query* [:aggregation :aggregation-type])
                                                        (throw (Exception. "Unknown aggregation type!")))]
                                        (if (= ag-type :distinct) :count
                                            ag-type)))
  Field                 (->rvalue [this] (:field-name this))
  DateTimeField         (->rvalue [this] (->rvalue (:field this)))
  Value                 (->rvalue [this] (:value this))
  DateTimeValue         (->rvalue [{{unit :unit} :field, value :value}] (u/date->iso-8601 (u/date-trunc-or-extract unit value)))
  RelativeDateTimeValue (->rvalue [{:keys [unit amount], :as this}]     (if (zero? amount)
                                                                          (u/date->iso-8601)
                                                                          (u/date->iso-8601 (u/date-trunc-or-extract unit (u/relative-date unit amount))))))

(defprotocol ^:private IDimensionOrMetric
  (^:private dimension-or-metric? [this]
   "Is this `Field`/`DateTimeField` a `:dimension` or `:metric`?"))

(extend-protocol IDimensionOrMetric
  Field         (dimension-or-metric? [this] (case (:base-type this)
                                               :TextField    :dimension
                                               :FloatField   :metric
                                               :IntegerField :metric))
  DateTimeField (dimension-or-metric? [this] (dimension-or-metric? (:field this))))


(def ^:private ^:const query-type->default-query
  (let [defaults {:intervals   ["-5000/5000"]
                  :granularity :all
                  :context     {:timeout 60000}}]
    {::select     (merge defaults {:queryType  :select
                                   :pagingSpec {:threshold 100 #_qp/absolute-max-results}})
     ::timeseries (merge defaults {:queryType :timeseries})
     ::topN       (merge defaults {:queryType :topN
                                   :threshold 100 #_qp/absolute-max-results})
     ::groupBy    (merge defaults {:queryType :groupBy})}))


;;; ### handle-source-table

(defn- handle-source-table [_ {{source-table-name :name} :source-table} druid-query]
  {:pre [(or (string? source-table-name)
             (keyword? source-table-name))]}
  (assoc druid-query :dataSource source-table-name))


;;; ### handle-aggregation

(declare filter:not filter:nil?)

(defn- ag:doubleSum [field output-name]
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
                :fnCombine   "function(x, y) { return x + y; }"}))

(defn- ag:filtered  [filtr aggregator] {:type :filtered, :filter filtr, :aggregator aggregator})

(defn- ag:count
  ([output-name]       {:type :count, :name output-name})
  ([field output-name] (ag:filtered (filter:not (filter:nil? field))
                                    (ag:count output-name))))

(defn- handle-aggregation [query-type {{ag-type :aggregation-type, ag-field :field} :aggregation} druid-query]
  (when (isa? query-type ::ag-query)
    (merge druid-query
           (let [ag-type (if (= ag-type :rows) nil ag-type)]
             (match [ag-type ag-field]
               ;; For 'distinct values' queries (queries with a breakout by no aggregation) just aggregate by count, but name it :___count so it gets discarded automatically
               [nil     nil] {:aggregations [(ag:count :___count)]}

               [:count  nil] {:aggregations [(ag:count :count)]}

               [:count    _] {:aggregations [(ag:count ag-field :count)]}

               [:avg      _] {:aggregations     [(ag:count ag-field :___count)
                                                 (ag:doubleSum ag-field :___sum)]
                              :postAggregations [{:type   :arithmetic
                                                  :name   :avg
                                                  :fn     :/
                                                  :fields [{:type :fieldAccess, :fieldName :___sum}
                                                           {:type :fieldAccess, :fieldName :___count}]}]}

               [:distinct _] {:aggregations [{:type       :cardinality
                                              :name       :count
                                              :fieldNames [(->rvalue ag-field)]}]}
               [:sum      _] {:aggregations [(ag:doubleSum ag-field :sum)]})))))


;;; ### handle-breakout

(defprotocol ^:private IDimension
  (^:private ->dimension-rvalue [this]
   "Format `Field` for use in a `:dimension` or `:dimensions` clause."))

(defn- extract:timeFormat [format-str]
  {:pre [(string? format-str)]}
  {:type     :timeFormat
   :format   format-str
   :timeZone "US/Pacific" ; TODO - should we use `report-timezone` instead (?)
   :locale   "en-US"})

(defn- extract:js [& function-str-parts]
  {:pre [(every? string? function-str-parts)]}
  {:type     :javascript
   :function (s/replace (apply str function-str-parts) #"\s+" " ")})

(def ^:private ^:const unit->extractionFn
  "JODA date format strings for each datetime unit. [Described here.](http://www.joda.org/joda-time/apidocs/org/joda/time/format/DateTimeFormat.html)."
  {:default         (extract:timeFormat "yyyy-MM-dd'T'HH:mm:ssZ")
   :minute          (extract:timeFormat "yyyy-MM-dd'T'HH:mm:00Z")
   :minute-of-hour  (extract:timeFormat "mm")
   :hour            (extract:timeFormat "yyyy-MM-dd'T'HH:00:00Z")
   :hour-of-day     (extract:timeFormat "HH")
   :day             (extract:timeFormat "yyyy-MM-ddZ")
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
   :year            (extract:timeFormat "yyyy")})

(extend-protocol IDimension
  nil    (->dimension-rvalue [this] (->rvalue this))
  Object (->dimension-rvalue [this] (->rvalue this))
  ;; :timestamp is a special case, and we need to do an 'extraction' against the secret special value :__time to get at it
  DateTimeField
  (->dimension-rvalue [{:keys [unit], :as this}]
    {:type         :extraction
     :dimension    :__time
     :outputName   :timestamp
     :extractionFn (unit->extractionFn unit)}))

(defmulti ^:private handle-breakout query-type-dispatch-fn)

(defmethod handle-breakout ::query [_ _ _]) ; only topN & groupBy handle breakouts

(defmethod handle-breakout ::topN [_ {[breakout-field] :breakout} druid-query]
  (assoc druid-query :dimension (->dimension-rvalue breakout-field)))

(defmethod handle-breakout ::groupBy [_ {breakout-fields :breakout} druid-query]
  (assoc druid-query :dimensions (mapv ->dimension-rvalue breakout-fields)))


;;; ### handle-filter

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
  (filter:= field (case (dimension-or-metric? field)
                    :dimension nil
                    :metric    0)))

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
    (let [field (->rvalue field)]
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
        :not-null nil))))

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
  (log/warn (u/format-color 'red "Sorting with Druid is only allowed queries that have one or more breakout columns. Ignoring :order_by clause.")))

(defmethod handle-order-by ::topN [_ {{ag-type :aggregation-type} :aggregation, [breakout-field] :breakout, [{field :field, direction :direction}] :order-by} druid-query]
  (let [field             (->rvalue field)
        breakout-field    (->rvalue breakout-field)
        sort-by-breakout? (= field breakout-field)
        ag-field          (if (= ag-type :distinct) :count ag-type)]
    (assoc druid-query :metric (match [sort-by-breakout? direction]
                                 [true  :ascending]  {:type :alphaNumeric}
                                 [true  :descending] {:type :inverted, :metric {:type :alphaNumeric}}
                                 [false :ascending]  {:type :inverted, :metric ag-field}
                                 [false :descending] ag-field))))

(defmethod handle-order-by ::groupBy [_ {:keys [order-by]} druid-query]
  (assoc-in druid-query [:limitSpec :columns] (vec (for [{:keys [field direction]} order-by]
                                                     {:dimension (->rvalue field)
                                                      :direction direction}))))


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
    (log/warn (u/format-color 'red "WARNING: It doesn't make sense to limit an aggregate query without any breakouts, since it will always return one row. Ignoring the LIMIT clause."))))

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

(defmethod handle-page ::query [_ {{page-num :page items-per-page :items, :as page-clause} :page} druid-query]
  (when page-clause
    (log/warn (u/format-color 'red "WARNING: 'page' is not yet implemented."))))


;;; ## Build + Log + Process Query

(defn- druid-query-type
  "What type of Druid query type should we perform?"
  [{breakout-fields :breakout, {ag-type :aggregation-type} :aggregation}]
  (let [breakouts (condp = (count breakout-fields)
                    0 :none
                    1 :one
                      :many)
        agg?      (boolean (and ag-type (not= ag-type :rows)))]
    (match [breakouts agg?]
      [:none false] ::select
      [:none  true] ::timeseries
      [:one      _] ::topN
      [:many     _] ::groupBy)))


(defn- log-druid-query [druid-query]
  (log/debug (u/format-color 'blue "DRUID QUERY:😋\n%s\n" (u/pprint-to-str druid-query))))


(defn- build-druid-query [query]
  {:pre [(map? query)]}
  (let [query-type (druid-query-type query)]
    (loop [druid-query (query-type->default-query query-type), [f & more] [handle-source-table
                                                                           handle-aggregation
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

(defmethod post-process ::select     [_ results] (->> results first :result :events (map :event)))
(defmethod post-process ::timeseries [_ results] (map :result results))
(defmethod post-process ::topN       [_ results] (-> results first :result))
(defmethod post-process ::groupBy    [_ results] (map :event results))


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


;;; ### process-structured-query

(defn process-structured-query
  "Process a structured query for a Druid DB."
  [do-query query]
  (binding [*query* query]
    (let [[query-type druid-query] (build-druid-query query)]
      (log-druid-query druid-query)
      (->> (do-query druid-query)
           (post-process query-type)
           remove-bonus-keys))))
