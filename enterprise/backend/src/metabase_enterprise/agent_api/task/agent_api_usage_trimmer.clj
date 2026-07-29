(ns metabase-enterprise.agent-api.task.agent-api-usage-trimmer
  "Scheduled task to delete `agent_api_call_log` rows older than the configured
  `ai-usage-max-retention-days`. Mirrors the Metabot `ai-usage-trimmer` and the MCP usage
  trimmer: Agent API usage is collected on every EE instance, so its retention runs on every EE
  instance too — deliberately *not* audit-app-gated (which would let data grow unbounded on
  instances that collect but can't view it)."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private trimmer-job-key (jobs/key "metabase.task.agent-api.usage-trimmer.job"))
(def ^:private trimmer-trigger-key (triggers/key "metabase.task.agent-api.usage-trimmer.trigger"))

(defn- trim-old-agent-api-usage-data!
  []
  (let [retention-days (metabot.settings/ai-usage-max-retention-days)]
    (if (nil? retention-days)
      (log/info "Skipping Agent API usage log cleanup; ai-usage-max-retention-days is 0 (infinite retention).")
      (let [cutoff (t/minus (t/offset-date-time) (t/days (long retention-days)))]
        (log/infof "Trimming Agent API usage log rows older than %d days." (long retention-days))
        (let [calls (t2/delete! :model/AgentApiCallLog {:where [:< :created_at cutoff]})]
          (log/infof "Agent API usage log cleanup complete. Deleted %d call rows." (or calls 0)))))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Delete old Agent API usage log rows"}
  AgentApiUsageTrimmer [_ctx]
  (trim-old-agent-api-usage-data!))

(defmethod task/init! ::AgentApiUsageTrimmer
  [_]
  (let [job     (jobs/build
                 (jobs/of-type AgentApiUsageTrimmer)
                 (jobs/with-identity trimmer-job-key))
        trigger (triggers/build
                 (triggers/with-identity trimmer-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; Quartz 6-field cron (sec min hour day-of-month month day-of-week): daily at
                  ;; 23:24:41. The offset from the MCP trimmer's 23:19:41 just staggers the two
                  ;; independent jobs (different tables) so they don't fire at the same instant —
                  ;; it's not a dependency; overlapping runs would be harmless.
                  (cron/cron-schedule "41 24 23 * * ?")))]
    (task/schedule-task! job trigger)))
