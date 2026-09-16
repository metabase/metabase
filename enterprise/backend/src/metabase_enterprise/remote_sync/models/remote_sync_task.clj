(ns metabase-enterprise.remote-sync.models.remote-sync-task
  "Model for tracking remote sync tasks and their progress."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
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
  (when-let [existing (current-task)]
    (throw (ex-info "A running task exists" {:existing-task existing})))
  (merge {:started_at (mi/now)} task))

;;; ------------------------------------------- Helper Functions -------------------------------------------

(mu/defn create-sync-task!
  "Creates a new remote sync task.

  Takes a sync-task-type (either 'import' or 'export'), an optional user-id (ID of the user who initiated the task),
  and optional additional-fields (map of additional fields to include in the task record).

  Returns the created RemoteSyncTask instance.

  Throws ExceptionInfo if a running task already exists."
  [sync-task-type :- ::remote-sync-task-type
   user-id :- [:maybe pos-int?]
   & [additional-fields] :- [:* ::remote-sync.schema/remote-sync-task.update]]
  (remote-sync.db/insert-task! (merge {:sync_task_type sync-task-type
                                       :initiated_by user-id
                                       :progress 0}
                                      additional-fields)))

(defn cancel-sync-task!
  "Marks a sync task as cancelled.

  Takes the ID of the sync task to cancel.

  Returns the number of rows updated (should be 1 if successful).

  This signal will be checked in update-progress! to stop further processing. Note that the worker thread must
  manually check this flag rather than being interrupted, as interrupting Quartz threads can cause issues."
  [task-id]
  (remote-sync.db/end-task! task-id
                            {:cancelled true
                             :error_message "Task cancelled"}))

(defn update-progress!
  "Updates the progress of a sync task.

  Takes the ID of the sync task to update and a progress value between 0.0 and 1.0.

  Returns the number of rows updated (should be 1 if successful).

  Throws ExceptionInfo if the task has been marked as cancelled."
  [task-id progress]
  (when (true? (remote-sync.db/task-cancelled? task-id))
    (throw (ex-info "Remote sync task has been cancelled" {:task-id task-id
                                                           :cancelled? true})))
  (remote-sync.db/report-task-progress! task-id progress))

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

(def default-heartbeat-interval-ms
  "Ms between heartbeat writes while a task runs. Deliberately not derived from `remote-sync-task-time-limit-ms`:
  an operator can set that below this interval, and a test would rather fail loudly than beat silently too slowly."
  15000)

(defn start-heartbeat!
  "Start a virtual thread stamping `last_heartbeat_at` on the task with `task-id` every `interval-ms` (default
  [[default-heartbeat-interval-ms]]) for as long as it runs. Returns a zero-arg fn that stops it.

  A failed write is logged at debug and the loop continues: a DB hiccup must not kill the heartbeat, and a
  connection wait only makes the beat late. The update count is ignored because under a test transaction the
  row is invisible to the heartbeat's own connection, and because an ended row is meant to update nothing."
  ([task-id] (start-heartbeat! task-id default-heartbeat-interval-ms))
  ([task-id interval-ms]
   (let [stop (promise)]
     (u.jvm/in-virtual-thread*
      (loop []
        (when (= ::tick (deref stop interval-ms ::tick))
          (try
            (remote-sync.db/touch-task! task-id)
            (catch Throwable t
              (log/debugf t "Heartbeat write failed for remote sync task %d" task-id)))
          (recur))))
     (fn stop-heartbeat! [] (deliver stop ::stop) nil))))

(defn set-version!
  "Sets the version value for a sync task.

  Takes the ID of the sync task to update and a version identifier string to set (typically a git SHA).

  Returns the number of rows updated (should be 1 if successful)."
  [task-id version]
  (remote-sync.db/update-task! task-id {:version version}))

(defn complete-sync-task!
  "Marks a sync task as completed.

  Takes the ID of the sync task to mark as completed and an optional `outcome` map describing the result
  (e.g. `{:kind \"pulled\" :count 12 :branch \"main\"}`). The UI renders the outcome to a localized
  confirmation message; we store structured data rather than customer-facing copy.

  Returns the number of rows updated (should be 1 if successful)."
  ([task-id] (complete-sync-task! task-id nil))
  ([task-id outcome]
   (remote-sync.db/end-task! task-id
                             {:progress 1.0
                              :outcome  outcome})))

(defn fail-sync-task!
  "Marks a sync task as failed.

  Takes the ID of the sync task to mark as failed and an error message describing why the task failed.

  Returns the number of rows updated (should be 1 if successful)."
  [task-id error-msg]
  (remote-sync.db/end-task! task-id
                            {:error_message error-msg}))

(defn- liveness-cutoff
  "The instant before which a running task's last sign of life makes it stale."
  []
  (t/minus (t/offset-date-time) (t/millis (setting/get :remote-sync-task-time-limit-ms))))

(defn current-task
  "Gets the current active sync task.

  Returns the most recent RemoteSyncTask that is still running (started but not ended, and whose owning thread
  heartbeat or reported progress within the time limit), or nil if no active task exists."
  []
  (remote-sync.db/current-task (liveness-cutoff)))

(defn supersede-stale-tasks!
  "Marks any genuinely stale task rows as cancelled and terminated.

  A task is considered stale if it has `started_at` set, `ended_at` nil, and its last sign of life
  (`last_heartbeat_at`, or `last_progress_report_at` when no beat was ever written) is older than
  `remote-sync-task-time-limit-ms`. The DB schema requires `last_progress_report_at` to be non-null with
  a default of `current_timestamp`, so a brand-new task always has a recent value (set on insert) and is
  not considered stale.

  Called from `create-task-with-lock!` before creating a new task, to clean up rows whose owning
  JVM/thread is gone or hung. Returns nothing meaningful.

  The error message written names the staleness window, so the UI can show it as the reason the sync stopped.

  Combined with `handle-task-result!`'s already-terminated check, this means a stale task's thread
  that eventually wakes up and tries to complete will detect that its row is terminated and exit
  without writing the setting or overwriting bookkeeping."
  []
  (let [minutes (max 1 (quot (setting/get :remote-sync-task-time-limit-ms) 60000))]
    (remote-sync.db/supersede-stale-tasks!
     (liveness-cutoff)
     (format "Sync was interrupted: the server stopped responding for %d minute%s (it may have restarted)"
             minutes (if (= 1 minutes) "" "s")))))

(defn most-recent-task
  "Gets the most recently run task, including currently running tasks.

  Returns the most recent RemoteSyncTask (running or completed), or nil if no tasks exist."
  []
  (remote-sync.db/most-recent-task))

(defn last-version
  "Gets the version that any changes are built off of.

  Returns the version string of the newest task (import or export) whose commit landed, regardless of how the task
  row was closed afterwards (see [[remote-sync.db/last-synced-task]]), or nil if no task has ever synced."
  []
  (:version (remote-sync.db/last-synced-task)))

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

  Returns true if the task is incomplete and its owning thread has neither heartbeat nor reported progress within
  the time limit, false otherwise. A row with no heartbeat falls back to its progress stamp."
  [task]
  (and (nil? (:ended_at task))
       (t/< (or (:last_heartbeat_at task) (:last_progress_report_at task))
            (liveness-cutoff))))

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
  (remote-sync.db/end-task! task-id
                            {:conflicts conflicts}))

;;; ------------------------------------------- Hydration -------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/RemoteSyncTask :initiated_by_user]
  [_model k tasks]
  (mi/instances-with-hydrated-data
   tasks k
   #(remote-sync.db/users-by-id (map :initiated_by tasks))
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
