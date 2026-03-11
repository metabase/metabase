(ns metabase-enterprise.replacement.timeout
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase-enterprise.replacement.timeout")

(defn- cleanup-failed-convert-runs!
  "Delete orphaned transform records from failed convert-to-transform runs.
   Deletes the transform record (not the output table) and clears the transform_id
   on the run so it won't be retried."
  []
  (doseq [run (replacement-run/failed-convert-runs-with-transforms)]
    (try
      (log/infof "Cleaning up transform %d from failed convert run %d"
                 (:transform_id run) (:id run))
      (t2/delete! :model/Transform :id (:transform_id run))
      (t2/update! :model/ReplacementRun :id (:id run) {:transform_id nil})
      (catch Throwable t
        (log/errorf t "Error cleaning up transform %d from run %d"
                    (:transform_id run) (:id run))))))

(defn- timeout-replacement-runs! [_ctx]
  (log/trace "Timing out old source replacement runs.")
  (try
    (replacement-run/timeout-old-runs! 30 :minute)
    (catch Throwable t
      (log/error t "Error timing out old source replacement runs.")))
  (try
    (cleanup-failed-convert-runs!)
    (catch Throwable t
      (log/error t "Error cleaning up failed convert runs."))))

(task/defjob ^{:doc "Timeout long-running source replacement runs."
               org.quartz.DisallowConcurrentExecution true}
  TimeoutReplacementRuns [ctx]
  (timeout-replacement-runs! ctx))

(defn- start-job! []
  (when (not (task/job-exists? job-key))
    (let [job     (jobs/build
                   (jobs/of-type TimeoutReplacementRuns)
                   (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key job-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                    (calendar-interval/schedule
                     (calendar-interval/with-interval-in-minutes 10)
                     (calendar-interval/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))

(defmethod task/init! ::TimeoutReplacementRuns [_]
  (log/info "Scheduling timeout source replacement runs task.")
  (start-job!))
