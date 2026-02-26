(ns metabase-enterprise.replacement.runner
  (:require
   [metabase-enterprise.replacement.execute :as execute]
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.source :as source]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase-enterprise.replacement.swap.viz :as swap.viz]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.source-swap :as lib-be.source-swap]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def noop-progress
  "No-op progress tracker for REPL / non-async usage."
  (reify replacement.protocols/IRunnerProgress
    (set-total! [_ _total])
    (advance! [_])
    (advance! [_ _n])
    (canceled? [_] false)
    (start-run! [_])
    (succeed-run! [_])
    (fail-run! [_ _throwable])))

(defn- build-field-id-mapping
  "Build a field-id-mapping for the swap from old-source to new-source.
  Returns nil when no mapping is needed (e.g. card→card swaps)."
  [[old-type old-id] [new-type new-id]]
  (let [db-id  (case old-type
                 :card  (t2/select-one-fn :database_id :model/Card :id old-id)
                 :table (t2/select-one-fn :db_id :model/Table :id old-id))
        _      (assert (some? db-id) (format "Could not find %s %d for field-id-mapping" (name old-type) old-id))
        mp     (lib-be/application-database-metadata-provider db-id)
        source (case old-type
                 :card  (lib.metadata/card mp old-id)
                 :table (lib.metadata/table mp old-id))
        query  (lib/query mp source)]
    (lib-be.source-swap/build-swap-field-id-mapping
     query
     {:type old-type :id old-id}
     {:type new-type :id new-id})))

(defn- run-swap* [{:keys [direct transitive field-id-mapping direct-card-ids second-lvl-dash-ids]}
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
        (source-swap/do-swap! entity old-source new-source field-id-mapping)
        (catch Exception e
          (log/warnf e "Failed to swap %s, continuing with next entity" entity)
          (swap! failures conj {:entity entity :error (ex-message e)})))
      (replacement.protocols/advance! progress))

    ;; phase 2b: Update second-level dashboard parameter targets
    (doseq [dashboard-id second-lvl-dash-ids]
      (try
        (swap.viz/dashboard-update-field-refs! dashboard-id field-id-mapping (set direct-card-ids))
        (catch Exception e
          (log/warnf e "Failed to update second-level dashboard %d, continuing" dashboard-id)
          (swap! failures conj {:entity [:dashboard dashboard-id] :error (ex-message e)})))
      (replacement.protocols/advance! progress))

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
         field-id-mapping (build-field-id-mapping old-source new-source)
         direct-card-ids  (into [] (comp (filter #(= :card (first %))) (map second)) direct)
         second-lvl-dash-ids (when (some? field-id-mapping)
                               (usages/second-level-dashboard-ids direct-card-ids))]
     (run-swap* {:transitive       transitive
                 :direct           direct
                 :field-id-mapping field-id-mapping
                 :direct-card-ids  direct-card-ids
                 :second-lvl-dash-ids second-lvl-dash-ids}
                old-source new-source progress))))
