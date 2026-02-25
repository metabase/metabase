(ns metabase-enterprise.replacement.runner
  (:require
   [metabase-enterprise.replacement.execute :as execute]
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.source :as source]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(def noop-progress
  "No-op progress tracker for REPL / non-async usage."
  (reify execute/IRunnerProgress
    (set-total! [_ _total])
    (advance! [_])
    (advance! [_ _message])
    (canceled? [_] false)))

(defn- run-swap* [{:keys [direct transitive]} old-source new-source progress]
  (execute/set-total! progress (+ (count transitive)
                                  (count direct)))

  ;; phase 1: Upgrade all field refs
  (doseq [entity transitive]
    (field-refs/upgrade! entity)
    (execute/advance! progress))

  ;; phase 2: Swap the sources
  (let [failures (atom [])]
    (doseq [entity direct]
      (try
        (source-swap/do-swap! entity old-source new-source)
        (catch Exception e
          (log/warnf e "Failed to swap %s, continuing with next entity" entity)
          (swap! failures conj {:entity entity :error (ex-message e)})))
      (execute/advance! progress))
    (when (seq @failures)
      {:failures @failures})))

(mu/defn run-swap
  "Replace all usages of `old-source` with `new-source` across all dependent entities.

   Both arguments are [type id] pairs like [:card 123] or [:table 45].
   `progress` implements `IRunnerProgress` for tracking and cancellation.

   Example:
     (swap-source [:card 123] [:card 789])

   This finds all entities that depend on the old source and updates their queries
   to reference the new source instead.

   Returns {:swapped [...]} with the list of entities that were updated."
  ([old-source new-source]
   (run-swap old-source new-source noop-progress))
  ;; todo: replace schemas of  :- ::source/source-ref
  ([old-source
    new-source
    progress]
   (assert (:success (source/check-replace-source old-source new-source)))

   (let [transitive (usages/transitive-usages old-source)
         direct     (usages/direct-usages     old-source)]
     (run-swap* {:transitive transitive :direct direct}
                old-source new-source progress))))

