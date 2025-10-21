(ns metabase-enterprise.remote-sync.models.remote-sync-task
  "Model for tracking remote sync tasks and their progress."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.settings :as settings]
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

(declare current-task)

(t2/define-before-insert :model/RemoteSyncTask
  [task]
  (when-let [existing (current-task)]
    (throw (ex-info "A running task exists" {:existing-task existing})))
  task)

;;; ------------------------------------------- Helper Functions -------------------------------------------

(mu/defn create-sync-task!
  "Create a new remote sync task.

  Args:
    sync-task-type: Type of sync task, either 'import' or 'export'.
    user-id: (Optional) ID of the user who initiated the task.
    additional-fields: (Optional) Map of additional fields to include in the task record.

  Returns:
    The created RemoteSyncTask instance.

  Raises:
    ExceptionInfo: If a running task already exists."
  [sync-task-type :- ::remote-sync-task-type
   user-id :- [:maybe pos-int?] &
   [additional-fields :- [:map]]]
  (t2/insert-returning-instance! :model/RemoteSyncTask
                                 (merge {:sync_task_type sync-task-type
                                         :initiated_by user-id
                                         :progress 0
                                         :started_at (mi/now)}
                                        additional-fields)))
(defn cancel-sync-task!
  "Mark a sync task as cancelled.

  Args:
    task-id: The ID of the sync task to cancel.

  Returns:
    The number of rows updated (should be 1 if successful).

  Notes:
    This signal will be checked in update-progress! to stop further processing.
    The worker thread must manually check this flag rather than being interrupted,
    as interrupting Quartz threads can cause issues."
  [task-id]
  (t2/update! :model/RemoteSyncTask task-id
              {:cancelled true
               :ended_at (mi/now)
               :error_message "Task cancelled"}))

(defn update-progress!
  "Update the progress of a sync task.

  Args:
    task-id: The ID of the sync task to update.
    progress: Progress value between 0.0 and 1.0.

  Returns:
    The number of rows updated (should be 1 if successful).

  Raises:
    ExceptionInfo: If the task has been marked as cancelled."
  [task-id progress]
  (when (true? (t2/select-one-fn :cancelled :model/RemoteSyncTask :id task-id))
    (throw (ex-info "Remote sync task has been cancelled" {:task-id    task-id
                                                           :cancelled? true})))
  (t2/update! :model/RemoteSyncTask task-id
              {:progress progress
               :last_progress_report_at (mi/now)}))

(defn set-version!
  "Set the version value for a sync task.

  Args:
    task-id: The ID of the sync task to update.
    version: The version identifier string to set (typically a git SHA).

  Returns:
    The number of rows updated (should be 1 if successful)."
  [task-id version]
  (t2/update! :model/RemoteSyncTask task-id
              {:version version}))

(defn complete-sync-task!
  "Mark a sync task as completed.

  Args:
    task-id: The ID of the sync task to mark as completed.

  Returns:
    The number of rows updated (should be 1 if successful)."
  [task-id]
  (t2/update! :model/RemoteSyncTask task-id
              {:progress 1.0
               :ended_at (mi/now)}))

(defn fail-sync-task!
  "Mark a sync task as failed.

  Args:
    task-id: The ID of the sync task to mark as failed.
    error-msg: The error message describing why the task failed.

  Returns:
    The number of rows updated (should be 1 if successful)."
  [task-id error-msg]
  (t2/update! :model/RemoteSyncTask task-id
              {:ended_at (mi/now)
               :error_message error-msg}))

(defn current-task
  "Get the current active sync task.

  Returns:
    The most recent RemoteSyncTask that is still running (started but not ended,
    and has reported progress within the time limit), or nil if no active task exists."
  []
  (t2/select-one :model/RemoteSyncTask
                 {:where [:and
                          [:<> :started_at nil]
                          [:= :ended_at nil]
                          [:<
                           (t/minus (t/offset-date-time) (t/millis (settings/remote-sync-task-time-limit-ms)))
                           :last_progress_report_at]]
                  :limit 1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(defn most-recent-task
  "Get the most recently run task, including currently running tasks.

  Returns:
    The most recent RemoteSyncTask (running or completed), or nil if no tasks exist."
  []
  (t2/select-one :model/RemoteSyncTask
                 {:where [:and
                          [:<> :started_at nil]]
                  :limit 1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(defn most-recent-successful-task
  "Get the most recent successful task, optionally filtered by type.

  Args:
    task-type: (Optional) The sync task type to filter by ('import' or 'export'). If nil, returns the most recent successful task of any type.

  Returns:
    The most recent successfully completed RemoteSyncTask matching the criteria, or nil if none exists."
  [task-type]
  (t2/select-one :model/RemoteSyncTask
                 {:where    (cond-> [:and
                                     [:<> nil :ended_at]
                                     [:= false :cancelled]
                                     [:= nil :error_message]]
                              (some? task-type)
                              (conj [:= task-type :sync_task_type]))
                  :limit    1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(defn last-import-version
  "Get the version most recently successfully imported.

  Returns:
    The version string from the most recent successful import task, or nil if no successful imports exist."
  []
  (:version (most-recent-successful-task "import")))

(defn last-version
  "Get the version that any changes are built off of.

  Returns:
    The version string from the most recent successful task (either export or import), or nil if no successful tasks exist."
  []
  (:version (most-recent-successful-task nil)))

(defn running?
  "Check if a task is currently running.

  Args:
    task: A RemoteSyncTask instance.

  Returns:
    Boolean - true if the task has started but not ended (ended_at is nil), false otherwise."
  [task]
  (nil? (:ended_at task)))

(defn successful?
  "Check if a task completed successfully.

  Args:
    task: A RemoteSyncTask instance.

  Returns:
    Boolean - true if the task completed without being cancelled or encountering errors, false otherwise."
  [task]
  (and (false? (:cancelled task))
       (nil? (:error_message task))
       (some? (:ended_at task))))

(defn failed?
  "Check if a task failed.

  Args:
    task: A RemoteSyncTask instance.

  Returns:
    Boolean - true if the task completed with an error but was not cancelled, false otherwise."
  [task]
  (and (false? (:cancelled task))
       (some? (:error_message task))
       (some? (:ended_at task))))

(defn cancelled?
  "Check if a task was cancelled.

  Args:
    task: A RemoteSyncTask instance.

  Returns:
    Boolean - true if the task was cancelled, false otherwise."
  [task]
  (:cancelled task))

(defn timed-out?
  "Check if a task has timed out.

  Args:
    task: A RemoteSyncTask instance.

  Returns:
    Boolean - true if the task is incomplete and has not reported progress within the time limit, false otherwise."
  [task]
  (and (nil? (:ended_at task))
       (t/< (:last_progress_report_at task)
            (t/minus (t/offset-date-time) (t/millis (settings/remote-sync-task-time-limit-ms))))))

;;; ------------------------------------------- Hydration -------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/RemoteSyncTask :initiated_by_user]
  [_model k tasks]
  (mi/instances-with-hydrated-data
   tasks k
   #(t2/select-pk->fn identity :model/User :id [:in (map :initiated_by tasks)])
   :initiated_by))
