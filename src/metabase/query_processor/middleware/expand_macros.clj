(ns metabase.query-processor.middleware.expand-macros
  "Middleware for expanding `:metric` and `:segment` 'macros' in *unexpanded* MBQL queries.

  (`:metric` forms are expanded into aggregations and sometimes filter clauses, while `:segment` forms are expanded
  into filter clauses.)

   TODO - this namespace is ancient and written with MBQL '95 in mind, e.g. it is case-sensitive.
   At some point this ought to be reworked to be case-insensitive and cleaned up."
  (:require
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.schema.helpers :as helpers]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    SEGMENTS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- segment-clauses->id->definition [segment-clauses]
  (when-let [segment-ids (not-empty (into #{}
                                          (comp (map second)
                                                (filter integer?))
                                          segment-clauses))]
    (into {}
          (map (juxt :id :definition))
          (qp.store/bulk-metadata :metadata/segment segment-ids))))

(defn- replace-segment-clauses [outer-query segment-id->definition]
  (mbql.u/replace-in outer-query [:query]
    [:segment (segment-id :guard (complement mbql.u/ga-id?))]
    (or (:filter (segment-id->definition segment-id))
        (throw (IllegalArgumentException. (tru "Segment {0} does not exist, or is invalid." segment-id))))))

(mu/defn ^:private expand-segments :- mbql.s/Query
  "Recursively expand segments in the `query`."
  [query :- mbql.s/Query]
  (loop [{inner-query :query :as outer-query} query
         depth 0]
    (if-let [segments (mbql.u/match inner-query [:segment (_ :guard (complement mbql.u/ga-id?))])]
      (let [segment-id->definition (segment-clauses->id->definition segments)
            expanded-query (replace-segment-clauses outer-query segment-id->definition)]
        ;; Following line is in place to avoid infinite recursion caused by mutually recursive
        ;; segment definitions or other unforseen circumstances. Number 41 is arbitrary.
        (if (or (= expanded-query outer-query) (= depth 41))
          (throw (ex-info (tru "Segment expansion failed. Check mutually recursive segment definitions.")
                          {:type qp.error-type/invalid-query
                           :original-query query
                           :expanded-query expanded-query
                           :segment-id->definition segment-id->definition
                           :depth depth}))
          (recur expanded-query (inc depth))))
      outer-query)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    METRICS                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- metrics
  "Return a sequence of any (non-GA) `:metric` MBQL clauses in `query`."
  [query]
  ;; metrics won't be in a native query but they could be in source-query or aggregation clause
  (mbql.u/match query [:metric (_ :guard (complement mbql.u/ga-id?))]))

(def ^:private MetricInfo
  [:map
   [:id         ms/PositiveInt]
   [:name       ms/NonBlankString]
   [:definition [:map
                 [:aggregation [:tuple mbql.s/Aggregation]]
                 [:filter {:optional true} [:maybe mbql.s/Filter]]]]])

(defn- metric-info-validation-errors [metric-info]
  (me/humanize (mc/explain MetricInfo metric-info)))

(mu/defn ^:private metric-clauses->id->info :- [:map-of ms/PositiveInt MetricInfo]
  [metric-clauses :- [:sequential mbql.s/metric]]
  (when-let [metric-ids (not-empty (into #{}
                                         (map second)
                                         metric-clauses))]
    (into {}
          (comp (remove (fn [metric]
                          (when-let [errors (metric-info-validation-errors metric)]
                            (log/warn (trs "Invalid metric: {0} reason: {1}" metric errors))
                            errors)))
                (map (juxt :id #(select-keys % [:id :name :definition]))))
          (qp.store/bulk-metadata :metadata/metric metric-ids))))

(mu/defn ^:private add-metrics-filters-this-level :- mbql.s/MBQLQuery
  [inner-query                :- mbql.s/MBQLQuery
   this-level-metric-id->info :- [:map-of ms/PositiveInt MetricInfo]]
  (let [filters (for [{{filter-clause :filter} :definition} (vals this-level-metric-id->info)
                      :when filter-clause]
                  filter-clause)]
    (reduce mbql.u/add-filter-clause-to-inner-query inner-query filters)))

(mu/defn ^:private metric-info->ag-clause :- mbql.s/Aggregation
  "Return an appropriate aggregation clause from `metric-info`."
  [{{[aggregation] :aggregation} :definition, metric-name :name} :- MetricInfo
   {:keys [use-metric-name-as-display-name?]}                    :- [:map [:use-metric-name-as-display-name? :boolean]]]
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

(mu/defn ^:private replace-metrics-aggregations-this-level :- mbql.s/MBQLQuery
  [inner-query                :- mbql.s/MBQLQuery
   this-level-metric-id->info :- [:map-of ms/PositiveInt MetricInfo]]
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

(mu/defn ^:private metric-ids-this-level :- [:maybe [:set ms/PositiveInt]]
  [inner-query]
  (when (map? inner-query)
    (when-let [aggregations (:aggregation inner-query)]
      (not-empty
       (set
        (mbql.u/match aggregations
          [:metric (metric-id :guard (complement mbql.u/ga-id?))]
          metric-id))))))

(mu/defn ^:private expand-metrics-clauses-this-level :- [:and
                                                         mbql.s/MBQLQuery
                                                         [:fn
                                                          {:error/message "Inner MBQL query with no :metric clauses at this level"}
                                                          (complement metric-ids-this-level)]]
  [inner-query     :- mbql.s/MBQLQuery
   metric-id->info :- [:map-of ms/PositiveInt MetricInfo]]
  (let [this-level-metric-ids      (metric-ids-this-level inner-query)
        this-level-metric-id->info (select-keys metric-id->info this-level-metric-ids)]
    (-> inner-query
        (add-metrics-filters-this-level this-level-metric-id->info)
        (replace-metrics-aggregations-this-level this-level-metric-id->info))))

(mu/defn ^:private expand-metrics-clauses :- ms/Map
  "Add appropriate `filter` and `aggregation` clauses for a sequence of Metrics.

    (expand-metrics-clauses {:query {}} [[:metric 10]])
    ;; -> {:query {:aggregation [[:count]], :filter [:= [:field-id 10] 20]}}"
  [query :- ms/Map metric-id->info :- (helpers/non-empty [:map-of ms/PositiveInt MetricInfo])]
  (mbql.u/replace query
    (m :guard metric-ids-this-level)
    (-> m
        ;; expand this this level...
        (expand-metrics-clauses-this-level metric-id->info)
        ;; then recursively expand things at any other levels.
        (expand-metrics-clauses metric-id->info))))

(mu/defn ^:private expand-metrics :- mbql.s/Query
  [query :- mbql.s/Query]
  (if-let [metrics (metrics query)]
    (expand-metrics-clauses query (metric-clauses->id->info metrics))
    query))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIDDLEWARE                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private expand-metrics-and-segments  :- mbql.s/Query
  "Expand the macros (`segment`, `metric`) in a `query`."
  [query  :- mbql.s/Query]
  (-> query
      expand-metrics
      expand-segments))

(defn expand-macros
  "Middleware that looks for `:metric` and `:segment` macros in an unexpanded MBQL query and substitute the macros for
  their contents."
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (expand-metrics-and-segments query)))
