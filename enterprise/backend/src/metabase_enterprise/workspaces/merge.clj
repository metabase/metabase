(ns metabase-enterprise.workspaces.merge
  "Update global entities based on the definitions within a workspace.
   All functions assumes that validation of the dependencies AFTER merge is done BEFORE calling any of these methods."
  (:require
   [metabase-enterprise.transforms.api :as transforms.api]
   [toucan2.core :as t2]))

;; TODO we need to implement the route that calls this, see API reference.
;; TODO (crisptrutski 2025-12-10): When there are more entity types support, this should update those too.
(defn merge-transform!
  "Make the given transform in the Changeset public, i.e. create or update the relevant model/Transform entities.
   This should also clear it out from the Changset, as it no longer has any changes."
  [{:keys [ref_id] :as ws-transform}]
  ;; Problems this may run into:
  ;; It will recalculate and validate the dag greedily as it inserts each items, and this might fail of temporary conflicts.
  ;; Some of these conflicts could be solved by ordering things smartly, but in the general case (e.g. reversing a
  ;; chain) this will not be possible - we would need to defer all validation and calculation, which is a bit scary.
  ;; Let's just focus on the happy path for now though, as this is a fundamental problem and unrelated to the design.

  ;; Assume validation has alr
  ;; Ensure the hook
  (let [*tx-id (atom (:global_id ws-transform))]
    (if @*tx-id
      (transforms.api/update-transform! @*tx-id (select-keys ws-transform [:name :description :source :target]))
      ;; TODO need to extract the create-transform function
      (reset! *tx-id nil #_(:id (transforms.api/create-transform (select-keys ws-transform [:name :description :source :target])))))

    ;; There are no longer any changes, so it can be removed from the changeset.
    (t2/delete! :model/WorkspaceTransform :ref_id ref_id)
    ;
    {:ref_id ref_id, :global_id @*tx-id}))

(defn merge-workspace!
  "Make all the transforms in the Changeset public, i.e. create or update the relevant model/Transform entities.
   This should also clear the entire Changeset, as it no longer has any changes.
   When there are more entity types support, this should update those too."
  [ws-id]
  ;; Perhaps we want to solve the N+1?
  ;; This will require reworking the lifecycle for validating and recalculating dependencies for the transforms.
  ;; We need to make sure this is in a transaction too, but perhaps that should already be open, and we can state
  ;; it as an assumption.
  ;; TODO we'll want this to short-circuit
  {:transforms
   (for [ws-tx (t2/select :model/WorkspaceTransform :workspace_id ws-id)]
     (merge-transform! ws-tx))})
