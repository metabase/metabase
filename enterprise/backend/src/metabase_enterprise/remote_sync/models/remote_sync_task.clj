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
(defn cancel-sync-task!
  "Mark a sync task as cancelled. This signal will be checked in update-progress! to stop further processing.
  Have to manually check it rather than having a separate thread check and interrupt the worker thread because
  sometimes the worker thread is a quartz thread and interrupting it can cause issues."
  [task-id]
  (t2/update! :model/RemoteSyncTask task-id
              {:cancelled true
               :ended_at (mi/now)
               :error_message "Task cancelled"}))

(defn update-progress!
  "Update the progress of a sync task.

  Arguments:
    - task-id: ID of the sync task
    - progress: Progress value (0.0 to 1.0)

  Returns:
    The updated sync task record.

  NOTE: if the task has been marked as 'cancelled', this will throw an exception to stop further processing."
  [task-id progress]
  (when (true? (t2/select-one-fn :cancelled :model/RemoteSyncTask :id task-id))
    (throw (ex-info "Remote sync task has been cancelled" {:task-id    task-id
                                                           :cancelled? true})))
  (t2/update! :model/RemoteSyncTask task-id
              {:progress progress
               :last_progress_report_at (mi/now)}))

(defn set-version!
  "Sets the version value for a sync task."
  [task-id version]
  (t2/update! :model/RemoteSyncTask task-id
              {:version version}))

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

(defn current-task
  "Get the current active sync task

  Returns:
    A sync task record"
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
  "Gets the most recently run task, including the currently running task if there is one"
  []
  (t2/select-one :model/RemoteSyncTask
                 {:where [:and
                          [:<> :started_at nil]]
                  :limit 1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(defn running?
  "Returns truthy iff this is a running task."
  [task]
  (nil? (:ended_at task)))

(defn successful?
  "Returns truthy iff this is a successfully completed task."
  [task]
  (and (false? (:cancelled task))
       (nil? (:error_message task))
       (some? (:ended_at task))))

(defn failed?
  "Returns truthy iff this is a failed, completed task"
  [task]
  (and (false? (:cancelled task))
       (some? (:error_message task))
       (some? (:ended_at task))))

(defn cancelled?
  "Returns truthy iff this is a cancelled task."
  [task]
  (:cancelled task))

(defn timed-out?
  "Returns truthy iff this is a timed-out, incomplete task"
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
