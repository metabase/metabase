(ns metabase.task.task-history-cleanup
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.models.task-history :as task-history]
   [metabase.task :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private history-rows-to-keep
  "Maximum number of TaskHistory rows."
  100000)

(defn- task-history-cleanup!
  "Delete older TaskHistory rows -- see docstring of `task-history/cleanup-task-history!` for more details."
  []
  (log/debug "Cleaning up task history")
  (task-history/with-task-history {:task "task-history-cleanup"}
    (let [deleted-rows? (task-history/cleanup-task-history! history-rows-to-keep)]
      (log/debug
       (if deleted-rows?
         "Task history cleanup successful, rows were deleted"
         "Task history cleanup successful, no rows were deleted")))))

(jobs/defjob
  ^{:doc "Delete older TaskHistory rows -- see docstring of `task-history/cleanup-task-history!` for more details."}
  TaskHistoryCleanup [_]
  (task-history-cleanup!))

(def ^:private job-key     "metabase.task.task-history-cleanup.job")
(def ^:private trigger-key "metabase.task.task-history-cleanup.trigger")

(defmethod task/init! ::TaskHistoryCleanup [_]
  (let [job     (jobs/build
                 (jobs/of-type TaskHistoryCleanup)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; run every day at midnight
                   (cron/cron-schedule "0 0 0 * * ? *")))]
      (task/schedule-task! job trigger)))
