(ns metabase.query-processor.middleware.metrics
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]))

(defn- expression-with-name-from-source
  [query [_ {:lib/keys [expression-name]} :as expression]]
  (lib/expression query expression-name expression))

(defn expand
  "Expand `:source-card` of `:type` `:metric` into an expanded query combining this query with sources.

   How various clauses are combined.
   ```
      :expressions - combine with source metric
      :aggregation - use stage, replace :metric reference with source aggregation
      :filters     - combine with source metric
      :breakout    - should be ignored on source metric, and already copied onto consumer by `query`
      :order-by    - should not exist on source metric
      :joins       - should not exist on stage
      :fields      - should not exist on either
   ```
   "
  [query]
  (lib.walk/walk-stages
    query
    (fn [_query _path {:keys [source-card filters aggregation expressions breakout order-by] :as stage}]
      (let [source-metadata (some->> source-card (lib.metadata/card query))]
        (if (= (:type source-metadata) :metric)
          (let [source-query (expand (lib/query query (:dataset-query source-metadata)))
                source-aggregations (lib/aggregations source-query)
                new-aggregations (->> (lib.util.match/replace aggregation
                                                              [:metric {} source-card] (first source-aggregations))
                                      lib.util/fresh-uuids)]
            (as-> source-query $q
              (lib.util/update-query-stage $q -1 dissoc :aggregation :breakout :order-by :fields)
              (reduce lib/filter $q filters)
              (reduce lib/breakout $q breakout)
              (reduce lib/order-by $q order-by)
              (reduce expression-with-name-from-source $q expressions)
              (reduce lib/aggregate $q new-aggregations)
              (:stages $q)))
          stage)))))
