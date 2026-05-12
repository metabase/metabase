(ns metabase-enterprise.metabot.task.ai-usage-trimmer
  "Scheduled task to delete `ai_usage_log` rows older than the configured `ai-usage-max-retention-days`."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.metabot.settings :as metabot.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private trimmer-job-key (jobs/key "metabase.task.metabot.ai-usage-trimmer.job"))
(def ^:private trimmer-trigger-key (triggers/key "metabase.task.metabot.ai-usage-trimmer.trigger"))

(defn- trim-old-usage-data!
  []
  (let [retention-days (metabot.settings/ai-usage-max-retention-days)]
    (if (infinite? retention-days)
      (log/info "Skipping AI usage log cleanup; ai-usage-max-retention-days is 0 (infinite retention).")
      (do
        (log/infof "Trimming AI usage log rows older than %d days." (long retention-days))
        (let [cutoff  (t/minus (t/offset-date-time) (t/days (long retention-days)))
              deleted (t2/delete! :model/AiUsageLog {:where [:< :created_at cutoff]})]
          (log/infof "AI usage log cleanup complete. Deleted %d rows." (or deleted 0)))))))

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
