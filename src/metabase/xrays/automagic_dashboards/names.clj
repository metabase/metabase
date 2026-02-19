(ns metabase.xrays.automagic-dashboards.names
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.time :as u.time]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [metabase.xrays.automagic-dashboards.util :as magic.util]))

(def ^:private op->name
  {:sum       (deferred-tru "sum")
   :avg       (deferred-tru "average")
   :min       (deferred-tru "minimum")
   :max       (deferred-tru "maximum")
   :count     (deferred-tru "number")
   :distinct  (deferred-tru "distinct count")
   :stddev    (deferred-tru "standard deviation")
   :cum-count (deferred-tru "cumulative count")
   :cum-sum   (deferred-tru "cumulative sum")})

(mu/defn metric-name :- ::ads/string-or-18n-string
  "Return the name of the metric or name by describing it."
  [database-id           :- [:maybe :int]
   [tag opts :as metric] :- vector?]
  (cond
    (lib/clause-of-type? metric :measure)
    (or (:display-name opts)
        (when-let [measure-id (when (int? (nth metric 2 nil))
                                (nth metric 2))]
          (when database-id
            (let [mp (lib-be/application-database-metadata-provider database-id)]
              (some-> (lib.metadata/measure mp measure-id) :name))))
        (tru "[Unknown Measure]"))

    (magic.util/adhoc-metric? metric)
    (-> tag keyword op->name)

    (lib/clause-of-type? metric :field)
    (lib/field-ref-name metric)

    :else
    (throw (ex-info (format "Don't know how to get the name of %s" (pr-str metric))
                    {:metric metric}))))

(mu/defn- join-enumeration :- ::ads/string-or-18n-string
  "Join a sequence as [1 2 3 4] to \"1, 2, 3 and 4\""
  [xs :- [:sequential :any]]
  (if (next xs)
    (tru "{0} and {1}" (str/join ", " (butlast xs)) (last xs))
    (str (first xs))))

(def ^{:arglists '([root])} source-name
  "Return the (display) name of the source of a given root object."
  (comp (some-fn :display_name :name) :source))

(mu/defn metric->description :- [:or :string [:fn {:error/message "localized string"} i18n/localized-string?]]
  "Return a description for the metric."
  [root               :- ::ads/root
   aggregation-clause :- [:or
                          ::lib.schema.aggregation/aggregation
                          ::lib.schema.aggregation/aggregations]]
  (let [database-id (:database root)]
    (join-enumeration
     (for [metric (if (sequential? (first aggregation-clause))
                    aggregation-clause
                    [aggregation-clause])]
       (if (magic.util/adhoc-metric? metric)
         (tru "{0} of {1}" (metric-name database-id metric) (or (when (> (count metric) 2)
                                                                  (->> (nth metric 2) ; icky
                                                                       (magic.util/->field root)
                                                                       :display_name))
                                                                (source-name root)))
         (metric-name database-id metric))))))

(mu/defn question-description
  "Generate a description for the question."
  [root     :- ::ads/root
   question :- [:map
                [:dataset_query ::ads/query]]]
  (let [aggregations (->> (lib/aggregations (:dataset_query question))
                          (metric->description root))
        field-ids    (into
                      #{}
                      (mapcat lib/all-field-ids)
                      (lib/breakouts (:dataset_query question)))
        dimensions   (->> field-ids
                          (mapv (partial magic.util/->field root))
                          (mapv :display_name)
                          join-enumeration)]
    (if dimensions
      (tru "{0} by {1}" aggregations dimensions)
      aggregations)))

(defmulti ^:private humanize-filter-value
  {:arglists '([root mbql-clause])}
  (fn [_root mbql-clause]
    (lib/dispatch-value mbql-clause)))

(def ^:private unit-name (comp {:minute-of-hour  (deferred-tru "minute")
                                :hour-of-day     (deferred-tru "hour")
                                :day-of-week     (deferred-tru "day of week")
                                :day-of-month    (deferred-tru "day of month")
                                :day-of-year     (deferred-tru "day of year")
                                :week-of-year    (deferred-tru "week")
                                :month-of-year   (deferred-tru "month")
                                :quarter-of-year (deferred-tru "quarter")
                                :year            (deferred-tru "year")}
                               keyword))

(mu/defn- item-reference->field :- [:map
                                    [:item-name :string]]
  "Turn a field reference into a field."
  [root                    :- ::ads/root
   [tag _opts x :as a-ref] :- ::lib.schema.ref/ref]
  (case tag
    :field      (let [temporal-unit                           (lib/raw-temporal-bucket a-ref)
                      {:keys [display_name] :as field-record} (cond-> (magic.util/->field root a-ref)
                                                                temporal-unit
                                                                (assoc :unit temporal-unit))
                      item-name                               (cond->> display_name
                                                                (some-> temporal-unit u.date/extract-units)
                                                                (tru "{0} of {1}" (unit-name temporal-unit)))]
                  (assoc field-record :item-name item-name))
    :expression {:item-name x}
    {:item-name "item"}))

(defn item-name
  "Determine the right name to display from an individual humanized item."
  ([root [field-type potential-name :as field-reference]]
   (case field-type
     (:field "field") (->> field-reference (item-reference->field root) item-name)
     (:expression "expression") potential-name
     "item"))
  ([{:keys [display_name unit] :as _field}]
   (cond->> display_name
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
  [root                            :- ::ads/root
   [_ _opts field-reference value] :- :mbql.clause/=]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is {1}" item-name (humanize-datetime value unit))
      (tru "{0} is {1}" item-name value))))

(mu/defmethod humanize-filter-value :>=
  [root                            :- ::ads/root
   [_ _opts field-reference value] :- :mbql.clause/>=]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is not before {1}" item-name (humanize-datetime value unit))
      (tru "{0} is at least {1}" item-name value))))

(mu/defmethod humanize-filter-value :>
  [root                            :- ::ads/root
   [_ _opts field-reference value] :- :mbql.clause/>]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is after {1}" item-name (humanize-datetime value unit))
      (tru "{0} is greater than {1}" item-name value))))

(mu/defmethod humanize-filter-value :<=
  [root                            :- ::ads/root
   [_ _opts field-reference value] :- :mbql.clause/<=]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is not after {1}" item-name (humanize-datetime value unit))
      (tru "{0} is no more than {1}" item-name value))))

(mu/defmethod humanize-filter-value :<
  [root                            :- ::ads/root
   [_ _opts field-reference value] :- :mbql.clause/<]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} is before {1}" item-name (humanize-datetime value unit))
      (tru "{0} is less than {1}" item-name value))))

(mu/defmethod humanize-filter-value :between
  [root                                          :- ::ads/root
   [_ _opts field-reference min-value max-value] :- :mbql.clause/between]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (or (when (isa? (or effective_type base_type) :type/Temporal)
          (let [humanized-min (humanize-datetime min-value unit)
                humanized-max (humanize-datetime max-value unit)]
            (when (= humanized-min humanized-max)
              (tru "{0} is {1}" item-name humanized-min))))
        (tru "{0} is between {1} and {2}" item-name min-value max-value))))

(mu/defmethod humanize-filter-value :inside
  [root                                                                  :- ::ads/root
   [_ _opts lat-reference lon-reference lat-max lon-min lat-min lon-max] :- :mbql.clause/inside]
  (tru "{0} is between {1} and {2}; and {3} is between {4} and {5}"
       (item-name root lon-reference) lon-min lon-max
       (item-name root lat-reference) lat-min lat-max))

(mu/defmethod humanize-filter-value :and
  [root                :- ::ads/root
   [_ _opts & clauses] :- :mbql.clause/and]
  (->> clauses
       (map (partial humanize-filter-value root))
       join-enumeration))

(mu/defmethod humanize-filter-value :default
  [root                      :- ::ads/root
   [_ field-reference value] :- ::lib.schema.expression/boolean]
  (let [{:keys [item-name effective_type base_type unit]} (item-reference->field root field-reference)]
    (if (isa? (or effective_type base_type) :type/Temporal)
      (tru "{0} relates to {1}" item-name (humanize-datetime value unit))
      (tru "{0} relates to {1}" item-name value))))

(mu/defn cell-title :- :string
  "Return a cell title given a root object and a cell query."
  [root       :- ::ads/root
   cell-query :- ::ads/root.cell-query]
  (str/join " " [(if-let [aggregation (-> (get-in root [:entity :dataset_query])
                                          lib/aggregations)]
                   (metric->description root aggregation)
                   (:full-name root))
                 (tru "where {0}" (humanize-filter-value root cell-query))]))
