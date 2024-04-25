(ns metabase.query-processor.middleware.metrics
  (:require
   [medley.core :as m]
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

(defn- adjust-metric-stages
  "`expanded-stages` are the result of :stages from fetch-source-query.
   All source-card stages have been spliced in already.

   `metric-ref-lookup` this is a volatile that holds references to the original aggragation clause (count, sum etc...)
   it is used to replace `[:metric {} id]` clauses. This depends on the order of `walk` as each join is touched depth-first,
   a ref-lookup will be added for any metrics found during the stage.

   To adjust:

   We look for the transition between the last stage of a metric and the next stage following it.
   We adjust those two stages - as explained in `expand`.
   "
  [query expanded-stages metric-ref-lookup]
  ;; Find a transition point, if it exists
  (let [[idx metric-metadata] (some (fn [[[_idx-a stage-a] [idx-b stage-b]]]
                                      (let [stage-a-source (:qp/stage-is-from-source-card stage-a)
                                            metric-metadata (some->> stage-a-source (lib.metadata/card query))]
                                        (when (and
                                                stage-a-source
                                                (not= stage-a-source (:qp/stage-is-from-source-card stage-b))
                                                (= (:type metric-metadata) :metric)
                                                ;; This indicates this stage has not been processed
                                                ;; because metrics must have aggregations
                                                ;; if it is missing, then it has been removed in this process
                                                (:aggregation stage-a))
                                          [idx-b metric-metadata])))
                                    (partition-all 2 1 (m/indexed expanded-stages)))]
    (if idx
      (let [[pre-transition-stages following-stages] (split-at idx expanded-stages)
            metric-name (:name metric-metadata)
            last-metric-stage (last pre-transition-stages)
            metric-aggregation (-> last-metric-stage :aggregation first)
            new-metric-stage (cond-> last-metric-stage
                                 :always (dissoc :aggregation :fields)
                                 (seq following-stages) (dissoc :breakout :order-by :limit))
            ;; Store lookup for metric references created in this set of stages.
            ;; These will be adjusted later if these stages are in a join
            _ (vswap! metric-ref-lookup assoc [nil (:id metric-metadata)] {:name metric-name :aggregation metric-aggregation})
            new-following-stages (replace-metric-aggregation-refs
                                  following-stages
                                  @metric-ref-lookup)
            combined-stages (vec (remove nil? (concat (butlast pre-transition-stages) [new-metric-stage] new-following-stages)))]
        (recur query combined-stages metric-ref-lookup))
      expanded-stages)))

(defn adjust
  "Adjusts the final and following stages of `:source-card` of `:type` `:metric`.

   Expects stages to have been processed by `fetch-source-query/resolve-source-cards`
   such that source card stages have been spliced in across the query.

   The final stage of metric is adjusted by:
   ```
   :aggregation - always removed
   :breakout    - removed if there are following-stages
   :order-by    - removed if there are following-stages
   :limit       - removed if there are following-stages
   :fields      - always removed
   ```

   Stages following this, and stages further up the query hierarchy will have
   `[:metric {} id]` clauses replaced with the actual aggregation of the metric.
   "
  [query]
  (let [;;  Once the stages are processed any ref-lookup missing a join alias must have
        ;; come from this join's stages, so further references must include the join alias.
        metric-ref-lookup (volatile! {})
        query (lib.walk/walk
                query
                (fn [_query path-type _path stage-or-join]
                  (case path-type
                    :lib.walk/join
                    (let [result (update stage-or-join :stages #(adjust-metric-stages query % metric-ref-lookup))]
                      ;; Once the stages are processed any ref-lookup missing a join alias must have
                      ;; come from this join's stages, so further references must include the join alias.
                      (vswap! metric-ref-lookup #(m/map-kv (fn [[lookup-alias lookup-card] v]
                                                             [(if-not lookup-alias
                                                                [(:alias stage-or-join) lookup-card]
                                                                [lookup-alias lookup-card])
                                                              (lib.util.match/replace
                                                                v
                                                                [:field (_ :guard (complement :join-alias)) _]
                                                                (update &match 1 assoc :join-alias (:alias stage-or-join)))])
                                                           %))
                      result)
                    stage-or-join)))
        new-stages (adjust-metric-stages query (:stages query) metric-ref-lookup)]
    (u/prog1
      (replace-metric-aggregation-refs
        (assoc query :stages new-stages)
        @metric-ref-lookup)
      (when-let [match (lib.util.match/match-one <>
                         [:metric {} _] &match)]
        (throw (ex-info "Failed to replace metric" {:match match
                                                    :lookup @metric-ref-lookup}))))))
