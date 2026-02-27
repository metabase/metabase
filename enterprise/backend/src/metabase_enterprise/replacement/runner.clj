(ns metabase-enterprise.replacement.runner
  (:require
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.source :as source]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase-enterprise.replacement.swap.viz :as swap.viz]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util.log :as log]
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

(defn- bulk-load-metadata-for-entities!
  "Bulk load metadata for a batch of entities into the metadata provider cache.

  Fetches all card dataset queries in one query, converts them to lib queries, extracts all referenced entity IDs, and
  bulk loads all metadata. Entities are tuples from the dependency graph."
  [metadata-provider entities]
  (when-not (lib.metadata.protocols/cached-metadata-provider-with-cache? metadata-provider)
    (throw (ex-info "Must provided a cached metadata provider" {})))
  (letfn [(id->instances [m]
            (let [ids (into []
                            (comp (filter #(= m (first %)))
                                  (map second))
                            entities)]
              (when (seq ids)
                (into {}
                      (map (juxt (fn [o] [m (:id o)]) identity))
                      (t2/select (case m
                                   :card      :model/Card
                                   :table     :model/Table
                                   :transform :model/Transform
                                   :segment   :model/Segment
                                   :measure   :model/Measure)
                                 {:where [:in :id ids]})))))]
    (let [cards      (id->instances :card)
          tables     (id->instances :table)
          transforms (id->instances :transform)
          segments   (id->instances :segment)
          measures   (id->instances :measure)
          queries    (into []
                           (concat
                            ;; Card dataset queries
                            (eduction (comp (keep :dataset_query)
                                            (map #(lib/query metadata-provider %)))
                                      (vals cards))
                            ;; Transform query sources
                            (eduction (comp (keep :source)
                                            (filter #(= :query (:type %)))
                                            (keep :query)
                                            (map #(lib/query metadata-provider %)))
                                      (vals transforms))
                            ;; Segment definitions
                            (eduction (comp (keep :definition)
                                            (map #(lib/query metadata-provider %)))
                                      (vals segments))
                            ;; Measure definitions
                            (eduction (comp (keep :definition)
                                            (map #(lib/query metadata-provider %)))
                                      (vals measures))))]

      (when (seq queries)
        ;; Extract all referenced entity IDs across all queries
        (let [referenced-ids (lib/all-referenced-entity-ids queries)]
          ;; Bulk load all metadata at once
          (lib-be/bulk-load-query-metadata! metadata-provider referenced-ids)))
      (merge cards tables transforms segments measures))))

(defn- run-swap* [{:keys [direct transitive direct-card-ids second-lvl-dash-ids]}
                  old-source new-source progress]
  (replacement.protocols/set-total! progress
                                    (+ (count transitive)
                                       (count direct)
                                       (count second-lvl-dash-ids)))

  ;; phase 1: Upgrade all field refs with bulk metadata loading
  (let [db-id (case (first old-source)
                :card  (t2/select-one-fn :database_id :model/Card :id (second old-source))
                :table (t2/select-one-fn :db_id :model/Table :id (second old-source)))
        batch-size 500]

    ;; Process entities in batches, with a fresh metadata cache per batch
    (doseq [batch (partition-all batch-size transitive)]
      (lib-be/with-metadata-provider-cache
        (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
              loaded            (bulk-load-metadata-for-entities! metadata-provider batch)]
          (doseq [entity batch
                  :let [object (get loaded entity)]]
            (field-refs/upgrade! object)
            (replacement.protocols/advance! progress))))))

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

(defn run-swap
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
