(ns metabase-enterprise.dependencies.task.result-metadata
  "Implements a task that re-derives the result metadata of the MBQL cards depending on entities whose result columns
  changed, see [[metabase-enterprise.dependencies.result-metadata]]."
  (:require
   [metabase-enterprise.dependencies.models.result-metadata-status :as deps.result-metadata-status]
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(defn- update-result-metadata!
  "Process a batch of stale entities, returning true if more are ready now: the full batch was taken, or a card changed
  while it was re-derived."
  []
  (when (premium-features/has-feature? :dependencies)
    (let [batch-size                 (deps.settings/dependency-result-metadata-batch-size)
          {:keys [taken conflicts?]} (deps.result-metadata/update-result-metadata!
                                      batch-size
                                      (deps.settings/dependency-result-metadata-delay-minutes))]
      (when (pos? taken)
        (log/info "Took" taken "entities for result metadata."))
      (and (pos? batch-size) (or conflicts? (>= taken batch-size))))))

(defn- has-pending-retries?
  "Whether any entity is in retry backoff that this instance can act on, failing open on an indeterminate token
  status like the dependency job."
  []
  (and (not (false? (premium-features/canonically-has-feature? :dependencies)))
       (deps.result-metadata-status/has-pending-retries?)))

(declare schedule-run!)

(defn- next-run-delay []
  (task.util/job-delay
   (deps.settings/dependency-result-metadata-delay-minutes)
   (deps.settings/dependency-result-metadata-variance-minutes)))

(defn- run-and-reschedule!
  "Process a batch, then run again right away when more are ready, or after the delay when retries are pending,
  rescheduling on the way out of a failure too."
  [scheduler]
  (try
    (cond
      (update-result-metadata!) (schedule-run! scheduler 1)
      (has-pending-retries?)    (schedule-run! scheduler (next-run-delay))
      :else                     (log/info "No more result metadata to update, stopping."))
    (catch Throwable e
      (schedule-run! scheduler (next-run-delay))
      (throw e))))

(task/defjob UpdateResultMetadata
  "Re-derive the result metadata of the MBQL cards depending on changed entities."
  {:saved-class "metabase_enterprise.dependencies.task.result_metadata.UpdateResultMetadata"
   :concurrent? false}
  [ctx]
  (log/info "Executing UpdateResultMetadata job...")
  (run-and-reschedule! (.getScheduler ^JobExecutionContext ctx)))

(def ^:private job-key     "metabase.dependencies.task.result-metadata.job")
(def ^:private trigger-key "metabase.dependencies.task.result-metadata.trigger")

(defn- schedule-run!
  "Schedule a run of the result metadata job `delay-in-seconds` from now."
  [scheduler delay-in-seconds]
  (task.util/schedule-run! scheduler
                           {:job-type    UpdateResultMetadata
                            :job-key     job-key
                            :trigger-key trigger-key
                            :job-name    "Update Result Metadata"}
                           delay-in-seconds))

(defn trigger-result-metadata-job!
  "Trigger the UpdateResultMetadata job to run after a brief delay, unless a MB_DEPENDENCY_RESULT_METADATA_BATCH_SIZE
  that isn't positive disables it."
  []
  (when (pos? (deps.settings/dependency-result-metadata-batch-size))
    (schedule-run! (task/scheduler) 1)))

(defmethod task/init! ::UpdateResultMetadata [_]
  (when-not (pos? (deps.settings/dependency-result-metadata-batch-size))
    (log/info "Dependency result metadata batch size is not positive; the job will run but process nothing"))
  (schedule-run!
   (task/scheduler)
   (task.util/job-initial-delay
    (deps.settings/dependency-result-metadata-variance-minutes))))
