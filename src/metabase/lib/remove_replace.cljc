(ns metabase.lib.remove-replace
  (:require
   [metabase.lib.common :as lib.common]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.match]
   [metabase.util.malli :as mu]))

(defn- find-reference-clause
  [query stage-number target-clause]
  (let [stage (lib.util/query-stage query stage-number)
        [target-type _opts target-id] target-clause]
    (->> [:order-by :aggregation :breakout :filters :expressions :joins :fields]
         (keep (fn [top-level-clause]
                 (mbql.match/match-one (get stage top-level-clause)
                   [target-type _ target-id] top-level-clause)))
         (set)
         (not-empty))))

(defn- target-ref-for-stage
  "Gets the ref for the target-id exposed by the previous stage"
  [query stage-number target-id]
  (let [stage (lib.util/query-stage query stage-number)]
    (->> (lib.metadata.calculation/visible-columns query stage-number stage)
         (some (fn [{:keys [lib/source id] :as column}]
                 (when (and (= :source/previous-stage source) (= target-id id))
                   (lib.ref/ref column)))))))

(defn- check-subsequent-stages-for-invalid-target!
  "Throws if target-clause is used in a subsequent stage"
  [previous-query query stage-number target-clause]
  (let [[_ _ target-id] target-clause]
    (loop [stage-number stage-number]
      (when-let [next-stage-number (lib.util/next-stage-number query stage-number)]
        ;; The target could still be exposed (i.e. removing the last breakout could expose itself through default fields)
        (when-not (target-ref-for-stage query next-stage-number target-id)
          ;; Get the ref to look for from the previous-query
          (let [target-ref (target-ref-for-stage previous-query next-stage-number target-id)]
            (if-let [found (find-reference-clause query next-stage-number target-ref)]
              (throw (ex-info "Clause cannot be removed as it has dependents" {:target-clause target-clause
                                                                               :stage-number next-stage-number
                                                                               :found found}))
              (recur next-stage-number))))))))

(defn- remove-replace* [query stage-number target-clause remove-replace-fn]
  (let [join-indices (range (count (lib.join/joins query stage-number)))
        join-condition-paths (for [idx join-indices]
                               [:joins idx :conditions])
        join-field-paths (for [idx join-indices]
                           [:joins idx :fields])]
    (reduce
      (fn [query location]
        (let [target-clause (lib.common/->op-arg query stage-number target-clause)
              result (lib.util/update-query-stage query stage-number
                                                  remove-replace-fn location target-clause)]
          (when (not= query result)
            (mbql.match/match location
              (:or
                [:breakout]
                [:fields]
                [:joins _ :fields]) (check-subsequent-stages-for-invalid-target! query result stage-number (lib.ref/ref target-clause)))
            (reduced result))
          result))
      query
      ;; TODO only these top level clauses are supported at this moment
      (concat [[:order-by] [:breakout] [:filters] [:fields]]
              join-field-paths
              join-condition-paths))))

(mu/defn remove-clause :- :metabase.lib.schema/query
  "Removes the `target-clause` in the filter of the `query`."
  ([query :- :metabase.lib.schema/query
    target-clause]
   (remove-clause query -1 target-clause))
  ([query :- :metabase.lib.schema/query
    stage-number :- :int
    target-clause]
   (remove-replace* query stage-number target-clause lib.util/remove-clause)))

(mu/defn replace-clause :- :metabase.lib.schema/query
  "Replaces the `target-clause` with `new-clause` in the `query` stage."
  ([query :- :metabase.lib.schema/query
    target-clause
    new-clause]
   (replace-clause query -1 target-clause new-clause))
  ([query :- :metabase.lib.schema/query
    stage-number :- :int
    target-clause
    new-clause]
   (let [replacement (lib.common/->op-arg query stage-number new-clause)]
     (remove-replace* query stage-number target-clause #(lib.util/replace-clause %1 %2 %3 replacement)))))
