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

(t2/deftransforms :model/RemoteSyncTask
  {:conflicts mi/transform-json})

(declare current-task)

(t2/define-before-insert :model/RemoteSyncTask
  [task]
  (when-let [existing (current-task)]
    (throw (ex-info "A running task exists" {:existing-task existing})))
  task)

;;; ------------------------------------------- Helper Functions -------------------------------------------

(mu/defn create-sync-task!
  "Creates a new remote sync task.

  Takes a sync-task-type (either 'import' or 'export'), an optional user-id (ID of the user who initiated the task),
  and optional additional-fields (map of additional fields to include in the task record).

  Returns the created RemoteSyncTask instance.

  Throws ExceptionInfo if a running task already exists."
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
  "Marks a sync task as cancelled.

  Takes the ID of the sync task to cancel.

  Returns the number of rows updated (should be 1 if successful).

  This signal will be checked in update-progress! to stop further processing. Note that the worker thread must
  manually check this flag rather than being interrupted, as interrupting Quartz threads can cause issues."
  [task-id]
  (t2/update! :model/RemoteSyncTask task-id
              {:cancelled true
               :ended_at (mi/now)
               :error_message "Task cancelled"}))

(defn update-progress!
  "Updates the progress of a sync task.

  Takes the ID of the sync task to update and a progress value between 0.0 and 1.0.

  Returns the number of rows updated (should be 1 if successful).

  Throws ExceptionInfo if the task has been marked as cancelled."
  [task-id progress]
  (when (true? (t2/select-one-fn :cancelled :model/RemoteSyncTask :id task-id))
    (throw (ex-info "Remote sync task has been cancelled" {:task-id task-id
                                                           :cancelled? true})))
  (t2/update! :model/RemoteSyncTask task-id
              {:progress progress
               :last_progress_report_at (mi/now)}))

(defn set-version!
  "Sets the version value for a sync task.

  Takes the ID of the sync task to update and a version identifier string to set (typically a git SHA).

  Returns the number of rows updated (should be 1 if successful)."
  [task-id version]
  (t2/update! :model/RemoteSyncTask task-id
              {:version version}))

(defn complete-sync-task!
  "Marks a sync task as completed.

  Takes the ID of the sync task to mark as completed.

  Returns the number of rows updated (should be 1 if successful)."
  [task-id]
  (t2/update! :model/RemoteSyncTask task-id
              {:progress 1.0
               :ended_at (mi/now)}))

(defn fail-sync-task!
  "Marks a sync task as failed.

  Takes the ID of the sync task to mark as failed and an error message describing why the task failed.

  Returns the number of rows updated (should be 1 if successful)."
  [task-id error-msg]
  (t2/update! :model/RemoteSyncTask task-id
              {:ended_at (mi/now)
               :error_message error-msg}))

(defn current-task
  "Gets the current active sync task.

  Returns the most recent RemoteSyncTask that is still running (started but not ended, and has reported progress
  within the time limit), or nil if no active task exists."
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
  "Gets the most recently run task, including currently running tasks.

  Returns the most recent RemoteSyncTask (running or completed), or nil if no tasks exist."
  []
  (t2/select-one :model/RemoteSyncTask
                 {:where [:and
                          [:<> :started_at nil]]
                  :limit 1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(defn last-version
  "Gets the version that any changes are built off of.

  Returns the version string from the most recent successful task (either export or import), or nil if no successful
  tasks exist."
  []
  (:version (t2/select-one :model/RemoteSyncTask
                           {:where [:and
                                    [:<> nil :ended_at]
                                    [:= false :cancelled]
                                    [:= nil :error_message]
                                    [:<> nil :version]]
                            :limit 1
                            :order-by [[:started_at :desc]
                                       [:id :desc]]})))

(defn running?
  "Checks if a task is currently running.

  Takes a RemoteSyncTask instance.

  Returns true if the task has started but not ended (ended_at is nil), false otherwise."
  [task]
  (nil? (:ended_at task)))

(defn successful?
  "Checks if a task completed successfully.

  Takes a RemoteSyncTask instance.

  Returns true if the task completed without being cancelled or encountering errors, false otherwise."
  [task]
  (and (false? (:cancelled task))
       (nil? (:error_message task))
       (some? (:ended_at task))))

(defn failed?
  "Checks if a task failed.

  Takes a RemoteSyncTask instance.

  Returns true if the task completed with an error but was not cancelled, false otherwise."
  [task]
  (and (false? (:cancelled task))
       (some? (:error_message task))
       (some? (:ended_at task))))

(defn cancelled?
  "Checks if a task was cancelled.

  Takes a RemoteSyncTask instance.

  Returns true if the task was cancelled, false otherwise."
  [task]
  (:cancelled task))

(defn timed-out?
  "Checks if a task has timed out.

  Takes a RemoteSyncTask instance.

  Returns true if the task is incomplete and has not reported progress within the time limit, false otherwise."
  [task]
  (and (nil? (:ended_at task))
       (t/< (:last_progress_report_at task)
            (t/minus (t/offset-date-time) (t/millis (settings/remote-sync-task-time-limit-ms))))))

(defn conflict?
  "Checks if a task ended with conflicts.

  Takes a RemoteSyncTask instance.

  Returns true if the task has conflicts stored, false otherwise."
  [task]
  (and (some? (:ended_at task))
       (false? (:cancelled task))
       (nil? (:error_message task))
       (some? (:conflicts task))))

(defn conflict-sync-task!
  "Marks a sync task as having conflicts.

  Takes the ID of the sync task and a collection of conflicts (vector of strings).
  Conflicts are automatically serialized to JSON via the model transform.

  Returns the number of rows updated (should be 1 if successful)."
  [task-id conflicts]
  (t2/update! :model/RemoteSyncTask task-id
              {:ended_at (mi/now)
               :conflicts conflicts}))

;;; ------------------------------------------- Hydration -------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/RemoteSyncTask :initiated_by_user]
  [_model k tasks]
  (mi/instances-with-hydrated-data
   tasks k
   #(t2/select-pk->fn identity :model/User :id [:in (map :initiated_by tasks)])
   :initiated_by))

(methodical/defmethod t2/batched-hydrate [:model/RemoteSyncTask :status]
  [_model _k tasks]
  (for [task tasks]
    (assoc task :status (cond
                          (failed? task) :errored
                          (conflict? task) :conflict
                          (successful? task) :successful
                          (cancelled? task) :cancelled
                          (timed-out? task) :timed-out
                          :else :running))))
