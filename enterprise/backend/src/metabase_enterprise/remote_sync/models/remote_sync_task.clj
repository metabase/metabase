(ns metabase-enterprise.remote-sync.models.remote-sync-task
  "Model for tracking remote sync tasks and their progress."
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::remote-sync-task-type
  [:enum "import" "export"])

;;; ------------------------------------------- Entity & Lifecycle -------------------------------------------

(methodical/defmethod t2/table-name :model/RemoteSyncTask [_model] :remote_sync_task)

(derive :model/RemoteSyncTask :metabase/model)

;;; ------------------------------------------- Helper Functions -------------------------------------------

(mu/defn create-sync-task!
  "Create a new remote sync task.

  Arguments:
    - sync-task-type: Type of sync task (string, max 24 chars)
    - user-id: ID of user who initiated the task (optional)
    - additional-fields: Map of additional fields (optional)

  Returns:
    The created sync task record."
  [sync-task-type :- ::remote-sync-task-type
   user-id :- [:maybe pos-int?] &
   [additional-fields :- [:map]]]
  (t2/insert-returning-instance! :model/RemoteSyncTask
                                 (merge {:sync_task_type sync-task-type
                                         :initiated_by user-id
                                         :progress 0
                                         :started_at (mi/now)}
                                        additional-fields)))

(defn update-progress!
  "Update the progress of a sync task.

  Arguments:
    - task-id: ID of the sync task
    - progress: Progress value (0.0 to 1.0)

  Returns:
    The updated sync task record."
  [task-id progress]
  (t2/update! :model/RemoteSyncTask task-id
              {:progress progress
               :last_progress_report_at (mi/now)}))

(defn complete-sync-task!
  "Mark a sync task as completed.

  Arguments:
    - task-id: ID of the sync task

  Returns:
    The updated sync task record."
  [task-id]
  (t2/update! :model/RemoteSyncTask task-id
              {:progress 1.0
               :ended_at (mi/now)}))

(defn fail-sync-task!
  "Mark a sync task as failed.

  Arguments:
    - task-id: ID of the sync task
    - error-msg: message to report for why this task failed

  Returns:
    The updated sync task record."
  [task-id error-msg]
  (t2/update! :model/RemoteSyncTask task-id
              {:ended_at (mi/now)
               :error_message error-msg}))

(mu/defn current-task-by-type :- [:sequential [:map]]
  "Get the current active sync tasks by type.

  Arguments:
    - sync-task-type: Type of sync task to filter by

  Returns:
    Collection of sync task records of the specified type."
  [sync-task-type :- ::remote-sync-task-type]
  (t2/select :model/RemoteSyncTask
             {:where [:and
                      [:= :sync_task_type sync-task-type]
                      [:<> :started_at nil]
                      [:= :ended_at nil]]
              :limit 1
              :order-by [[:started_at :desc]
                         [:id :desc]]}))

;;; ------------------------------------------- Hydration -------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/RemoteSyncTask :initiated_by_user]
  [_model k tasks]
  (mi/instances-with-hydrated-data
   tasks k
   #(t2/select-pk->fn identity :model/User :id [:in (map :initiated_by tasks)])
   :initiated_by))
