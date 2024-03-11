(ns metabase.query-processor.middleware.metrics
  (:require
    [metabase.lib.core :as lib]
    [metabase.lib.metadata :as lib.metadata]
    [metabase.lib.util :as lib.util]
    [metabase.lib.walk :as lib.walk]
    [metabase.mbql.util :as mbql.u]))

(defn- expression-with-name-from-source
  [query [_ {:lib/keys [expression-name]} :as expression]]
  (lib/expression query expression-name expression))

(defn- reduce-threaded
  [init f coll]
  (reduce f init coll))

(defn expand
  "Expand `:sources` into an expanded query combining this query with sources.

   How various clauses are combined.
   ```
      :expressions - combine with source metric
      :aggregation - use stage, replace :metric reference with source aggregation
      :filters     - combine with source metric
      :breakout    - should not exist on source metric, metric-dimensions
      :order-by    - should not exist on source metric
      :joins       - should not exist on stage
      :fields      - should not exist on either
   ```
   "
  [query]
  (lib.walk/walk-stages
    query
    (fn [_query _path {:keys [sources filters aggregation expressions breakout order-by] :as stage}]
      (if-let [source-metric (when (every? (comp #{:source/metric} :lib/type) sources)
                               (:id (first sources)))] ;; Ignore multiple metrics for now
        (let [source-metric-card (lib.metadata/card query source-metric)
              source-query (expand (lib/query query (:dataset-query source-metric-card)))
              source-aggregations (lib/aggregations source-query)
              new-aggregations (->> (mbql.u/replace aggregation
                                      [:metric {} source-metric] (first source-aggregations))
                                    lib.util/fresh-uuids)]
          (-> source-query
              (lib.util/update-query-stage -1 dissoc :aggregation :breakout :order-by :fields)
              (reduce-threaded lib/filter filters)
              (reduce-threaded lib/breakout breakout)
              (reduce-threaded lib/order-by order-by)
              (reduce-threaded expression-with-name-from-source expressions)
              (reduce-threaded lib/aggregate new-aggregations)
              :stages))
        stage))))
