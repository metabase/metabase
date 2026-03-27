(ns metabase.mcp.task.session-cleanup
  "Periodic background task that garbage-collects expired MCP sessions and their
   associated embedding sessions.

   Runs every 30 minutes so that deletes stay small and frequent — better for
   Postgres autovacuum, InnoDB purge, and H2 compaction than a single large
   daily batch."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.mcp.session :as mcp.session]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(def ^:private job-key     (jobs/key "metabase.mcp.task.session-cleanup.job"))
(def ^:private trigger-key (triggers/key "metabase.mcp.task.session-cleanup.trigger"))

(task/defjob ^{:doc "Deletes expired MCP sessions and their embedding sessions."}
  McpSessionCleanup
  [_]
  (mcp.session/sweep-expired!))

(defmethod task/init! ::McpSessionCleanup [_]
  (let [job     (jobs/build
                 (jobs/of-type McpSessionCleanup)
                 (jobs/with-identity job-key))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; Every 30 minutes, on the hour and half-hour
                  (cron/cron-schedule "0 0/30 * * * ? *")))]
    (task/schedule-task! job trigger)))
