(ns metabase-enterprise.replacement.runner
  (:require
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.source :as source]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase-enterprise.replacement.swap.viz :as swap.viz]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def noop-progress
  "No-op progress tracker for REPL / non-async usage."
  (reify replacement.protocols/IRunnerProgress
    (set-total! [_ _total])
    (advance! [_])
    (advance! [_ _n])
    (canceled? [_] false)))

(defn- run-swap* [{:keys [direct transitive direct-card-ids second-lvl-dash-ids]}
                  old-source new-source progress]
  (replacement.protocols/set-total! progress
                                    (+ (count transitive)
                                       (count direct)
                                       (count second-lvl-dash-ids)))

  ;; phase 1: Upgrade all field refs
  (doseq [entity transitive]
    (field-refs/upgrade! entity)
    (replacement.protocols/advance! progress))

  ;; phase 2: Swap the sources
  (let [failures (atom [])]
    (doseq [entity direct]
      (try
        (source-swap/do-swap! entity old-source new-source)
        (catch Exception e
          (log/warnf e "Failed to swap %s, continuing with next entity" entity)
          (swap! failures conj {:entity entity :error (ex-message e)})))
      (replacement.protocols/advance! progress))

    ;; phase 2b: Update second-level dashboard parameter targets
    (let [old-source-map (source-swap/source-ref->source-map old-source)
          new-source-map (source-swap/source-ref->source-map new-source)]
      (doseq [dashboard-id second-lvl-dash-ids]
        (try
          (swap.viz/dashboard-update-field-refs! dashboard-id old-source-map new-source-map (set direct-card-ids))
          (catch Exception e
            (log/warnf e "Failed to update second-level dashboard %d, continuing" dashboard-id)
            (swap! failures conj {:entity [:dashboard dashboard-id] :error (ex-message e)})))
        (replacement.protocols/advance! progress)))

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

   (let [transitive       (usages/transitive-usages old-source)
         direct           (usages/direct-usages     old-source)
         direct-card-ids  (into [] (comp (filter #(= :card (first %))) (map second)) direct)
         second-lvl-dash-ids (usages/second-level-dashboard-ids direct-card-ids)]
     (run-swap* {:transitive       transitive
                 :direct           direct
                 :direct-card-ids  direct-card-ids
                 :second-lvl-dash-ids second-lvl-dash-ids}
                old-source new-source progress))))
