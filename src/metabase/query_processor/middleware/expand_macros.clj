(ns metabase.query-processor.middleware.expand-macros
  "Middleware for expanding `:metric` and `:segment` 'macros' in *unexpanded* MBQL queries.

  (`:metric` forms are expanded into aggregations and sometimes filter clauses, while `:segment` forms are expanded
  into filter clauses.)

   TODO - this namespace is ancient and written with MBQL '95 in mind, e.g. it is case-sensitive.
   At some point this ought to be reworked to be case-insensitive and cleaned up."
  (:require [clojure.tools.logging :as log]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.segment :refer [Segment]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    SEGMENTS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- segment-clauses->id->definition [segment-clauses]
  (when-let [segment-ids (seq (filter integer? (map second segment-clauses)))]
    (db/select-id->field :definition Segment, :id [:in (set segment-ids)])))

(defn- replace-segment-clauses [outer-query segment-id->definition]
  (mbql.u/replace-in outer-query [:query]
    [:segment (segment-id :guard (complement mbql.u/ga-id?))]
    (or (:filter (segment-id->definition segment-id))
        (throw (IllegalArgumentException. (tru "Segment {0} does not exist, or is invalid." segment-id))))))

(s/defn ^:private expand-segments :- mbql.s/Query
  [{inner-query :query, :as outer-query} :- mbql.s/Query]
  (if-let [segments (mbql.u/match inner-query :segment)]
    (replace-segment-clauses outer-query (segment-clauses->id->definition segments))
    outer-query))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    METRICS                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- metrics
  "Return a sequence of any (non-GA) `:metric` MBQL clauses in `query`."
  [query]
  ;; metrics won't be in a native query but they could be in source-query or aggregation clause
  (mbql.u/match query [:metric (_ :guard (complement mbql.u/ga-id?))]))

(def ^:private MetricInfo
  {:id         su/IntGreaterThanZero
   :name       su/NonBlankString
   :definition {:aggregation             [(s/one mbql.s/Aggregation "aggregation clause")]
                (s/optional-key :filter) (s/maybe mbql.s/Filter)
                s/Keyword                s/Any}})

(def ^:private ^{:arglists '([metric-info])} metric-info-validation-errors (s/checker MetricInfo))

(s/defn ^:private metric-clauses->id->info :- {su/IntGreaterThanZero MetricInfo}
  [metric-clauses :- [mbql.s/metric]]
  (when (seq metric-clauses)
    (u/key-by :id (for [metric (db/select [Metric :id :name :definition] :id [:in (set (map second metric-clauses))])
                        :let   [errors (u/prog1 (metric-info-validation-errors metric)
                                         (when <>
                                           (log/warn (trs "Invalid metric: {0} reason: {1}" metric <>))))]
                        :when  (not errors)]
                    metric))))

(s/defn ^:private add-metrics-filters-this-level :- mbql.s/MBQLQuery
  [inner-query :- mbql.s/MBQLQuery this-level-metric-id->info :- {su/IntGreaterThanZero MetricInfo}]
  (let [filters (for [{{filter-clause :filter} :definition} (vals this-level-metric-id->info)
                      :when filter-clause]
                  filter-clause)]
    (reduce mbql.u/add-filter-clause-to-inner-query inner-query filters)))

(s/defn ^:private metric-info->ag-clause :- mbql.s/Aggregation
  "Return an appropriate aggregation clause from `metric-info`."
  [{{[aggregation] :aggregation} :definition, metric-name :name} :- MetricInfo
   {:keys [use-metric-name-as-display-name?]}                    :- {:use-metric-name-as-display-name? s/Bool}]
  (if-not use-metric-name-as-display-name?
    aggregation
    ;; try to give the resulting aggregation the name of the Metric it came from, unless it already has a display
    ;; name in which case keep that name
    (mbql.u/match-one aggregation
      [:aggregation-options _ (_ :guard :display-name)]
      &match

      [:aggregation-options ag options]
      [:aggregation-options ag (assoc options :display-name metric-name)]

      _
      [:aggregation-options &match {:display-name metric-name}])))

(s/defn ^:private replace-metrics-aggregations-this-level :- mbql.s/MBQLQuery
  [inner-query :- mbql.s/MBQLQuery this-level-metric-id->info :- {su/IntGreaterThanZero MetricInfo}]
  (letfn [(metric [metric-id]
            (or (get this-level-metric-id->info metric-id)
                (throw (ex-info (tru "Metric {0} does not exist, or is invalid." metric-id)
                                {:type   :invalid-query
                                 :metric metric-id
                                 :query  inner-query}))))]
    (mbql.u/replace-in inner-query [:aggregation]
      ;; if metric is wrapped in aggregation options that give it a display name, expand the metric but do not name it
      [:aggregation-options [:metric (metric-id :guard (complement mbql.u/ga-id?))] (options :guard :display-name)]
      [:aggregation-options
       (metric-info->ag-clause (metric metric-id) {:use-metric-name-as-display-name? false})
       options]

      ;; if metric is wrapped in aggregation options that *do not* give it a display name, expand the metric and then
      ;; merge the options
      [:aggregation-options [:metric (metric-id :guard (complement mbql.u/ga-id?))] options]
      (let [[_ ag ag-options] (metric-info->ag-clause (metric metric-id) {:use-metric-name-as-display-name? true})]
        [:aggregation-options ag (merge ag-options options)])

      ;; otherwise for unwrapped metrics expand them in-place
      [:metric (metric-id :guard (complement mbql.u/ga-id?))]
      (metric-info->ag-clause (metric metric-id) {:use-metric-name-as-display-name? true}))))

(s/defn ^:private metric-ids-this-level :- (s/maybe #{su/IntGreaterThanZero})
  [inner-query]
  (when (map? inner-query)
    (when-let [aggregations (:aggregation inner-query)]
      (not-empty
       (set
        (mbql.u/match aggregations
          [:metric (metric-id :guard (complement mbql.u/ga-id?))]
          metric-id))))))

(s/defn ^:private expand-metrics-clauses-this-level :- (s/constrained
                                                        mbql.s/MBQLQuery
                                                        (complement metric-ids-this-level)
                                                        "Inner MBQL query with no :metric clauses at this level")
  [inner-query :- mbql.s/MBQLQuery metric-id->info :- {su/IntGreaterThanZero MetricInfo}]
  (let [this-level-metric-ids      (metric-ids-this-level inner-query)
        this-level-metric-id->info (select-keys metric-id->info this-level-metric-ids)]
    (-> inner-query
        (add-metrics-filters-this-level this-level-metric-id->info)
        (replace-metrics-aggregations-this-level this-level-metric-id->info))))

(s/defn ^:private expand-metrics-clauses :- su/Map
  "Add appropriate `filter` and `aggregation` clauses for a sequence of Metrics.

    (expand-metrics-clauses {:query {}} [[:metric 10]])
    ;; -> {:query {:aggregation [[:count]], :filter [:= [:field-id 10] 20]}}"
  [query :- su/Map metric-id->info :- (su/non-empty {su/IntGreaterThanZero MetricInfo})]
  (mbql.u/replace query
    (m :guard metric-ids-this-level)
    (-> m
        ;; expand this this level...
        (expand-metrics-clauses-this-level metric-id->info)
        ;; then recursively expand things at any other levels.
        (expand-metrics-clauses metric-id->info))))

(s/defn ^:private expand-metrics :- mbql.s/Query
  [query :- mbql.s/Query]
  (if-let [metrics (metrics query)]
    (expand-metrics-clauses query (metric-clauses->id->info metrics))
    query))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIDDLEWARE                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private expand-metrics-and-segments  :- mbql.s/Query
  "Expand the macros (`segment`, `metric`) in a `query`."
  [query  :- mbql.s/Query]
  (-> query
      expand-metrics
      expand-segments))

(defn- expand-macros*
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (expand-metrics-and-segments query)))

(defn expand-macros
  "Middleware that looks for `:metric` and `:segment` macros in an unexpanded MBQL query and substitute the macros for
  their contents."
  [qp]
  (fn [query rff context]
    (qp (expand-macros* query) rff context)))
