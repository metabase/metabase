(ns metabase-enterprise.metabot.task.ai-usage-trimmer
  "Scheduled task to delete old ai_usage_log rows (older than 3 months)."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Timestamp)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private trimmer-job-key (jobs/key "metabase.task.metabot.ai-usage-trimmer.job"))
(def ^:private trimmer-trigger-key (triggers/key "metabase.task.metabot.ai-usage-trimmer.trigger"))

(def ^:private retention-months 3)

(defn- trim-old-usage-data!
  []
  (log/info "Trimming old AI usage log data.")
  (let [cutoff (Timestamp/valueOf (.minusMonths (java.time.LocalDateTime/now) retention-months))
        deleted (t2/delete! :model/AiUsageLog {:where [:< :created_at cutoff]})]
    (log/infof "AI usage log cleanup complete. Deleted %d rows." (or deleted 0))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Delete old ai_usage_log rows"}
  AiUsageTrimmer [_ctx]
  (trim-old-usage-data!))

(defmethod task/init! ::AiUsageTrimmer
  [_]
  (let [job (jobs/build
             (jobs/of-type AiUsageTrimmer)
             (jobs/with-identity trimmer-job-key))
        trigger (triggers/build
                 (triggers/with-identity trimmer-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; daily at 23:14:37
                  (cron/cron-schedule "37 14 23 * * ?")))]
    (task/schedule-task! job trigger)))
