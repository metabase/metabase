(ns metabase.query-processor.middleware.metrics
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]))

(defn- replace-metric-aggregation-refs [x lookup]
  (lib.util.match/replace
    x
    [:metric & (_ :guard (fn [[{:keys [join-alias]} metric-id]]
                           (contains? lookup [join-alias metric-id])))]
    (let [[_ {:keys [join-alias]} metric-id] &match
          {replacement :aggregation metric-name :name} (get lookup [join-alias metric-id])]
      (update (lib.util/fresh-uuids replacement)
              1
              merge
              {:name (u/slugify (or join-alias metric-name))}
              (select-keys (get &match 1) [:lib/uuid :name])))))

(defn- update-metric-stages [query stages metric-ref-lookup joining?]
  (let [source-card-fn :qp/stage-is-from-source-card
        [source-parts non-source-parts & other] (partition-by source-card-fn stages)
        source-metadata (some->> source-parts first source-card-fn (lib.metadata/card query))
        metric-name (:name source-metadata)
        empty-stage? (and joining?
                          (= 1 (count non-source-parts)))]
    (if (= (:type source-metadata) :metric)
      (let [last-source (last source-parts)
            {:keys [breakout joins filters aggregation order-by limit expressions]} (first non-source-parts)
            metric-aggregation (-> last-source :aggregation first)
            source-card (:id source-metadata)
            _ (vswap! metric-ref-lookup assoc [nil source-card] {:name metric-name :aggregation metric-aggregation})
            new-aggregations (replace-metric-aggregation-refs
                               aggregation
                               @metric-ref-lookup)
            new-stage (cond-> last-source
                        :always (dissoc :aggregation :breakout :order-by :fields :limit)
                        (seq joins) (update :joins (fnil into []) joins)
                        (seq filters) (update :filters (fnil into []) filters)
                        (seq breakout) (assoc :breakout breakout)
                        (seq expressions) (update :expressions (fnil into []) expressions)
                        (seq aggregation) (assoc :aggregation new-aggregations)
                        limit (assoc :limit limit)
                        (seq order-by) (assoc :order-by order-by))
            combined-stages (vec (concat (butlast source-parts)
                                         [new-stage]
                                         (if empty-stage?
                                           non-source-parts
                                           (rest non-source-parts))
                                         (apply concat other)))]
        (if (seq other)
          (recur query combined-stages metric-ref-lookup joining?)
          combined-stages))
      stages)))

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
  (let [;; Holds joined metrics to replace `[:metric {:join-alias x} y]` with the appropriate aggregation expression
        metric-ref-lookup (volatile! {})
        query (lib.walk/walk
                query
                (fn [_query path-type _path stage-or-join]
                  (case path-type
                    :lib.walk/join
                    (let [result (update stage-or-join :stages #(update-metric-stages query % metric-ref-lookup true))]
                      (vswap! metric-ref-lookup update-keys (fn [[lookup-alias lookup-card]]
                                                              (if-not lookup-alias
                                                                [(:alias stage-or-join) lookup-card]
                                                                [lookup-alias lookup-card])))
                      result)
                    stage-or-join)))
        new-stages (update-metric-stages query (:stages query) metric-ref-lookup false)]
    (replace-metric-aggregation-refs
      (assoc query :stages new-stages)
      @metric-ref-lookup)))
