(ns metabase.mcp.task.mcp-query-handle-gc
  "Scheduled task that deletes `mcp_query_handle` rows older than
  [[metabase.mcp.settings/mcp-query-handle-ttl-hours]]. Handles tied to a live session are also
  reaped by the `core_session` FK cascade and the explicit session delete; this task catches
  handles whose sessions outlive the TTL, since every execute mints a handle and volume grows
  much faster than sessions are torn down. Drill-through handles share the store and age out on
  the same TTL."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.mcp.models.mcp-query-handle]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private gc-job-key (jobs/key "metabase.task.mcp.query-handle-gc.job"))
(def ^:private gc-trigger-key (triggers/key "metabase.task.mcp.query-handle-gc.trigger"))

(defn- gc-expired-query-handles!
  []
  (let [ttl-hours (mcp.settings/mcp-query-handle-ttl-hours)
        cutoff    (t/minus (t/offset-date-time) (t/hours (long ttl-hours)))
        deleted   (t2/delete! :model/McpQueryHandle {:where [:< :created_at cutoff]})]
    (log/infof "MCP query handle GC complete. Deleted %d handle(s) older than %d hours."
               (or deleted 0) (long ttl-hours))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Delete expired MCP query handles"}
  McpQueryHandleGc [_ctx]
  (gc-expired-query-handles!))

(defmethod task/init! ::McpQueryHandleGc
  [_]
  (let [job     (jobs/build
                 (jobs/of-type McpQueryHandleGc)
                 (jobs/with-identity gc-job-key))
        trigger (triggers/build
                 (triggers/with-identity gc-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; daily at 23:27:11 (offset from the MCP usage trimmer's 23:19:41)
                  (cron/cron-schedule "11 27 23 * * ?")))]
    (task/schedule-task! job trigger)))
