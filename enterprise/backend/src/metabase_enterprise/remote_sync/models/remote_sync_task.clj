(ns metabase-enterprise.remote-sync.models.remote-sync-task
  "Model for tracking remote sync tasks and their progress."
  (:require
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
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
  {:conflicts mi/transform-json
   :outcome   mi/transform-json})

(declare current-task)

(t2/define-before-insert :model/RemoteSyncTask
  [task]
  ;; one running task per workspace: a task tagged with a workspace only conflicts with running tasks of
  ;; that workspace (or untagged ones, which belong to the main app); an untagged task keeps the old
  ;; instance-wide check
  (when-let [existing (if-let [workspace-id (:workspace_id task)]
                        (current-task workspace-id)
                        (current-task))]
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

(def ^:private default-progress-throttle-ms
  "Minimum ms between throttled (non-boundary) progress writes."
  10000)

(defn make-progress-reporter
  "Returns a stateful progress reporter for `task-id`.

  Call the returned fn with a fraction in [0.0, 1.0]. It writes progress (and bumps
  `last_progress_report_at`) at most once per throttle window and never moves the fraction backward.
  Pass `{:force? true}` to write immediately regardless of the throttle — use at phase boundaries.

  Options:
   - :throttle-ms  minimum ms between throttled writes (default 10000)
   - :now-fn       0-arg fn returning current millis (default `System/currentTimeMillis`)
   - :write-fn     1-arg fn taking the clamped fraction (default `update-progress!` for `task-id`)"
  ([task-id] (make-progress-reporter task-id nil))
  ([task-id {:keys [throttle-ms now-fn write-fn]
             :or   {throttle-ms default-progress-throttle-ms}}]
   (let [now-fn        (or now-fn #(System/currentTimeMillis))
         write-fn      (or write-fn (fn [f] (update-progress! task-id f)))
         last-ms       (volatile! nil)
         last-fraction (volatile! -1.0)]
     (fn report!
       ([fraction] (report! fraction nil))
       ([fraction {:keys [force?]}]
        (let [now (now-fn)
              f   (-> (double fraction) (max 0.0) (min 1.0))]
          (when (and (>= f @last-fraction)
                     (or force? (nil? @last-ms) (>= (- now @last-ms) throttle-ms)))
            (vreset! last-ms now)
            (vreset! last-fraction f)
            (write-fn f))))))))

(defn set-version!
  "Sets the version value for a sync task.

  Takes the ID of the sync task to update and a version identifier string to set (typically a git SHA).

  Returns the number of rows updated (should be 1 if successful)."
  [task-id version]
  (t2/update! :model/RemoteSyncTask task-id
              {:version version}))

(defn complete-sync-task!
  "Marks a sync task as completed.

  Takes the ID of the sync task to mark as completed and an optional `outcome` map describing the result
  (e.g. `{:kind \"pulled\" :count 12 :branch \"main\"}`). The UI renders the outcome to a localized
  confirmation message; we store structured data rather than customer-facing copy.

  Returns the number of rows updated (should be 1 if successful)."
  ([task-id] (complete-sync-task! task-id nil))
  ([task-id outcome]
   (t2/update! :model/RemoteSyncTask task-id
               {:progress 1.0
                :ended_at (mi/now)
                :outcome  outcome})))

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
  within the time limit), or nil if no active task exists. With `workspace-id`, considers tasks running
  against that workspace plus main-app tasks (nil workspace_id) — a running main-app sync blocks workspace
  operations too, since both drive the same remote repository."
  ([]
   (current-task nil))
  ([workspace-id]
   (t2/select-one :model/RemoteSyncTask
                  {:where (cond-> [:and
                                   [:<> :started_at nil]
                                   [:= :ended_at nil]
                                   [:<
                                    (t/minus (t/offset-date-time) (t/millis (setting/get :remote-sync-task-time-limit-ms)))
                                    :last_progress_report_at]]
                            workspace-id (conj [:or
                                                [:= :workspace_id workspace-id]
                                                [:= :workspace_id nil]]))
                   :limit 1
                   :order-by [[:started_at :desc]
                              [:id :desc]]})))

(defn supersede-stale-tasks!
  "Marks any genuinely stale task rows as cancelled and terminated.

  A task is considered stale if it has `started_at` set, `ended_at` nil, and `last_progress_report_at`
  is older than `remote-sync-task-time-limit-ms`. The DB schema requires `last_progress_report_at`
  to be non-null with a default of `current_timestamp`, so a brand-new task always has a recent
  value (set on insert) and is not considered stale.

  Called from `create-task-with-lock!` before creating a new task, to clean up rows whose owning
  JVM/thread is gone or hung. Returns nothing meaningful.

  Combined with `handle-task-result!`'s already-terminated check, this means a stale task's thread
  that eventually wakes up and tries to complete will detect that its row is terminated and exit
  without writing the setting or overwriting bookkeeping."
  []
  (let [cutoff (t/minus (t/offset-date-time)
                        (t/millis (setting/get :remote-sync-task-time-limit-ms)))]
    (t2/query {:update (t2/table-name :model/RemoteSyncTask)
               :set    {:cancelled     true
                        :ended_at      (mi/now)
                        :error_message "Superseded after staleness timeout"}
               :where  [:and
                        [:<> :started_at nil]
                        [:= :ended_at nil]
                        [:< :last_progress_report_at cutoff]]})))

(defn most-recent-task
  "Gets the most recently run task, including currently running tasks.

  Returns the most recent RemoteSyncTask (running or completed), or nil if no tasks exist.
  Scoped by `workspace-id`: nil means the main app (tasks with a nil workspace_id), a workspace id means
  only that workspace's tasks."
  ([]
   (most-recent-task nil))
  ([workspace-id]
   (t2/select-one :model/RemoteSyncTask
                  {:where [:and
                           [:<> :started_at nil]
                           [:= :workspace_id workspace-id]]
                   :limit 1
                   :order-by [[:started_at :desc]
                              [:id :desc]]})))

(defn last-version
  "Gets the version that any changes are built off of.

  Returns the version string from the most recent successful task (either export or import), or nil if no successful
  tasks exist. Scoped by `workspace-id`: nil means the main app (tasks with a nil workspace_id), a workspace
  id means only tasks that ran against that workspace."
  ([]
   (last-version nil))
  ([workspace-id]
   (:version (t2/select-one :model/RemoteSyncTask
                            {:where [:and
                                     [:<> nil :ended_at]
                                     [:= false :cancelled]
                                     [:= nil :error_message]
                                     [:<> nil :version]
                                     [:= :workspace_id workspace-id]]
                             :limit 1
                             :order-by [[:started_at :desc]
                                        [:id :desc]]}))))

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
            (t/minus (t/offset-date-time) (t/millis (setting/get :remote-sync-task-time-limit-ms))))))

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
