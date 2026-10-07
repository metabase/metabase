(ns metabase-enterprise.content-diagnostics.task.scan
  "Quartz jobs that run the Content Diagnostics scan: daily on a schedule (stored durably), and once shortly
  after startup on an instance that has never scanned, so an upgrade doesn't leave the findings empty until
  the first scheduled run."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.content-diagnostics.db :as cd.db]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.premium-features.core :as premium-features]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def scan-job-key
  "Quartz key for the Content Diagnostics scan job."
  (jobs/key "metabase.task.content-diagnostics-scan.job"))

(def ^:private scan-trigger-key
  (triggers/key "metabase.task.content-diagnostics-scan.trigger"))

(def ^:private scan-task-name
  "The `task_history` task name for every scan run, scheduled or backfill - the backfill relies on finding
  its own rows under it to stay a one-off."
  "content-diagnostics-scan")

(defn- scan-when-enabled!
  "Run the scan iff the `:content-diagnostics` premium feature is present, recording the firing in
  `task_history` either way - the job is scheduled on every EE instance regardless of token features."
  ([]
   (scan-when-enabled! :cron))
  ([run-method]
   (let [enabled? (premium-features/has-feature? :content-diagnostics)]
     (task-history/with-task-history
       {:task            scan-task-name
        :task_details    (cond-> {:run-method run-method}
                           (not enabled?) (assoc :skipped-reason "content-diagnostics-disabled"))
        :on-success-info (fn [info result]
                           (if-let [scan-id (:scan_id result)]
                             (assoc-in info [:task_details :scan-id] scan-id)
                             info))}
       (when enabled?
         (scan/scan!))))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc                         "Content Diagnostics - scan for problematic content."}
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

;;; ------------------------------------------------ Upgrade backfill -----------------------------------------

;; Not the scan job's key: `task/schedule-task!` on an existing job replaces its first trigger when none matches
;; the new trigger's key, which would swap out the daily cron trigger.
(def ^:private backfill-job-key
  (jobs/key "metabase.task.content-diagnostics-scan-backfill.job"))

(def ^:private backfill-trigger-key
  (triggers/key "metabase.task.content-diagnostics-scan-backfill.trigger"))

(def ^:private backfill-startup-delay-seconds 60)

(defn- scanned-before?
  "Whether a real scan has run or is running.
  Firings skipped for the missing premium feature don't count, so an instance that ran the schedule unlicensed
  still qualifies for the backfill once licensed."
  []
  (boolean (some #(not (contains? % :skipped-reason))
                 (cd.db/task-history-details scan-task-name))))

(defn- backfill-scan!
  "Scan only if the instance has never scanned and has the `:content-diagnostics` feature. A skip only logs, so it
  leaves no `task_history` row."
  []
  (cond
    (scanned-before?)
    (log/info "Skipping Content Diagnostics upgrade backfill: a scan has already run")

    (cd.db/any-findings?)
    (log/info "Skipping Content Diagnostics upgrade backfill: findings already exist")

    (not (premium-features/has-feature? :content-diagnostics))
    (log/info "Skipping Content Diagnostics upgrade backfill: the :content-diagnostics feature is absent")

    :else
    (scan-when-enabled! :upgrade-backfill)))

(task/defjob ^{DisallowConcurrentExecution true
               :doc                         "Content Diagnostics - first scan after an upgrade."}
  ContentDiagnosticsScanBackfill [_ctx]
  (backfill-scan!))

(defmethod task/init! ::ContentDiagnosticsScanBackfill [_]
  ;; scheduled unconditionally - whether to scan is decided by the job body when it fires. The fixed trigger
  ;; key makes it one firing across a cluster of nodes booting together.
  (let [job     (jobs/build
                 (jobs/of-type ContentDiagnosticsScanBackfill)
                 (jobs/with-identity backfill-job-key)
                 (jobs/with-description "Content Diagnostics scan after an upgrade"))
        trigger (triggers/build
                 (triggers/with-identity backfill-trigger-key)
                 (triggers/for-job backfill-job-key)
                 (triggers/start-at (Date/from (.plusSeconds (Instant/now) (long backfill-startup-delay-seconds))))
                 (triggers/with-schedule
                  (simple/schedule
                   (simple/with-misfire-handling-instruction-fire-now))))]
    (task/schedule-task! job trigger)))
