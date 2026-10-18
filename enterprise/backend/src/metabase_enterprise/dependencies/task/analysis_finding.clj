(ns metabase-enterprise.dependencies.task.analysis-finding
  (:require
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- process-one-batch!
  "Process one batch of entities. Returns true if the full batch was used."
  []
  (-> (reduce (fn [batch-size entity-type]
                (if (< batch-size 1)
                  (reduced 0)
                  (let [processed (deps.findings/analyze-batch! entity-type batch-size)]
                    (when (pos? processed)
                      (log/info "Updated" processed "entities of type" entity-type))
                    (- batch-size processed))))
              (deps.settings/dependency-entity-check-batch-size)
              deps.findings/analyzable-entities)
      (< 1)))

(defn- check-entities!
  "Analyze stale entities in batches until none are left or a pass stops reducing their count."
  []
  (when (premium-features/has-feature? :dependencies)
    (loop [prev-stale nil]
      (process-one-batch!)
      (let [stale (deps.analysis-finding/stale-entity-count)]
        (when (and (pos? stale)
                   (or (nil? prev-stale) (< stale prev-stale)))
          (recur stale))))))

(declare schedule-run!)

(defn- reschedule-after-run!
  "Schedule the next run of the analysis finding job unless the `:dependencies` feature is definitively absent."
  [scheduler]
  (if (false? (premium-features/canonically-has-feature? :dependencies))
    (log/debug "Not rescheduling job Update Analysis Findings: the dependencies feature is not enabled")
    (schedule-run! scheduler
                   (task.util/job-delay
                    (deps.settings/dependency-entity-check-delay-minutes)
                    (deps.settings/dependency-entity-check-variance-minutes)))))

(task/defjob UpdateAnalysisFindings
  "Re-analyze the stale entities."
  {:saved-class "metabase_enterprise.dependencies.task.entity_check.DependencyEntityCheck"
   :concurrent? false}
  [ctx]
  (log/info "Executing UpdateAnalysisFindings job...")
  (check-entities!)
  (reschedule-after-run! (.getScheduler ctx)))

(def ^:private job-key     "metabase.dependencies.task.entity-check.job")
(def ^:private trigger-key "metabase.dependencies.task.entity-check.trigger")

(defn- schedule-run!
  "Schedule a run of the analysis finding job `delay-in-seconds` from now."
  [scheduler delay-in-seconds]
  (task.util/schedule-run! scheduler
                           {:job-type    UpdateAnalysisFindings
                            :job-key     job-key
                            :trigger-key trigger-key
                            :job-name    "Update Analysis Findings"}
                           delay-in-seconds))

(defmethod task/init! ::UpdateAnalysisFindings [_]
  (when-not (pos? (deps.settings/dependency-entity-check-batch-size))
    (log/info "Analysis finding job batch size is not positive; the job will run but process nothing"))
  (schedule-run!
   (task/scheduler)
   (task.util/job-initial-delay
    (deps.settings/dependency-entity-check-variance-minutes))))

(defn trigger-analysis-finding-job!
  "Trigger the UpdateAnalysisFindings job to run after a brief delay, unless the batch size disables it.

  The 1-second delay ensures the calling transaction has committed before the job checks for stale entities. Entity
  changes fire this, so leaving it ungated is what made a disabled job wake roughly once a second; the job's own
  periodic schedule is left alone so it still resumes if the batch size becomes positive.

  Disable with MB_DEPENDENCY_ENTITY_CHECK_BATCH_SIZE=0"
  []
  (when (pos? (deps.settings/dependency-entity-check-batch-size))
    (schedule-run! (task/scheduler) 1)))
