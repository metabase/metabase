(ns metabase-enterprise.api-keys.task.api-key-usage-trimmer
  "Scheduled task to delete `api_key_usage_log` rows older than the configured
  `ai-usage-max-retention-days`. Mirrors the Metabot `ai-usage-trimmer`, the MCP usage trimmer, and
  the Agent API usage trimmer: API key usage is collected on every EE instance, so its retention
  runs on every EE instance too — deliberately *not* audit-app-gated (which would let data grow
  unbounded on instances that collect but can't view it)."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.api-keys.db :as api-keys.db]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private trimmer-job-key (jobs/key "metabase.task.api-keys.usage-trimmer.job"))
(def ^:private trimmer-trigger-key (triggers/key "metabase.task.api-keys.usage-trimmer.trigger"))

(defn- trim-old-api-key-usage-data!
  []
  (let [retention-days (metabot.settings/ai-usage-max-retention-days)]
    (if (nil? retention-days)
      (log/info "Skipping API key usage log cleanup; ai-usage-max-retention-days is 0 (infinite retention).")
      (let [cutoff (t/minus (t/offset-date-time) (t/days (long retention-days)))]
        (log/infof "Trimming API key usage log rows older than %d days." (long retention-days))
        (let [rows (api-keys.db/delete-usage-logs-occurred-before! cutoff)]
          (log/infof "API key usage log cleanup complete. Deleted %d rows." (or rows 0)))))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Delete old API key usage log rows"}
  ApiKeyUsageTrimmer [_ctx]
  (trim-old-api-key-usage-data!))

(defmethod task/init! ::ApiKeyUsageTrimmer
  [_]
  (let [job     (jobs/build
                 (jobs/of-type ApiKeyUsageTrimmer)
                 (jobs/with-identity trimmer-job-key))
        trigger (triggers/build
                 (triggers/with-identity trimmer-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; Quartz 6-field cron (sec min hour day-of-month month day-of-week): daily at
                  ;; 23:29:41. The offset from the MCP (23:19:41) and Agent API (23:24:41) trimmers
                  ;; just staggers the independent jobs (different tables) so they don't fire at the
                  ;; same instant — it's not a dependency; overlapping runs would be harmless.
                  (cron/cron-schedule "41 29 23 * * ?")))]
    (task/schedule-task! job trigger)))
