(ns metabase-enterprise.replacement.convert
  "Logic for converting a model (card) to a transform and replacing all usages.

   A failed convert run may leave artifacts (transform record, output table) that are
   cleaned up by the existing background job."
  (:require
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.runner :as replacement.runner]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms.core :as transforms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn convert-card-to-transform!
  "Convert a model to a transform, execute it, and replace all usages of the model
   with the new output table.

   Called as the work-fn inside execute-async!. Progress stays null during transform
   creation/execution/sync, then tracks 0→1 during source replacement.

   Note: DB-polling cancellation differs from the transforms system's core.async
   cancellation, so a cancelled convert run may produce a \"failed\" transform_run.
   Acceptable for v1.

   For :convert-to-transform runs, the initial target entity values on the run record
   are placeholders (:card card-id) until update-target! is called after the output
   table is confirmed."
  [card-id run-id transform-name transform-target progress]
  (let [card (t2/select-one :model/Card :id card-id)
        _    (when-not (= :model (:type card))
               (throw (ex-info "Card is not a model" {:card-id card-id})))

        ;; --- Phase 1: Create transform ---
        transform  (transforms/create-transform!
                    {:name        transform-name
                     :description (:description card)
                     :source      {:type  "query"
                                   :query (:dataset_query card)}
                     :target      transform-target})
        _          (replacement-run/update-transform-id! run-id (:id transform))

        ;; --- Phase 2: Execute transform (synchronous — also syncs the output table) ---
        _          (transforms/execute! transform {:run-method :manual})

        ;; --- Phase 3: Confirm sync, get table ID ---
        target-db-id (transforms-base.i/target-db-id transform)
        table-name   (:name transform-target)
        table-schema (or (:schema transform-target) "transforms")
        table      (t2/select-one :model/Table
                                  :db_id target-db-id
                                  :schema table-schema
                                  :name table-name
                                  :active true)
        _          (when-not table
                     (throw (ex-info "Output table not found after transform execution"
                                     {:db-id target-db-id :schema table-schema :name table-name})))
        table-id   (:id table)

        ;; Record the actual target on the run
        _          (replacement-run/update-target! run-id :table table-id)

        ;; --- Phase 4: Replace all usages (0 → 1) ---
        ;; progress (from run-row->progress) already writes to the run record and
        ;; checks cancellation — run-swap only calls set-total!/advance!/canceled?
        ]

    (replacement.runner/run-swap [:card card-id] [:table table-id] progress)))
