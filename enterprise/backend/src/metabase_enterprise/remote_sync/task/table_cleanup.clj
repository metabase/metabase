(ns metabase-enterprise.remote-sync.task.table-cleanup
  "Task to clean up old records from remote_sync_task table"
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private cleanup-job-key
  "Job key for the remote sync table cleanup task."
  (jobs/key "metabase.task.remote-sync.table-cleanup.job"))

(def ^:private cleanup-trigger-key
  "Trigger key for the remote sync table cleanup task."
  (triggers/key "metabase.task.remote-sync.table-cleanup.trigger"))

(def ^:private retention-days
  "Number of days of data to retain in the remote sync tables."
  30)

(defn- trim-remote-sync-tasks!
  "Delete remote_sync_task records older than retention-days based on started_at timestamp."
  []
  (log/infof "Attempting to delete remote_sync_task records older than %d days." retention-days)
  (let [cutoff-date (t/minus (t/offset-date-time) (t/days retention-days))
        deleted-count (t2/delete! :model/RemoteSyncTask {:where [:< :started_at cutoff-date]})]
    (log/infof "Deleted %d remote_sync_task records. Cleanup successful." deleted-count)
    deleted-count))

(defn- trim-tables!
  []
  (trim-remote-sync-tasks!))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Clean up old records from remote_sync_task table"}
  RemoteSyncTableCleanup [_ctx]
  (trim-tables!))

(defmethod task/init! ::RemoteSyncTableCleanup
  [_]
  (let [job (jobs/build
             (jobs/of-type RemoteSyncTableCleanup)
             (jobs/with-identity cleanup-job-key))
        trigger (triggers/build
                 (triggers/with-identity cleanup-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; Run daily at 2:29 AM
                  (cron/cron-schedule "0 29 2 * * ?")))]
    (task/schedule-task! job trigger)))
