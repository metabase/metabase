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
            [metabase.query-processor.error-type :as qp.error-type]
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

(defn- replace-segment-clauses [query segment-id->definition]
  (mbql.u/replace-this-level query
    [:segment (segment-id :guard (complement mbql.u/ga-id?))]
    (or (:filter (segment-id->definition segment-id))
        (throw (ex-info (tru "Segment {0} does not exist, or is invalid." segment-id)
                        {:type qp.error-type/invalid-query})))))

(s/defn ^:private expand-segments :- mbql.s/MBQLQuery
  [query :- mbql.s/MBQLQuery]
  (let [segments (mbql.u/match-this-level query :segment)]
    (cond-> query
      segments (replace-segment-clauses (segment-clauses->id->definition segments)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    METRICS                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- metrics
  "Return a sequence of any (non-GA) `:metric` MBQL clauses in `query`."
  [query]
  ;; metrics won't be in a native query but they could be in source-query or aggregation clause
  (mbql.u/match-this-level query [:metric (_ :guard (complement mbql.u/ga-id?))]))

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

(s/defn ^:private add-metrics-filters :- mbql.s/MBQLQuery
  [query :- mbql.s/MBQLQuery metric-id->info :- {su/IntGreaterThanZero MetricInfo}]
  (let [filters (for [{{filter-clause :filter} :definition} (vals metric-id->info)
                      :when filter-clause]
                  filter-clause)]
    (reduce mbql.u/add-filter-clause-to-inner-query query filters)))

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

(s/defn ^:private replace-metrics-aggregations :- mbql.s/MBQLQuery
  [query :- mbql.s/MBQLQuery metric-id->info :- {su/IntGreaterThanZero MetricInfo}]
  (letfn [(metric [metric-id]
            (or (get metric-id->info metric-id)
                (throw (ex-info (tru "Metric {0} does not exist, or is invalid." metric-id)
                                {:type   :invalid-query
                                 :metric metric-id
                                 :query  query}))))]
    (mbql.u/replace-in query [:aggregation]
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

(s/defn ^:private metric-ids :- (s/maybe #{su/IntGreaterThanZero})
  [{aggregations :aggregation}]
  (when (seq aggregations)
    (not-empty
     (set
      (mbql.u/match aggregations
        [:metric (metric-id :guard (complement mbql.u/ga-id?))]
        metric-id)))))

(s/defn ^:private expand-metrics-clauses :- (s/constrained
                                             mbql.s/MBQLQuery
                                             (complement metric-ids)
                                             "Inner MBQL query with no :metric clauses at this level")
  "Add appropriate `filter` and `aggregation` clauses for a sequence of Metrics.

    (expand-metrics-clauses {:query {}} [[:metric 10]])
    ;; -> {:query {:aggregation [[:count]], :filter [:= [:field-id 10] 20]}}"
  [query :- mbql.s/MBQLQuery metric-id->info :- {su/IntGreaterThanZero MetricInfo}]
  (let [metric-ids      (metric-ids query)
        metric-id->info (select-keys metric-id->info metric-ids)]
    (-> query
        (add-metrics-filters metric-id->info)
        (replace-metrics-aggregations metric-id->info))))

(s/defn ^:private expand-metrics :- mbql.s/MBQLQuery
  [query :- mbql.s/MBQLQuery]
  (let [metrics (metrics query)]
    (cond-> query
      metrics (expand-metrics-clauses (metric-clauses->id->info metrics)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIDDLEWARE                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private expand-metrics-and-segments  :- mbql.s/MBQLQuery
  "Expand the macros (`segment`, `metric`) in a `query`."
  [query  :- mbql.s/MBQLQuery]
  (-> query
      expand-metrics
      expand-segments))

(defn expand-macros
  "Middleware that looks for `:metric` and `:segment` macros in an unexpanded MBQL query and substitute the macros for
  their contents."
  [{:qp/keys [query-type], :as query}]
  (cond-> query
    (= query-type :mbql) expand-metrics-and-segments))
