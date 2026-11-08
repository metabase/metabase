(ns metabase-enterprise.remote-sync.tasks
  "Pushes and pulls run as RemoteSyncTasks, one at a time, on a virtual thread, with their progress, result and the
  version they synced recorded on the task."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.events.core :as events]
   [metabase.serialization.core :as serialization]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn error-message
  "The message for people of the error `e` of a push or pull."
  [e]
  (let [message (or (ex-message e) (.getName (class e)))
        causes  (take-while some? (iterate ex-cause e))]
    (cond
      (some #(instance? java.net.UnknownHostException %) causes)
      "Network error: Unable to reach git repository host"

      (str/includes? message "Authentication failed")
      "Authentication failed: Please check your git credentials"

      (str/includes? message "Repository not found")
      "Repository not found: Please check the repository URL"

      (u/seek serialization/load-error? causes)
      (let [error (u/seek serialization/load-error? causes)]
        (str (ex-message error) ": " (some-> error ex-cause ex-message)))

      :else
      message)))

(defn base-version
  "The version of the tree the app DB last synced with, or nil when it never synced."
  []
  (remote-sync.task/last-version))

(defn- finish!
  "Records `result` on the task with `task-id`, unless it already ended, as a cancelled one did, and on success sets
  the branch setting to `branch` and publishes the `event` of the task."
  [task-id {:keys [branch event user-id]} {:keys [status version conflicts outcome message]}]
  (let [recorded? (t2/with-transaction [_conn]
                    (when-not (:ended_at (remote-sync.db/task task-id))
                      (case status
                        :success  (do (setting/set! :remote-sync-branch branch)
                                      (remote-sync.task/set-version! task-id version)
                                      (remote-sync.task/complete-sync-task! task-id (cond-> outcome
                                                                                      (:count outcome) (assoc :branch branch))))
                        :conflict (remote-sync.task/conflict-sync-task! task-id conflicts outcome)
                        :error    (remote-sync.task/fail-sync-task! task-id message))
                      true))]
    (when (and recorded? (= :success status) event)
      (events/publish-event! event {:object  (remote-sync.db/task task-id)
                                    :details {:branch branch}
                                    :user-id user-id}))))

(defn- run-task!
  "Runs `f`, a fn of a progress reporter returning the result of a push or pull, for the task with `task-id`, and
  records its result."
  [task-id opts f]
  (let [stop-heartbeat! (remote-sync.task/start-heartbeat! task-id)]
    (try
      (finish! task-id opts (f (remote-sync.task/make-progress-reporter task-id)))
      (catch Throwable e
        (if (:cancelled? (ex-data e))
          (log/info "Remote sync task was cancelled")
          (do (log/errorf "Remote sync task failed: %s" (ex-message e))
              (finish! task-id opts {:status :error :message (error-message e)}))))
      (finally
        (stop-heartbeat!)))))

(defn- create-task!
  "Creates a task of `task-type` for the user with `user-id`, or returns nil when another task is running."
  [task-type user-id]
  (cluster-lock/with-cluster-lock ::task
    (when-not (remote-sync.task/current-task)
      (remote-sync.task/supersede-stale-tasks!)
      (remote-sync.task/create-sync-task! task-type user-id))))

(defn start!
  "Starts a task of `:type`, \"import\" or \"export\", of the user with `:user-id` that runs `f` (see [[run-task!]]) on a
  virtual thread and on success syncs with `:branch` and publishes `:event`. Returns the task, or nil when another
  task is running."
  [{task-type :type :keys [user-id] :as opts} f]
  (when-let [task (create-task! task-type user-id)]
    (u.jvm/in-virtual-thread* (run-task! (:id task) opts f))
    task))

(defn run-now!
  "Runs the task [[start!]] starts on this thread instead, returning it, or nil when another task is running."
  [{task-type :type :keys [user-id] :as opts} f]
  (when-let [task (create-task! task-type user-id)]
    (run-task! (:id task) opts f)
    task))
