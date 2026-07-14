(ns metabase.agent-api.task.cleanup-expired-query-handles
  "Daily Quartz job that deletes the rows [[metabase.agent-api.handles]] no longer resolves, so the query
   handle store stays bounded by its TTL rather than by how many queries have ever been run."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.agent-api.handles :as handles]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Delete expired MCP query handles."}
  CleanupExpiredQueryHandles [_ctx]
  (log/infof "MCP query handle cleanup deleted %d rows" (handles/delete-expired-handles!)))

(def ^:private job-key     (jobs/key "metabase.task.agent-api.cleanup-expired-query-handles.job"))
(def ^:private trigger-key (triggers/key "metabase.task.agent-api.cleanup-expired-query-handles.trigger"))

(defmethod task/init! ::CleanupExpiredQueryHandles [_]
  (let [job     (jobs/build
                 (jobs/of-type CleanupExpiredQueryHandles)
                 (jobs/with-identity job-key))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; daily at 02:47
                  (cron/cron-schedule "0 47 2 * * ? *")))]
    (task/schedule-task! job trigger)))
