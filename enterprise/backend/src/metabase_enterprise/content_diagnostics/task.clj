(ns metabase-enterprise.content-diagnostics.task
  "Quartz job for the Content Diagnostics scan. The job is stored durably so it can be triggered on demand
  as a one-off run rather than scanning inline."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.content-diagnostics.detect :as detect]
   [metabase.task.core :as task])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def scan-job-key
  "Quartz key for the Content Diagnostics scan job."
  (jobs/key "metabase.task.content-diagnostics-scan.job"))

(def ^:private scan-trigger-key
  (triggers/key "metabase.task.content-diagnostics-scan.trigger"))

(task/defjob ^{DisallowConcurrentExecution true
               :doc                         "Content Diagnostics — scan for problematic content."}
  ContentDiagnosticsScan [_ctx]
  (detect/scan!))

(defn trigger-scan!
  "Enqueue an immediate one-off run of the scan job (runs on a Quartz worker, not inline)."
  []
  (task/trigger-now! scan-job-key))

(defmethod task/init! ::ContentDiagnosticsScan [_]
  (let [job     (jobs/build
                 (jobs/of-type ContentDiagnosticsScan)
                 (jobs/store-durably)
                 (jobs/with-identity scan-job-key)
                 (jobs/with-description "Content Diagnostics scan"))
        trigger (triggers/build
                 (triggers/with-identity scan-trigger-key)
                 (triggers/for-job scan-job-key)
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule "0 0 3 * * ? *")
                   (cron/with-misfire-handling-instruction-fire-and-proceed))))]
    (task/schedule-task! job trigger)))
