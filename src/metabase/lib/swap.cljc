(ns metabase.lib.swap
  (:require
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
   [metabase.util.log :as log]))

(defn- swap-failure-no-match [stage target-clause]
  (log/warn "No matching clause in swap-clauses" target-clause stage))

(defn- swap-failure-ambiguous [target-clause matches]
  (log/warn "Ambiguous match for clause in swap-clauses" target-clause matches))

(defn- uuid-match [stage target-clause]
  (let [target-uuid (lib.options/uuid target-clause)
        matches     (for [root  [:aggregation :breakout :expressions :filters :order-by]
                          index (range (count (get stage root)))
                          :let [path   [root index]
                                clause (get-in stage path)]
                          :when (= (lib.options/uuid clause) target-uuid)]
                      path)]
    (case (count matches)
      1 (first matches)
      0 (swap-failure-no-match stage target-clause)
      (swap-failure-ambiguous target-clause matches))))

(defn- do-swap [stage source-path target-path source-clause target-clause]
  (-> stage
      (assoc-in source-path target-clause)
      (assoc-in target-path source-clause)))

(defn swap-clauses
  "Given a `query` and `stage-number`, and two clauses, swaps the position of these two clauses in a list of clauses on
  this stage. Can be used to reorder clauses in the UI.

  Returns the query with the two clauses exchanged.

  If either clause is not found inside the same list, emits a warning and returns the query unchanged."
  [query stage-number source-clause target-clause]
  (let [stage       (lib.util/query-stage query stage-number)
        source-path (uuid-match stage source-clause)
        target-path (uuid-match stage target-clause)]
    (if (and source-path target-path)
      (lib.util/update-query-stage query stage-number do-swap source-path target-path source-clause target-clause)
      query)))
