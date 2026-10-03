(ns metabase-enterprise.content-diagnostics.task.finding-trimmer
  "Scheduled task to delete invalidated Content Diagnostics findings once they pass the retention
  window. Nothing else deletes them - the scan and the archive event handlers only stamp
  `invalidated_at` - so without this the table grows without bound."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private trimmer-job-key
  (jobs/key "metabase.task.content-diagnostics-finding-trimmer.job"))

(def ^:private trimmer-trigger-key
  (triggers/key "metabase.task.content-diagnostics-finding-trimmer.trigger"))

(defn- trim-old-findings!
  "Delete findings invalidated longer ago than the retention window. Runs whatever the token features
  are, unlike the scan job - a lapsed `:content-diagnostics` token would otherwise strand invalidated
  rows forever."
  []
  (let [cutoff  (t/minus (t/offset-date-time)
                         (t/days (long (cd.settings/content-diagnostics-finding-retention-days))))
        deleted (finding/delete-invalidated-before! cutoff)]
    (log/infof "Trimmed %d Content Diagnostics finding(s) invalidated before %s" deleted cutoff)))

(task/defjob ^{DisallowConcurrentExecution true
               :doc                         "Content Diagnostics - delete invalidated findings past retention."}
  ContentDiagnosticsFindingTrimmer [_ctx]
  (trim-old-findings!))

(defmethod task/init! ::ContentDiagnosticsFindingTrimmer [_]
  (let [job     (jobs/build
                 (jobs/of-type ContentDiagnosticsFindingTrimmer)
                 (jobs/store-durably)
                 (jobs/with-identity trimmer-job-key)
                 (jobs/with-description "Content Diagnostics finding trimmer"))
        trigger (triggers/build
                 (triggers/with-identity trimmer-trigger-key)
                 (triggers/for-job trimmer-job-key)
                 (triggers/with-schedule
                  (cron/schedule
                   ;; 16:00, twelve hours off the scan's 04:00 - both jobs write to
                   ;; content_diagnostics_finding, so they are deliberately kept apart
                   (cron/cron-schedule "0 0 16 * * ? *")
                   (cron/with-misfire-handling-instruction-fire-and-proceed))))]
    (task/schedule-task! job trigger)))
