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

(declare ^:private job)

(defn- run-batch!
  "Analyze the stale entities, returning when to run again: after the delay, unless the dependencies feature is
  revoked."
  []
  (check-entities!)
  (when (task.util/feature-not-revoked?)
    (task.util/next-run-delay job)))

(task/defjob UpdateAnalysisFindings
  "Re-analyze the stale entities."
  {:saved-class "metabase_enterprise.dependencies.task.entity_check.DependencyEntityCheck"
   :concurrent? false}
  [ctx]
  (log/info "Executing UpdateAnalysisFindings job...")
  (task.util/run-and-reschedule! (.getScheduler ctx) job))

(def ^:private job
  {:job-type         UpdateAnalysisFindings
   :job-key          "metabase.dependencies.task.entity-check.job"
   :trigger-key      "metabase.dependencies.task.entity-check.trigger"
   :job-name         "Update Analysis Findings"
   :batch-size       deps.settings/dependency-entity-check-batch-size
   :delay-minutes    deps.settings/dependency-entity-check-delay-minutes
   :variance-minutes deps.settings/dependency-entity-check-variance-minutes
   :run!             #'run-batch!})

(defmethod task/init! ::UpdateAnalysisFindings [_]
  (task.util/init-job! job))

(defn trigger-analysis-finding-job!
  "Trigger the UpdateAnalysisFindings job, unless MB_DEPENDENCY_ENTITY_CHECK_BATCH_SIZE=0 disables it."
  []
  (task.util/trigger-run! job))
