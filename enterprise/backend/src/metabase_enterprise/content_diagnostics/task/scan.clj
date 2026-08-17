(ns metabase-enterprise.content-diagnostics.task.scan
  "Quartz job that runs the Content Diagnostics scan on a schedule (stored durably)."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def scan-job-key
  "Quartz key for the Content Diagnostics scan job."
  (jobs/key "metabase.task.content-diagnostics-scan.job"))

(def ^:private scan-trigger-key
  (triggers/key "metabase.task.content-diagnostics-scan.trigger"))

(defn- scan-when-enabled!
  "Run the scan iff the `:content-diagnostics` premium feature is present — the job is scheduled on
  every EE instance regardless of token features."
  []
  (when (premium-features/has-feature? :content-diagnostics)
    (scan/scan!)))

(task/defjob ^{DisallowConcurrentExecution true
               :doc                         "Content Diagnostics — scan for problematic content."}
  ContentDiagnosticsScan [_ctx]
  (scan-when-enabled!))

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
                   (cron/cron-schedule "0 0 4 * * ? *")
                   (cron/with-misfire-handling-instruction-fire-and-proceed))))]
    (task/schedule-task! job trigger)))
