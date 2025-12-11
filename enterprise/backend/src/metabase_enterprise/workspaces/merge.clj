(ns metabase-enterprise.workspaces.merge
  "Update global entities based on the definitions within a workspace.
   All functions assumes that validation of the dependencies AFTER merge is done BEFORE calling any of these methods."
  (:require
   [metabase-enterprise.transforms.api :as transforms.api]
   [metabase-enterprise.workspaces.types :as ws.types]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; TODO we need to implement the route that calls this, see API reference.
;; TODO (crisptrutski 2025-12-10): When there are more entity types support, this should update those too.
(mu/defn merge-transform! :- [:map
                              [:op [:enum :create :delete :noop :update]]
                              [:ref_id ::ws.types/ref-id]
                              [:global_id {:optional true} ::ws.types/appdb-id]
                              [:error {:optional true} :any]]
  "Make the given transform in the Changeset public, i.e. create or update the relevant model/Transform entities.
   This should also clear it out from the Changset, as it no longer has any changes."
  [{:keys [global_id ref_id archived_at] :as ws-transform}]
  ;; Problems this may run into:
  ;; It will recalculate and validate the dag greedily as it inserts each items, and this might fail of temporary conflicts.
  ;; Some of these conflicts could be solved by ordering things smartly, but in the general case (e.g. reversing a
  ;; chain) this will not be possible - we would need to defer all validation and calculation, which is a bit scary.
  ;; Let's just focus on the happy path for now though, as this is a fundamental problem and unrelated to the design.

  ;; Assume validation has alr
  ;; Ensure the hook
  (let [{:keys [error] :as result}
        (cond (and global_id archived_at)
              (merge
               {:op :delete :global_id global_id :ref_id ref_id}
               (try
                 (transforms.api/delete-transform! global_id)
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
      (t2/delete! :model/WorkspaceTransform :ref_id ref_id))

    result))

(defn merge-workspace!
  "Make all the transforms in the Changeset public, i.e. create or update the relevant model/Transform entities.
   This should also clear the entire Changeset, as it no longer has any changes.
   When there are more entity types support, this should update those too."
  [ws-id]
  ;; Perhaps we want to solve the N+1?
  ;; This will require reworking the lifecycle for validating and recalculating dependencies for the transforms.
  ;; We need to make sure this is in a transaction too, but perhaps that should already be open, and we can state
  ;; it as an assumption.

  (t2/with-transaction [tx]
    (let [savepoint ^java.sql.Savepoint (.savepoint ^java.sql.Connection tx)
          result (reduce
                  (fn [acc ws-transform]
                    (let [{:keys [error] :as result} (merge-transform! ws-transform)]
                      (if error
                        (reduced (update acc :errors conj result))
                        (update acc :transforms conj result))))
                  {:transforms []
                   :errors []}
                  (t2/select :model/WorkspaceTransform :workspace_id ws-id))]
      (when (seq (:errors result))
        (.rollback ^java.sql.Connection tx savepoint))
      result)))
