(ns metabase-enterprise.workspaces.merge
  "Update global entities based on the definitions within a workspace.
   All functions assumes that validation of the dependencies AFTER merge is done BEFORE calling any of these methods."
  (:require
   [metabase-enterprise.transforms.api :as transforms.api]
   [metabase-enterprise.workspaces.models.workspace-merge]
   [metabase-enterprise.workspaces.models.workspace-merge-transform]
   [metabase-enterprise.workspaces.types :as ws.types]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- create-merge-transform-history!
  "Create a workspace_merge_transform record to track this merge operation.
   Does nothing for :noop operations (archived transforms that don't exist globally)."
  [op merge-map]
  (when (not= op :noop)
    (t2/insert! :model/WorkspaceMergeTransform merge-map)))

;; TODO (crisptrutski 2025/12/10): When there are more entity types support, this should update those too.
(mu/defn merge-transform! :- [:map
                              [:op [:enum :create :delete :noop :update]]
                              [:ref_id ::ws.types/ref-id]
                              [:global_id {:optional true} [:maybe ::ws.types/appdb-id]]
                              [:error {:optional true} :any]]
  "Make the given transform in the Changeset public, i.e. create or update the relevant model/Transform entities.
   This should also clear it out from the Changset, as it no longer has any changes.

   Creates a WorkspaceMergeTransform history record.
   - workspace-merge-id: ID of parent WorkspaceMerge (nil for single-transform merges)
   - actor-id: user performing the merge
   - commit-message: description of the merge"
  [{:keys [global_id ref_id archived_at workspace_id] :as ws-transform} workspace-merge-id actor-id commit-message]
  ;; Problems this may run into:
  ;; It will recalculate and validate the dag greedily as it inserts each items, and this might fail of temporary conflicts.
  ;; Some of these conflicts could be solved by ordering things smartly, but in the general case (e.g. reversing a
  ;; chain) this will not be possible - we would need to defer all validation and calculation, which is a bit scary.
  ;; Let's just focus on the happy path for now though, as this is a fundamental problem and unrelated to the design.

  ;; Assume validation has alr
  ;; Ensure the hook
  (let [workspace      (t2/select-one [:model/Workspace :id :name] :id workspace_id)
        {:keys [error] :as result}
        (cond (and global_id archived_at)
              (merge
               {:op :delete :global_id global_id :ref_id ref_id}
               (try
                 (transforms.api/delete-transform! (t2/select-one :model/Transform :id global_id))
                 nil
                 (catch Throwable e
                   {:error e})))

              global_id
              (merge
               {:op :update :global_id global_id :ref_id ref_id}
               (try
                 (transforms.api/update-transform!
                  global_id (select-keys ws-transform [:name :description :source :target]))
                 nil
                 (catch Throwable e
                   {:error e})))

              archived_at
              {:op :noop :global_id nil :ref_id ref_id}

              :else
              (merge
               {:op :create :global_id nil :ref_id ref_id}
               (try
                 {:global_id (:id (transforms.api/create-transform!
                                   (select-keys ws-transform [:name :description :source :target])))}
                 (catch Throwable e
                   {:error e}))))]

    (when-not error
      (t2/delete! :model/WorkspaceTransform :ref_id ref_id)
      (create-merge-transform-history!
       (:op result)
       {:workspace_merge_id         workspace-merge-id
        :workspace_id               (:id workspace)
        :workspace_name             (:name workspace)
        :transform_id               (:global_id result)
        :workspace_transform_ref_id ref_id
        :commit_message             commit-message
        :creator_id                 actor-id}))

    result))

;; TODO (crisptrutski 2025-12-XX): When there are more entity types support, this should update those too.
(defn merge-workspace!
  "Make all the transforms in the Changeset public, i.e. create or update the relevant model/Transform entities.
   This should also clear the entire Changeset, as it no longer has any changes.

   - ws-id: ID of the workspace to merge
   - actor-id: user performing the merge
   - commit-message: description of the merge"
  [ws-id actor-id commit-message]
  ;; Perhaps we want to solve the N+1?
  ;; This will require reworking the lifecycle for validating and recalculating dependencies for the transforms.

  (t2/with-transaction [tx]
    (let [workspace       (t2/select-one [:model/Workspace :id :name] :id ws-id)
          savepoint       (.setSavepoint ^Connection tx)
          ;; Create the workspace_merge record first
          workspace-merge (t2/insert-returning-instance!
                           :model/WorkspaceMerge
                           {:workspace_id   ws-id
                            :workspace_name (:name workspace)
                            :commit_message commit-message
                            :creator_id     actor-id})
          result (reduce
                  (fn [acc ws-transform]
                    (let [{:keys [error] :as result} (merge-transform! ws-transform (:id workspace-merge) actor-id commit-message)]
                      (if error
                        (reduced (-> acc
                                     (update :errors conj result)
                                     (assoc-in [:merged :transforms] [])
                                     #_(assoc :short_circuit true)))
                        (update-in acc [:merged :transforms] conj result))))
                  {:merged {:transforms []}
                   :errors []
                   #_#_:short_circuit false}
                  (t2/select :model/WorkspaceTransform :workspace_id ws-id))]
      (when (seq (:errors result))
        (.rollback ^Connection tx savepoint))
      result)))
