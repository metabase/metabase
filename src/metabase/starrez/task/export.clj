(ns metabase.starrez.task.export
  "Scheduled StarRez export job."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.starrez.export :as starrez.export]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private weekly-export-job-key
  (jobs/key "metabase.task.starrez.weekly-export.job"))

(def ^:private weekly-export-trigger-key
  (triggers/key "metabase.task.starrez.weekly-export.trigger"))

(task/defjob ^{:doc "Weekly StarRez export and activation."
               org.quartz.DisallowConcurrentExecution true}
  StarRezWeeklyExport
  [_]
  (log/info "Starting scheduled StarRez weekly export")
  (let [result (starrez.export/run-export {:activate? true})]
    (if (:error result)
      (log/errorf "Scheduled StarRez weekly export failed: %s" (:error result))
      (log/infof "Scheduled StarRez weekly export finished: %s" (pr-str result)))))

(defmethod task/init! ::StarRezWeeklyExport [_]
  (let [job     (jobs/build
                 (jobs/of-type StarRezWeeklyExport)
                 (jobs/with-identity weekly-export-job-key))
        trigger (triggers/build
                 (triggers/with-identity weekly-export-trigger-key)
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule "0 0 1 ? * MON *")
                   (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)))
