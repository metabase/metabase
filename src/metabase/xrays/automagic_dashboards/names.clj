(ns metabase.xrays.automagic-dashboards.names
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.time :as u.time]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [metabase.xrays.automagic-dashboards.util :as magic.util]))

;; TODO - rename "minumum" to "minimum". Note that there are internationalization string implications
;; here so make sure to do a *thorough* find and replace on this.
(def ^:private op->name
  {:sum       (deferred-tru "sum")
   :avg       (deferred-tru "average")
   :min       (deferred-tru "minumum")
   :max       (deferred-tru "maximum")
   :count     (deferred-tru "number")
   :distinct  (deferred-tru "distinct count")
   :stddev    (deferred-tru "standard deviation")
   :cum-count (deferred-tru "cumulative count")
   :cum-sum   (deferred-tru "cumulative sum")})

(mu/defn metric-name
  "Return the name of the metric or name by describing it."
  [[op _opts & args :as metric] :- ::lib.schema.aggregation/aggregation]
  (if (magic.util/adhoc-metric? metric)
    (-> op qp.util/normalize-token op->name)
    (second args)))

(defn- join-enumeration
  "Join a sequence as [1 2 3 4] to \"1, 2, 3 and 4\""
  [xs]
  (if (next xs)
    (tru "{0} and {1}" (str/join ", " (butlast xs)) (last xs))
    (first xs)))

(def ^{:arglists '([root])} source-name
  "Return the (display) name of the source of a given root object."
  (comp (some-fn :display-name :display_name :name) :source))

(defn metric->description
  "Return a description for the metric."
  [root aggregation-clause]
  (join-enumeration
   (for [metric (if (sequential? (first aggregation-clause))
                  aggregation-clause
                  [aggregation-clause])]
     (if (magic.util/adhoc-metric? metric)
       (tru "{0} of {1}" (metric-name metric) (or (some->> metric
                                                           second
                                                           (magic.util/->field root)
                                                           :display-name)
                                                  (source-name root)))
       (metric-name metric)))))

(mu/defn question-description
  "Generate a description for the question."
  [root     :- ::ads/root
   question :- [:map
                [:dataset_query ::ads/query]]]
  (let [aggregations (->> (some-> question :dataset_query not-empty lib/aggregations)
                          (metric->description root))
        dimensions   (->> (some-> question :dataset_query not-empty lib/breakouts)
                          (mapcat magic.util/collect-field-references)
                          (map (partial magic.util/->field root))
                          (map :display-name)
                          join-enumeration)]
    (if dimensions
      (tru "{0} by {1}" aggregations dimensions)
      aggregations)))

(defmulti ^:private humanize-filter-value
  {:arglists '([root mbql-clause])}
  (fn [_root [tag]]
    (keyword tag)))

(defn- unit-name [unit]
  (case (keyword unit)
    :minute-of-hour  (deferred-tru "minute")
    :hour-of-day     (deferred-tru "hour")
    :day-of-week     (deferred-tru "day of week")
    :day-of-month    (deferred-tru "day of month")
    :day-of-year     (deferred-tru "day of year")
    :week-of-year    (deferred-tru "week")
    :month-of-year   (deferred-tru "month")
    :quarter-of-year (deferred-tru "quarter")
    :year            (deferred-tru "year")))

(mu/defn- item-reference->field
  "Turn a field reference into a field."
  [root :- ::ads/root
   [item-type :as item-reference] :- ::lib.schema.mbql-clause/clause]
  (case item-type
    (:field "field") (let [temporal-unit              (lib/raw-temporal-bucket item-reference)
                           {:keys [display-name] :as field-record} (cond-> (->> item-reference
                                                                                magic.util/collect-field-references
                                                                                first
                                                                                (magic.util/->field root))
                                                                     temporal-unit
                                                                     (assoc :unit temporal-unit))
                           item-name                  (cond->> display-name
                                                        (some-> temporal-unit u.date/extract-units)
                                                        (tru "{0} of {1}" (unit-name temporal-unit)))]
                       (assoc field-record :item-name item-name))
    (:expression "expression") {:item-name (second item-reference)}
    {:item-name "item"}))

(mu/defn item-name
  "Determine the right name to display from an individual humanized item."
  ([root [tag _opts potential-name :as a-ref] :- ::lib.schema.ref/ref]
   (case tag
     :field      (->> a-ref (item-reference->field root) item-name)
     :expression potential-name
     "item"))
  ([{:keys [display-name unit] :as _field} :- ::ads/column]
   (cond->> display-name
     (some-> unit u.date/extract-units) (tru "{0} of {1}" (unit-name unit)))))

(defn- pluralize
  "Add appropriate pluralization suffixes for integer numbers."
  [x]
  ;; the `int` cast here is to fix performance warnings if `*warn-on-reflection*` is enabled
  (case (int (mod x 10))
    1 (tru "{0}st" x)
    2 (tru "{0}nd" x)
    3 (tru "{0}rd" x)
    (tru "{0}th" x)))

(defn- humanize-datetime
  "Convert a time data type into a human friendly string."
  [t unit]
  (let [dt (if (integer? t)
             (u.time/coerce-to-timestamp t {:unit unit})
             (u.date/parse t))]
    (case unit
      :second          (tru "at {0}" (t/format "h:mm:ss a, MMMM d, YYYY" dt))
      :minute          (tru "at {0}" (t/format "h:mm a, MMMM d, YYYY" dt))
      :hour            (tru "at {0}" (t/format "h a, MMMM d, YYYY" dt))
      :day             (tru "on {0}" (t/format "MMMM d, YYYY" dt))
      :week            (tru "in {0} week - {1}"
                            (pluralize (u.date/extract dt :week-of-year))
                            (str (u.date/extract dt :year)))
      :month           (tru "in {0}" (t/format "MMMM YYYY" dt))
      :quarter         (tru "in Q{0} - {1}"
                            (u.date/extract dt :quarter-of-year)
                            (str (u.date/extract dt :year)))
      :year            (t/format "YYYY" dt)
      :day-of-week     (t/format "EEEE" dt)
      :hour-of-day     (tru "at {0}" (t/format "h a" dt))
      :month-of-year   (t/format "MMMM" dt)
      :quarter-of-year (tru "Q{0}" (u.date/extract dt :quarter-of-year))
      (:minute-of-hour
       :day-of-month
       :day-of-year
       :week-of-year)  (u.date/extract dt unit))))

(mu/defmethod humanize-filter-value :=
  [root :- ::ads/root
   [_ field-reference value]]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is {1}" item-name (humanize-datetime value unit))
      (tru "{0} is {1}" item-name value))))

(mu/defmethod humanize-filter-value :>=
  [root :- ::ads/root
   [_ field-reference value]]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is not before {1}" item-name (humanize-datetime value unit))
      (tru "{0} is at least {1}" item-name value))))

(mu/defmethod humanize-filter-value :>
  [root :- ::ads/root
   [_ field-reference value]]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is after {1}" item-name (humanize-datetime value unit))
      (tru "{0} is greater than {1}" item-name value))))

(mu/defmethod humanize-filter-value :<=
  [root :- ::ads/root
   [_ field-reference value]]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is not after {1}" item-name (humanize-datetime value unit))
      (tru "{0} is no more than {1}" item-name value))))

(mu/defmethod humanize-filter-value :<
  [root :- ::ads/root
   [_ field-reference value]]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is before {1}" item-name (humanize-datetime value unit))
      (tru "{0} is less than {1}" item-name value))))

(mu/defmethod humanize-filter-value :between
  [root :- ::ads/root
   [_ field-reference min-value max-value]]
  (tru "{0} is between {1} and {2}" (item-name root field-reference) min-value max-value))

(mu/defmethod humanize-filter-value :inside
  [root :- ::ads/root
   [_ lat-reference lon-reference lat-max lon-min lat-min lon-max]]
  (tru "{0} is between {1} and {2}; and {3} is between {4} and {5}"
       (item-name root lon-reference) lon-min lon-max
       (item-name root lat-reference) lat-min lat-max))

(mu/defmethod humanize-filter-value :and
  [root :- ::ads/root
   [_ & clauses]]
  (->> clauses
       (map (partial humanize-filter-value root))
       join-enumeration))

(mu/defmethod humanize-filter-value :default
  [root :- ::ads/root
   [_ field-reference value]]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} relates to {1}" item-name (humanize-datetime value unit))
      (tru "{0} relates to {1}" item-name value))))

(defn cell-title
  "Return a cell title given a root object and a cell query."
  [root cell-query]
  (str/join " " [(if-let [aggregation (some-> (get-in root [:entity :dataset_query])
                                              not-empty
                                              lib/aggregations)]
                   (metric->description root aggregation)
                   (:full-name root))
                 (tru "where {0}" (humanize-filter-value root cell-query))]))
