(ns metabase-enterprise.replacement.convert
  "Execute a transform and replace all usages of a source entity with the output table.

   The FE creates the transform via the transforms API. This module re-runs it,
   finds the output table, and replaces all dependents of the source entity."
  (:require
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.runner :as replacement.runner]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms.core :as transforms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-canceled!
  "Throw if the run has been canceled."
  [progress]
  (when (replacement.protocols/canceled? progress)
    (throw (ex-info "Run canceled" {}))))

(defn replace-source-with-transform!
  "Execute a transform, find its output table, and replace all usages of the source
   entity with that table.

   Called as the work-fn inside execute-async!. Progress stays null during transform
   execution/sync, then tracks 0→1 during source replacement.

   Note: DB-polling cancellation differs from the transforms system's core.async
   cancellation, so a cancelled run may produce a \"failed\" transform_run.

   Options:
   - `:unpersist-card?` — when true and source is a card, unpersist the model after
     replacement (default false).
   - `:archive-card?` — when true and source is a card, archive the card after all
     steps are done (default false)."
  [source-type source-id transform-id progress
   {:keys [unpersist-card? archive-card?] :or {unpersist-card? false archive-card? false}}]
  (let [transform (t2/select-one :model/Transform :id transform-id)
        _         (when-not transform
                    (throw (ex-info "Transform not found" {:transform-id transform-id})))

        ;; --- Phase 1: Execute transform (synchronous — also syncs the output table) ---
        _         (transforms/execute! transform {:run-method :manual})
        _         (check-canceled! progress)

        ;; --- Phase 2: Find output table ---
        target-db-id (transforms-base.i/target-db-id transform)
        target       (:target transform)
        table-name   (:name target)
        table-schema (or (:schema target) "transforms")
        table        (t2/select-one :model/Table
                                    :db_id target-db-id
                                    :schema table-schema
                                    :name table-name
                                    :active true)
        _            (when-not table
                       (throw (ex-info "Output table not found after transform execution"
                                       {:db-id target-db-id :schema table-schema :name table-name})))
        _            (replacement.protocols/update-target! progress :table (:id table))
        _            (check-canceled! progress)]

    ;; --- Phase 3: Replace all usages (0 → 1) ---
    (replacement.runner/run-swap [source-type source-id] [:table (:id table)] progress)

    ;; --- Phase 4: Unpersist model ---
    (when unpersist-card?
      (when-let [persisted-info (t2/select-one :model/PersistedInfo :card_id source-id)]
        (model-persistence/mark-for-pruning! {:id (:id persisted-info)} "off")))

    ;; --- Phase 5: Archive card ---
    (when (and archive-card? (= source-type :card))
      (t2/update! :model/Card source-id {:archived true}))))
