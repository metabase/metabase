(ns metabase-enterprise.replacement.runner
  (:require
   [metabase-enterprise.replacement.execute :as execute]
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.source :as source]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.util.malli :as mu]))

(def noop-progress
  "No-op progress tracker for REPL / non-async usage."
  (reify execute/IRunnerProgress
    (set-total! [_ _total])
    (advance! [_])
    (advance! [_ _message])
    (canceled? [_] false)))

(mu/defn run-swap
  "Replace all usages of `old-source` with `new-source` across all dependent entities.

   Both arguments are [type id] pairs like [:card 123] or [:table 45].
   `progress` implements `IRunnerProgress` for tracking and cancellation.

   Example (without progress):
     (run-swap [:card 123] [:card 789])"
  ([old-source new-source]
   (run-swap old-source new-source noop-progress))
  ([old-source :- ::source/source-ref
    new-source :- ::source/source-ref
    progress   :- ::execute/runner-progress]
   ;; TODO (eric 2026-02-18): Check for cycles!
   (let [entities (usages/transitive-usages old-source)]
     (execute/set-total! progress (count entities))
     ;; phase 1: Upgrade all field refs
     (doseq [entity entities]
       (field-refs/upgrade! entity)
       (execute/advance! progress))
     ;; phase 2: Swap the sources — TODO: wire up when ready
     #_(let [found-usages (usages/usages old-source)]
         (doseq [[entity-type entity-id] found-usages]
           (update-entity entity-type entity-id old-source new-source))
         {:swapped (vec found-usages)}))))
