(ns metabase-enterprise.remote-sync.models.remote-sync-task
  "Model for tracking remote sync tasks and their progress."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [trun]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::remote-sync-task-type
  [:enum "import" "export"])

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

(mu/defn create-sync-task!
  "Creates a RemoteSyncTask of `sync-task-type` for the user with `user-id`, throwing when another task is running."
  [sync-task-type :- ::remote-sync-task-type
   user-id        :- [:maybe pos-int?]]
  (remote-sync.db/insert-task! {:sync_task_type sync-task-type
                                :initiated_by   user-id
                                :progress       0}))

(defn cancel-sync-task!
  "Asks the sync task with `task-id` to stop, which it does at its next progress report before it changes anything."
  [task-id]
  (remote-sync.db/cancel-running-task! task-id))

(defn end-cancelled-task!
  "Ends the sync task with `task-id`, which stopped because it was asked to."
  [task-id]
  (remote-sync.db/end-task! task-id {}))

(defn- update-progress!
  "Records `progress`, between 0 and 1, on the sync task with `task-id`, throwing when the task was asked to stop."
  [task-id progress]
  (when (true? (remote-sync.db/task-cancelled? task-id))
    (throw (ex-info "Remote sync task has been cancelled" {:task-id task-id :cancelled? true})))
  (remote-sync.db/report-task-progress! task-id progress))

(defn make-progress-reporter
  "The progress reporter of the sync task with `task-id`, a fn of a fraction that records it, throwing when the task
  was asked to stop."
  [task-id]
  (fn report! [fraction]
    (update-progress! task-id (-> (double fraction) (max 0.0) (min 1.0)))))

(def ^:private heartbeat-interval-ms
  "The time between two heartbeats of a running task."
  15000)

(defn start-heartbeat!
  "Starts stamping the heartbeat of the sync task with `task-id` on a virtual thread, logging the writes that fail, and
  returns a fn that stops it."
  [task-id]
  (let [stop (promise)]
    (u.jvm/in-virtual-thread*
     (loop []
       (when (= ::tick (deref stop heartbeat-interval-ms ::tick))
         (try
           (remote-sync.db/touch-task! task-id)
           (catch Throwable t
             (log/debugf t "Heartbeat write failed for remote sync task %d" task-id)))
         (recur))))
    (fn stop-heartbeat! [] (deliver stop ::stop) nil)))

(defn set-version!
  "Records `version`, the git commit the sync task with `task-id` synced with, on the task."
  [task-id version]
  (remote-sync.db/update-task! task-id {:version version}))

(defn complete-sync-task!
  "Ends the sync task with `task-id` successfully with `outcome`, the data the UI describes the result with."
  [task-id outcome]
  (remote-sync.db/end-task! task-id {:progress  1.0
                                     :outcome   outcome
                                     :cancelled false}))

(defn fail-sync-task!
  "Ends the sync task with `task-id` with `error-msg`, the message for people of why it failed."
  [task-id error-msg]
  (remote-sync.db/end-task! task-id {:error_message error-msg :cancelled false}))

(defn conflict-sync-task!
  "Ends the sync task with `task-id` with `conflicts`, the labels of the entities both sides changed, and `outcome`."
  [task-id conflicts outcome]
  (remote-sync.db/end-task! task-id {:conflicts (vec conflicts)
                                     :outcome   outcome
                                     :cancelled false}))

(defn- liveness-cutoff
  "The instant before which the last sign of life of a running task makes it stale."
  []
  (t/minus (t/offset-date-time) (t/millis (setting/get :remote-sync-task-time-limit-ms))))

(defn current-task
  "The newest running sync task that showed a sign of life within the time limit, or nil."
  []
  (remote-sync.db/current-task (liveness-cutoff)))

(defn supersede-stale-tasks!
  "Cancels and ends the running tasks whose last heartbeat is older than `remote-sync-task-time-limit-ms`, with a
  message the UI shows, and returns their ids."
  []
  (let [cutoff  (liveness-cutoff)
        minutes (max 1 (quot (setting/get :remote-sync-task-time-limit-ms) 60000))
        ids     (remote-sync.db/supersede-stale-tasks!
                 cutoff
                 (trun "The sync stopped because the server didn''t respond for {0} minute. It may have restarted."
                       "The sync stopped because the server didn''t respond for {0} minutes. It may have restarted."
                       minutes))]
    (when (seq ids)
      (log/warnf "Superseded stale remote sync tasks %s: their owners were last alive before %s" ids cutoff))
    ids))

(defn most-recent-task
  "The newest sync task, running or ended, or nil."
  []
  (remote-sync.db/most-recent-task))

(defn last-version
  "The version of the last task that synced successfully, or nil when no task has synced."
  []
  (:version (remote-sync.db/last-synced-task)))

(defn running?
  "Whether `task` has not ended."
  [task]
  (nil? (:ended_at task)))

(defn successful?
  "Whether `task` ended without a cancel or an error."
  [task]
  (and (false? (:cancelled task))
       (nil? (:error_message task))
       (some? (:ended_at task))))

(defn failed?
  "Whether `task` ended with an error."
  [task]
  (and (false? (:cancelled task))
       (some? (:error_message task))
       (some? (:ended_at task))))

(defn cancelled?
  "Whether `task` was asked to stop."
  [task]
  (:cancelled task))

(defn timed-out?
  "Whether `task` has not ended and showed no sign of life within the time limit."
  [task]
  (and (nil? (:ended_at task))
       (t/< (or (:last_heartbeat_at task) (:last_progress_report_at task))
            (liveness-cutoff))))

(defn conflict?
  "Whether `task` ended with conflicts."
  [task]
  (and (some? (:ended_at task))
       (false? (:cancelled task))
       (nil? (:error_message task))
       (some? (:conflicts task))))

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
                          (and (cancelled? task) (some? (:ended_at task))) :cancelled
                          (timed-out? task) :timed-out
                          :else :running))))
