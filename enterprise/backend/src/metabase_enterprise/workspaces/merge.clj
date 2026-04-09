(ns metabase-enterprise.workspaces.merge
  "Update global entities based on the definitions within a workspace.
   All functions assumes that validation of the dependencies AFTER merge is done BEFORE calling any of these methods."
  (:require
   [metabase-enterprise.workspaces.models.workspace-merge]
   [metabase-enterprise.workspaces.models.workspace-merge-transform]
   [metabase-enterprise.workspaces.types :as ws.types]
   [metabase.transforms.core :as transforms.api]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- create-merge-transform-history!
  "Create a workspace_merge_transform record to track this merge operation.
   Does nothing for :noop operations (archived transforms that don't exist globally)
   or :delete operations (history would be CASCADE deleted with the transform anyway)."
  [op merge-map]
  (when (#{:create :update} op)
    (t2/insert! :model/WorkspaceMergeTransform merge-map)))

(mu/defn merge-transform! :- [:map
                              [:op [:enum :create :delete :noop :update]]
                              [:ref_id ::ws.types/ref-id]
                              [:global_id {:optional true} [:maybe ::ws.types/appdb-id]]
                              [:error {:optional true} :any]]
  "Make the given transform in the Changeset public, i.e. create or update the relevant model/Transform entities.
   This should also clear it out from the Changset, as it no longer has any changes.

   Creates a WorkspaceMergeTransform history record.
   - :ws-transform - The workspace transform to merge
   - :workspace - The workspace map (must have :id and :name keys)
   - :workspace-merge-id - ID of parent WorkspaceMerge (caller must create this)
   - :merging-user-id - user performing the merge
   - :commit-message - description of the merge"
  [{:keys [ws-transform workspace workspace-merge-id merging-user-id commit-message]}]
  ;; Problems this may run into:
  ;; It will recalculate and validate the dag greedily as it inserts each items, and this might fail of temporary conflicts.
  ;; Some of these conflicts could be solved by ordering things smartly, but in the general case (e.g. reversing a
  ;; chain) this will not be possible - we would need to defer all validation and calculation, which is a bit scary.
  ;; Let's just focus on the happy path for now though, as this is a fundamental problem and unrelated to the design.
  (let [{:keys [global_id ref_id archived_at]} ws-transform
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
                                   (select-keys ws-transform [:name :description :source :target])
                                   (:creator_id ws-transform)))}
                 (catch Throwable e
                   {:error e}))))]

    (when-not error
      ;; See https://linear.app/metabase/issue/GDGT-1591/merging-a-workspace-removes-transforms-from-it
      ;; Keeping this stub as we may want to revisit it in the future.
      #_(t2/delete! :model/WorkspaceTransform :workspace_id (:id workspace) :ref_id ref_id)
      (create-merge-transform-history!
       (:op result)
       {:workspace_merge_id workspace-merge-id
        :workspace_id       (:id workspace)
        :workspace_name     (:name workspace)
        :transform_id       (:global_id result)
        :commit_message     commit-message
        :merging_user_id    merging-user-id}))

    result))

(defn merge-workspace!
  "Make all the transforms in the Changeset public, i.e. create or update the relevant model/Transform entities.

   - workspace: The workspace map (must have :id and :name keys)
   - merging-user-id: user performing the merge
   - commit-message: description of the merge"
  [workspace merging-user-id commit-message]
  ;; Perhaps we want to solve the N+1?
  ;; This will require reworking the lifecycle for validating and recalculating dependencies for the transforms.
  (t2/with-transaction [tx]
    (let [savepoint   (.setSavepoint ^Connection tx)
          ws-merge-id (t2/insert-returning-pk!
                       :model/WorkspaceMerge
                       {:workspace_id   (:id workspace)
                        :workspace_name (:name workspace)
                        :commit_message commit-message
                        :creator_id     merging-user-id})
          result     (reduce
                      (fn [acc ws-transform]
                        (let [{:keys [error] :as result} (merge-transform! {:ws-transform      ws-transform
                                                                            :workspace         workspace
                                                                            :workspace-merge-id ws-merge-id
                                                                            :merging-user-id   merging-user-id
                                                                            :commit-message    commit-message})]
                          (if error
                            (reduced (-> acc
                                         (update :errors conj result)
                                         (assoc-in [:merged :transforms] [])))
                            (update-in acc [:merged :transforms] conj result))))
                      {:merged {:transforms []}
                       :errors []}
                      (t2/select :model/WorkspaceTransform :workspace_id (:id workspace)
                                 ;; Deterministic ordering; ref_id breaks created_at ties
                                 {:order-by [[:created_at :asc] [:ref_id :asc]]}))]
      (when (seq (:errors result))
        (.rollback ^Connection tx savepoint))
      result)))
