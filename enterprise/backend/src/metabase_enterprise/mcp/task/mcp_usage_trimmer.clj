(ns metabase-enterprise.mcp.task.mcp-usage-trimmer
  "Scheduled task to delete `mcp_tool_call_log` / `mcp_session_log` rows older than the configured
  `ai-usage-max-retention-days`. Mirrors the Metabot `ai-usage-trimmer`: MCP usage is collected on
  every EE instance, so its retention runs on every EE instance too — deliberately *not*
  audit-app-gated (which would let data grow unbounded on instances that collect but can't view it)."
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

(def ^:private trimmer-job-key (jobs/key "metabase.task.mcp.usage-trimmer.job"))
(def ^:private trimmer-trigger-key (triggers/key "metabase.task.mcp.usage-trimmer.trigger"))

(defn- trim-old-mcp-usage-data!
  []
  (let [retention-days (metabot.settings/ai-usage-max-retention-days)]
    (if (nil? retention-days)
      (log/info "Skipping MCP usage log cleanup; ai-usage-max-retention-days is 0 (infinite retention).")
      (let [cutoff (t/minus (t/offset-date-time) (t/days (long retention-days)))]
        (log/infof "Trimming MCP usage log rows older than %d days." (long retention-days))
        ;; Each table is pruned independently by its own created_at. Tool-call rows are
        ;; self-contained (identity is denormalized onto them, no session link), so pruning a
        ;; session row can never orphan a tool call.
        (let [calls    (t2/delete! :model/McpToolCallLog {:where [:< :created_at cutoff]})
              sessions (t2/delete! :model/McpSessionLog {:where [:< :created_at cutoff]})]
          (log/infof "MCP usage log cleanup complete. Deleted %d tool-call and %d session rows."
                     (or calls 0) (or sessions 0)))))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Delete old MCP usage log rows"}
  McpUsageTrimmer [_ctx]
  (trim-old-mcp-usage-data!))

(defmethod task/init! ::McpUsageTrimmer
  [_]
  (let [job     (jobs/build
                 (jobs/of-type McpUsageTrimmer)
                 (jobs/with-identity trimmer-job-key))
        trigger (triggers/build
                 (triggers/with-identity trimmer-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; daily at 23:19:41 (offset from the ai-usage trimmer's 23:14:37)
                  (cron/cron-schedule "41 19 23 * * ?")))]
    (task/schedule-task! job trigger)))
