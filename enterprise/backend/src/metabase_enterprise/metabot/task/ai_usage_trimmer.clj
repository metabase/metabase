(ns metabase-enterprise.metabot.task.ai-usage-trimmer
  "Scheduled task to delete `ai_usage_log`, `metabot_llm_call` and `metabot_tool_call` rows older than the configured
  `ai-usage-max-retention-days`."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.analytics-interface.core :as analytics]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.models.ai-usage-log :as ai-usage-log]
   [metabase.metabot.models.metabot-llm-call :as metabot-llm-call]
   [metabase.metabot.models.metabot-tool-call :as metabot-tool-call]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private trimmer-job-key (jobs/key "metabase.task.metabot.ai-usage-trimmer.job"))
(def ^:private trimmer-trigger-key (triggers/key "metabase.task.metabot.ai-usage-trimmer.trigger"))

(defn- trim-old-usage-data!
  []
  (let [retention-days (metabot.settings/ai-usage-max-retention-days)]
    (if (nil? retention-days)
      (log/info "Skipping AI usage log cleanup; ai-usage-max-retention-days is 0 (infinite retention).")
      (do
        (log/infof "Trimming AI usage log rows older than %d days." (long retention-days))
        (let [cutoff        (t/minus (t/offset-date-time) (t/days (long retention-days)))
              ids           (metabot.db/usage-log-ids-created-before cutoff)
              ;; Tool calls first: the delete of an LLM call cascades to its tool calls, whatever their age.
              tool-call-ids (metabot.db/tool-call-ids-created-before cutoff)
              llm-call-ids  (metabot.db/llm-call-ids-started-before cutoff)]
          (metabot-tool-call/delete-metabot-tool-calls! tool-call-ids)
          (metabot-llm-call/delete-metabot-llm-calls! llm-call-ids)
          ;; Usage rows last: the delete of one clears `usage_log_id` on the LLM call that names it, and the old LLM
          ;; calls are gone by now.
          (ai-usage-log/delete-ai-usage-logs! ids)
          ;; Only the rows deleted by age: the cascade from an LLM call can delete more tool calls.
          (analytics/inc! :metabase-metabot/call-records-trimmed {:table "metabot_tool_call"} (count tool-call-ids))
          (analytics/inc! :metabase-metabot/call-records-trimmed {:table "metabot_llm_call"} (count llm-call-ids))
          (log/infof "AI usage log cleanup complete. Deleted %d rows, %d LLM call records and %d tool call records."
                     (count ids) (count llm-call-ids) (count tool-call-ids)))))))

(task/defjob AiUsageTrimmer
  "Delete old ai_usage_log rows"
  {:saved-class "metabase_enterprise.metabot.task.ai_usage_trimmer.AiUsageTrimmer"
   :concurrent? false}
  [_ctx]
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
