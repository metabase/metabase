(ns metabase-enterprise.content-diagnostics.task.scan
  "Quartz job that runs the Content Diagnostics scan: daily on a schedule (stored durably), and once shortly
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
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz JobExecutionContext ObjectAlreadyExistsException TriggerKey)))

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

;;; ------------------------------------------------ Upgrade backfill -----------------------------------------

;; A second trigger on the scan job rather than a job of its own, so `DisallowConcurrentExecution` keeps the two
;; runs from overlapping - each run's supersession would invalidate the other's findings.
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
    ;; cheapest first: the feature check is usually cached, and `scanned-before?` reads every `task_history` row
    ;; for the scan
    (not (premium-features/has-feature? :content-diagnostics))
    (log/info "Skipping Content Diagnostics upgrade backfill: the :content-diagnostics feature is absent")

    (cd.db/any-findings?)
    (log/info "Skipping Content Diagnostics upgrade backfill: findings already exist")

    (scanned-before?)
    (log/info "Skipping Content Diagnostics upgrade backfill: a scan has already run")

    :else
    (scan-when-enabled! :upgrade-backfill)))

;;; ---------------------------------------------------- Job --------------------------------------------------

(defn- scan-for-trigger!
  [^TriggerKey trigger-key]
  (let [backfill?  (= backfill-trigger-key trigger-key)
        ;; both triggers fire the one job, so its log context and span don't say which run this is
        run-method (if backfill? "upgrade-backfill" "cron")]
    (tracing/add-span-attrs! :tasks {:content-diagnostics/run-method run-method})
    (log/with-context {:content-diagnostics/run-method run-method}
      (if backfill?
        (backfill-scan!)
        (scan-when-enabled!)))))

(task/defjob ContentDiagnosticsScan
  "Content Diagnostics - scan for problematic content."
  {:saved-class "metabase_enterprise.content_diagnostics.task.scan.ContentDiagnosticsScan"
   :concurrent? false}
  [ctx]
  (scan-for-trigger! (.getKey (.getTrigger ^JobExecutionContext ctx))))

(defn- backfill-trigger []
  (triggers/build
   (triggers/with-identity backfill-trigger-key)
   (triggers/for-job scan-job-key)
   (triggers/start-at (Date/from (.plusSeconds (Instant/now) (long backfill-startup-delay-seconds))))
   (triggers/with-schedule
    (simple/schedule
     (simple/with-misfire-handling-instruction-fire-now)))))

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
    (task/schedule-task! job trigger))
  ;; added on its own: `task/schedule-task!` on the existing job would replace the cron trigger with it. A pending
  ;; one is replaced, so in a rolling upgrade it fires 60s after the last node boots, once old nodes have usually
  ;; drained.
  (let [trigger (backfill-trigger)]
    (try
      (task/add-trigger! trigger)
      (catch ObjectAlreadyExistsException _
        (task/reschedule-trigger! trigger)))))
