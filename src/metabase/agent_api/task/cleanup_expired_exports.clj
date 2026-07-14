(ns metabase.agent-api.task.cleanup-expired-exports
  "Daily Quartz job that deletes the export files [[metabase.agent-api.exports]] no longer serves, so the store
   stays bounded by its TTL rather than by how many files have ever been generated. A row here holds a whole
   file, so an unswept store costs the application database far more than an unswept query handle does."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.agent-api.exports :as exports]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Delete expired MCP export files."}
  CleanupExpiredExports [_ctx]
  (log/infof "MCP export cleanup deleted %d rows" (exports/delete-expired-exports!)))

(def ^:private job-key     (jobs/key "metabase.task.agent-api.cleanup-expired-exports.job"))
(def ^:private trigger-key (triggers/key "metabase.task.agent-api.cleanup-expired-exports.trigger"))

(defmethod task/init! ::CleanupExpiredExports [_]
  (let [job     (jobs/build
                 (jobs/of-type CleanupExpiredExports)
                 (jobs/with-identity job-key))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; hourly at :17, because a download link's TTL is measured in hours
                  (cron/cron-schedule "0 17 * * * ? *")))]
    (task/schedule-task! job trigger)))
