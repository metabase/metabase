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
   (fn [_query _path {:keys [source-card joins filters aggregation expressions breakout order-by] :as stage}]
     (let [source-metadata (some->> source-card (lib.metadata/card query))]
       (if (= (:type source-metadata) :metric)
         (let [source-query (expand (-> query
                                        (lib/query (:dataset-query source-metadata))
                                        lib.util/fresh-query-instance))
               metric-aggregation (-> source-query lib/aggregations first)
               new-aggregations (lib.util.match/replace aggregation
                                  [:metric {} source-card]
                                  (let [orig-name (get-in &match [1 :name])]
                                    (cond-> (lib.util/fresh-uuids metric-aggregation)
                                      :always   (assoc-in [1 :lib/uuid] (get-in &match [1 :lib/uuid]))
                                      orig-name (assoc-in [1 :name] orig-name))))]
           (as-> source-query $q
             (lib.util/update-query-stage $q -1 dissoc :aggregation :breakout :order-by :fields)
             (reduce lib/join $q joins)
             (reduce lib/filter $q filters)
             (reduce lib/breakout $q breakout)
             (reduce lib/aggregate $q new-aggregations)
             (reduce expression-with-name-from-source $q expressions)
             (reduce lib/order-by $q order-by)
             (:stages $q)))
         stage)))))
