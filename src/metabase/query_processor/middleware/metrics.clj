(ns metabase.query-processor.middleware.metrics
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]))

(defn- expression-with-name-from-source
  [query [_ {:lib/keys [expression-name]} :as expression]]
  (lib/expression query expression-name expression))

(defn- replace-metric-aggregation-refs [aggregation metric-name lookup]
  (lib.util.match/replace
   aggregation
    [:metric & (_ :guard (fn [[{:keys [join-alias]} metric-id]]
                           (contains? lookup [join-alias metric-id])))]
    (let [[_ {:keys [join-alias]} metric-id] &match]
      (update (lib.util/fresh-uuids
                (get lookup [join-alias metric-id]))
              1
              merge
              {:name (u/slugify (or join-alias metric-name))}
              (select-keys (get &match 1) [:lib/uuid :name])))))

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
  (let [metric-refs (volatile! {})
        stage-metric (volatile! [])]
    (lib.walk/walk
      query
      (fn [_query path-type _path stage-or-join]
        (cond
          (= path-type :lib.walk/join)
          (let [[source-card aggregation] @stage-metric]
            (vswap! metric-refs assoc [(:alias stage-or-join) source-card] aggregation)
            (vreset! stage-metric [])
            stage-or-join)

          (= path-type :lib.walk/stage)
          (let [{:keys [source-card filters joins aggregation expressions breakout order-by]} stage-or-join
                source-metadata (some->> source-card (lib.metadata/card query))
                metric-name (:name source-metadata)]
            (if (= (:type source-metadata) :metric)
              (let [source-query (expand (-> query
                                             (lib/query (:dataset-query source-metadata))
                                             lib.util/fresh-query-instance))
                    metric-aggregation (-> source-query lib/aggregations first)
                    _ (vreset! stage-metric [source-card metric-aggregation])
                    new-aggregations (replace-metric-aggregation-refs
                                       aggregation
                                       metric-name
                                       (assoc @metric-refs [nil source-card] metric-aggregation))]
                (as-> source-query $q
                  (lib.util/update-query-stage $q -1 dissoc :aggregation :breakout :order-by :fields)

                  (reduce lib/join $q joins)
                  (reduce lib/filter $q filters)
                  (reduce lib/breakout $q breakout)
                  (reduce lib/aggregate $q new-aggregations)
                  (reduce expression-with-name-from-source $q expressions)
                  (reduce lib/order-by $q order-by)
                  (:stages $q)))
              (m/update-existing stage-or-join :aggregation replace-metric-aggregation-refs metric-name @metric-refs))))))))
