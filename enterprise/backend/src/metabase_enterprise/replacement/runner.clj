(ns metabase-enterprise.replacement.runner
  (:require
   [metabase-enterprise.replacement.field-refs :as replacement.field-refs]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.source-swap :as replacement.source-swap]
   [metabase-enterprise.replacement.usages :as replacement.usages]
   [metabase-enterprise.replacement.util :as replacement.util]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

;; FIXME (bryan): we don't want to merge the compilation tracker into master
(def ^:dynamic *compilation-tracker*
  "When bound, called at phase boundaries: :before-upgrade, :after-upgrade, :after-swap.
   Signature: (fn [phase {:keys [entities db-id]}] ...)
   `entities` is the result of `bulk-load-metadata-for-entities!`: {[type id] loaded-object}
   `db-id` is the database ID the runner is using."
  nil)

(defn bulk-load-metadata-for-entities!
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
                                            (filter replacement.util/valid-query?)
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
      (merge {} cards tables transforms segments measures))))

(defn- run-swap* [{:keys [all-transitive-dependents]}
                  old-source new-source progress]
  (replacement.protocols/set-total! progress
                                    (+ (count all-transitive-dependents)  ;; phase 1: upgrade
                                       (count all-transitive-dependents))) ;; phase 2: swap

  (let [db-id      (case (first old-source)
                     :card  (t2/select-one-fn :database_id :model/Card :id (second old-source))
                     :table (t2/select-one-fn :db_id :model/Table :id (second old-source)))
        batch-size 500]

    (when *compilation-tracker*
      (lib-be/with-metadata-provider-cache
        (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
              loaded            (bulk-load-metadata-for-entities! metadata-provider all-transitive-dependents)]
          (*compilation-tracker* :before-upgrade {:entities loaded :db-id db-id}))))

    ;; phase 1: Upgrade field refs for ALL transitive dependents
    (doseq [batch (partition-all batch-size all-transitive-dependents)]
      (lib-be/with-metadata-provider-cache
        (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
              loaded            (bulk-load-metadata-for-entities! metadata-provider batch)]
          (doseq [entity batch
                  :let   [object (get loaded entity)]]
            ;; upgrade! knows how to handle all entity types including dashboards
            (replacement.field-refs/upgrade-field-refs! entity object)
            (replacement.protocols/advance! progress)))))

    (when *compilation-tracker*
      (lib-be/with-metadata-provider-cache
        (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
              loaded            (bulk-load-metadata-for-entities! metadata-provider all-transitive-dependents)]
          (*compilation-tracker* :after-upgrade {:entities loaded :db-id db-id}))))

    ;; phase 2: Swap sources for ALL transitive dependents (with batched metadata warming)
    (let [failures (atom [])]
      (doseq [batch (partition-all batch-size all-transitive-dependents)]
        (lib-be/with-metadata-provider-cache
          (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
                loaded            (bulk-load-metadata-for-entities! metadata-provider batch)]

            (doseq [entity batch
                    :let   [object (get loaded entity)]]
              (try
                (replacement.source-swap/swap-source! entity object old-source new-source)
                (catch Exception e
                  (log/warnf e "Failed to swap %s, continuing with next entity" entity)
                  (swap! failures conj {:entity entity :error (ex-message e)})))
              (replacement.protocols/advance! progress)))))

      (when *compilation-tracker*
        (lib-be/with-metadata-provider-cache
          (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
                loaded            (bulk-load-metadata-for-entities! metadata-provider all-transitive-dependents)]
            (*compilation-tracker* :after-swap {:entities loaded :db-id db-id}))))

      (when (seq @failures)
        {:failures @failures}))))

(defn run-swap
  "Replace all usages of `old-source` with `new-source` across all dependent entities.

   Both arguments are [type id] pairs like [:card 123] or [:table 45].
   `progress` implements `IRunnerProgress` for tracking and cancellation.

   Example:
     (swap-source [:card 123] [:card 789])

   This finds all entities that depend on the old source and updates their queries
   to reference the new source instead. This includes ALL transitive dependents,
   which is necessary for implicit joins to work correctly (e.g., when card D filters
   on Products.Category but is based on card C → card B → card A → Orders).

   Returns {:swapped [...]} with the list of entities that were updated."
  ([old-source new-source]
   (run-swap old-source new-source noop-progress))
  ([old-source
    new-source
    progress]
   (let [all-transitive (replacement.usages/transitive-usages old-source)]
     (run-swap* {:all-transitive-dependents all-transitive}
                old-source new-source progress))))
