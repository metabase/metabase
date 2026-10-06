(ns metabase-enterprise.content-diagnostics.task.scan
  "Quartz job that runs the Content Diagnostics scan on a schedule (stored durably)."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.premium-features.core :as premium-features]
   [metabase.task-history.core :as task-history]
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
  "Run the scan iff the `:content-diagnostics` premium feature is present, recording the firing in
  `task_history` either way - the job is scheduled on every EE instance regardless of token features."
  []
  (let [enabled? (premium-features/has-feature? :content-diagnostics)]
    (task-history/with-task-history
      {:task            "content-diagnostics-scan"
       :task_details    (when-not enabled? {:skipped-reason "content-diagnostics-disabled"})
       :on-success-info (fn [info result]
                          (if-let [scan-id (:scan_id result)]
                            (assoc-in info [:task_details :scan-id] scan-id)
                            info))}
      (when enabled?
        (scan/scan!)))))

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
