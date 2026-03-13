(ns metabase-enterprise.replacement.convert
  "Execute a transform and replace all usages of a source entity with the output table.

   The FE creates the transform via the transforms API. This module re-runs it,
   finds the output table, creates a ReplacementRun with the real target, and swaps
   all dependents of the source entity."
  (:require
   [metabase-enterprise.replacement.execute :as replacement.execute]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.runner :as replacement.runner]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms.core :as transforms]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- find-output-table
  "Look up the output table created by a transform execution."
  [transform]
  (let [target-db-id (transforms-base.i/target-db-id transform)
        target       (:target transform)
        table-name   (:name target)
        table-schema (or (:schema target) "transforms")
        table        (t2/select-one :model/Table
                                    :db_id target-db-id
                                    :schema table-schema
                                    :name table-name
                                    :active true)]
    (when-not table
      (throw (ex-info "Output table not found after transform execution"
                      {:db-id target-db-id :schema table-schema :name table-name})))
    table))

(defn- run-swap-phase!
  "Create a ReplacementRun with the real target table and execute the source swap.
   Returns the run-id on success."
  [source-type source-id table-id user-id]
  (let [job-row  (replacement-run/create-run!
                  source-type source-id
                  :table table-id
                  user-id)
        progress (replacement-run/run-row->progress job-row)]
    (replacement.execute/execute-swap! progress
                                       (fn [progress]
                                         (replacement.runner/run-swap
                                          [source-type source-id]
                                          [:table table-id]
                                          progress)))
    (:id job-row)))

(defn run-async!
  "Kick off the full convert-to-transform flow in a virtual thread.

   Phase 1: Execute transform (creates TransformRun, syncs output table)
   Phase 2: Create ReplacementRun with real target, run source swap
   Phase 3: Optionally unpersist model and archive card

   The start-promise is delivered once the TransformRun row exists."
  [{:keys [source-type source-id transform-id user-id start-promise
           unpersist-card? archive-card?]
    :or   {unpersist-card? false archive-card? false}}]
  (let [transform (t2/select-one :model/Transform :id transform-id)]
    (when-not transform
      (throw (ex-info "Transform not found" {:transform-id transform-id})))
    (u.jvm/in-virtual-thread*
     (try
       ;; Phase 1: Execute transform
       (transforms/execute! transform (cond-> {:run-method :manual}
                                        user-id       (assoc :user-id user-id)
                                        start-promise (assoc :start-promise start-promise)))

       ;; Phase 2: Find output table and run swap
       (let [table (find-output-table transform)]
         (run-swap-phase! source-type source-id (:id table) user-id)

         ;; Phase 3: Unpersist model
         (when unpersist-card?
           (when-let [persisted-info (t2/select-one :model/PersistedInfo :card_id source-id)]
             (model-persistence/mark-for-pruning! {:id (:id persisted-info)} "off")))

         ;; Phase 4: Archive card
         (when (and archive-card? (= source-type :card))
           (t2/update! :model/Card source-id {:archived true})))
       (catch Throwable t
         (log/errorf t "Convert-to-transform failed for source %s/%s transform %s"
                     source-type source-id transform-id))))))
