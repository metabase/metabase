(ns metabase.query-processor.middleware.metrics
  (:require
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- replace-metric-aggregation-refs [x lookup]
  (lib.util.match/replace x
    [:metric _ metric-id]
    (if-let [{replacement :aggregation metric-name :name} (get lookup metric-id)]
      (update (lib.util/fresh-uuids replacement)
              1
              merge
              {:name metric-name}
              (select-keys (get &match 1) [:lib/uuid :name]))
      (throw (ex-info "Incompatible metric" {:match &match
                                             :lookup lookup})))))

(defn- find-metric-ids
  [x]
  (lib.util.match/match x
    [:metric _ (id :guard pos-int?)]
    id))

(defn- fetch-referenced-metrics
  [query stage]
  (let [metric-ids (find-metric-ids stage)]
    (->> metric-ids
         (lib.metadata/bulk-metadata-or-throw query :metadata/card)
         (into {}
               (map (fn [card-metadata]
                      (let [metric-query (lib.convert/->pMBQL
                                           ((requiring-resolve 'metabase.query-processor.preprocess/preprocess)
                                            (lib/query query (:dataset-query card-metadata))))]
                        [(:id card-metadata)
                         {:query metric-query
                          :aggregation (first (lib/aggregations metric-query))
                          :name (:name card-metadata)}]))))
         not-empty)))

(defn- expression-with-name-from-source
  [query [_ {:lib/keys [expression-name]} :as expression]]
  (lib/expression query 0 expression-name expression))

(defn- temp-query-at-stage-path
  [query stage-path]
  (cond-> query
    stage-path (lib.walk/query-for-stage-at-path stage-path)
    stage-path :query))

(defn splice-compatible-metrics
  "Splices in metric definitions that are compatible with the query."
  [query path expanded-stages]
  (if-let [lookup (fetch-referenced-metrics query (:aggregation (first expanded-stages)))]
    (let [new-query (reduce
                      (fn [query [_metric-id {metric-query :query}]]
                        (if (and (= (lib.util/source-table-id query) (lib.util/source-table-id metric-query))
                                 (= 1 (lib/stage-count metric-query)))
                          (let [{:keys [expressions filters]} (lib.util/query-stage metric-query 0)]
                            (as-> query $q
                              (reduce expression-with-name-from-source $q expressions)
                              (reduce lib/filter $q filters)
                              (update-in $q [:stages 0 :aggregation] replace-metric-aggregation-refs lookup)))
                          (throw (ex-info "Incompatible metric" {:query query
                                                                 :metric metric-query}))))
                      (temp-query-at-stage-path query path)
                      lookup)]
      (:stages new-query))
    expanded-stages))

(defn- find-metric-transition
  "Finds an unadjusted transition between a metric source-card and the next stage."
  [query expanded-stages]
  (some (fn [[[idx-a stage-a] [_idx-b stage-b]]]
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
              [idx-a metric-metadata])))
        (partition-all 2 1 (m/indexed expanded-stages))))

(defn- update-metric-transition-stages
  "Adjusts source-card metrics referencing themselves in the next stage.

   The final stage of the metric is adjusted by removing:
   ```
     :aggregation
     :breakout
     :order-by
   ```

   `:fields` are added explictly to pass previous-stage fields onto the following-stage

   The following stages will have `[:metric {} id]` clauses
   replaced with the actual aggregation of the metric."
  [query stage-path expanded-stages idx metric-metadata]
  (mu/disable-enforcement
    (let [[pre-transition-stages [last-metric-stage following-stage & following-stages]] (split-at idx expanded-stages)
          metric-name (:name metric-metadata)
          metric-aggregation (-> last-metric-stage :aggregation first)
          stage-query (temp-query-at-stage-path query stage-path)
          last-metric-stage-number idx
          stage-query (update-in stage-query
                                 [:stages idx]
                                 (fn [stage]
                                   (dissoc stage :breakout :order-by :aggregation :fields :lib/stage-metadata)))
          ;; Needed for field references to resolve further in the pipeline
          stage-query (lib/with-fields stage-query idx (lib/fieldable-columns stage-query idx))
          new-metric-stage (lib.util/query-stage stage-query last-metric-stage-number)
          lookup {(:id metric-metadata)
                  {:name metric-name :aggregation metric-aggregation}}
          new-following-stage (replace-metric-aggregation-refs
                                following-stage
                                lookup)
          combined-stages (vec (remove nil? (concat pre-transition-stages
                                                    [new-metric-stage new-following-stage]
                                                    following-stages)))]
      combined-stages)))

(defn- adjust-metric-stages
  "`expanded-stages` are the result of :stages from fetch-source-query.
   All source-card stages have been spliced in already.

   To adjust:

   We look for the transition between the last stage of a metric and the next stage following it.
   We adjust those two stages - as explained in `expand`.
   "
  [query path expanded-stages]
  ;; Find a transition point, if it exists
  (let [[idx metric-metadata] (find-metric-transition query expanded-stages)
        [first-stage] expanded-stages]
    (cond
      idx
      (recur query path (update-metric-transition-stages query path expanded-stages idx metric-metadata))

      (:source-table first-stage)
      (splice-compatible-metrics query path expanded-stages)

      :else
      expanded-stages)))

(defn adjust
  "Looks for `[:metric {} id]` clause references and adjusts the query accordingly.

   Expects stages to have been processed by `fetch-source-query/resolve-source-cards`
   such that source card stages have been spliced in across the query.

   Metrics can be referenced in two scenarios:
   1. Compatible source table metrics.
      Multiple metrics can be referenced in the first stage of a query that references a `:source-table`
      Those metrics must:
      - Be single stage metrics.
      - Have the same `:source-table` as the query
   2. Metric source cards can reference themselves.
      A query built from a `:source-card` of `:type :metric` can reference itself."
  [query]
  (let [query (lib.walk/walk
                query
                (fn [_query path-type path stage-or-join]
                  (when (= path-type :lib.walk/join)
                    (update stage-or-join :stages #(adjust-metric-stages query path %)))))]
    (u/prog1
      (update query :stages #(adjust-metric-stages query nil %))
      (when-let [metric (lib.util.match/match-one <>
                          [:metric _ _] &match)]
        (log/warn "Failed to replace metric"
                  (pr-str {:metric metric}))))))
