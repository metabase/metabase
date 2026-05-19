(ns metabase.agent-lib.repair.context
  "Context-specific structured-program repair passes."
  (:require
   [metabase.agent-lib.repair.context.passes :as passes]
   [metabase.agent-lib.repair.stages :as stages]))

(set! *warn-on-reflection* true)

(defn repair-program-for-context
  "Apply deterministic repairs that depend on the evaluation context."
  [program context]
  (let [source     (passes/effective-source-for-context program context)
        operations (->> (:operations program)
                        (passes/drop-source-metric-stage-aggregates context)
                        (passes/drop-source-metric-stage-with-fields context)
                        (map #(passes/normalize-source-metric-quarter-window context %))
                        (passes/remove-redundant-operations context)
                        vec)]
    (assoc program
           :operations (stages/insert-stage-boundaries source operations))))
