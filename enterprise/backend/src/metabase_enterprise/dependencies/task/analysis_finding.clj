(ns metabase-enterprise.dependencies.task.analysis-finding
  (:require
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-rounds
  "How many batches a run takes at most before it leaves the rest to its next run."
  20)

(defn- process-one-batch!
  "Analyze a batch of entities whose own findings are outdated, then a batch of the dependents of changed entities,
  returning how many entities it took."
  []
  (let [batch-size (deps.settings/dependency-entity-check-batch-size)
        own        (reduce (fn [taken entity-type]
                             (let [analyzed (deps.analysis-finding/analyze-batch! entity-type batch-size)]
                               (when (pos? analyzed)
                                 (log/info "Analyzed" analyzed "entities of type" entity-type))
                               (+ taken analyzed)))
                           0
                           deps.analysis-finding/analyzable-entities)
        dependents (deps.analysis-finding/analyze-dependents-batch! batch-size)]
    (when (pos? dependents)
      (log/info "Analyzed the dependents of" dependents "entities"))
    (+ own dependents)))

(defn- check-entities!
  "Analyze batches until one takes nothing, or up to [[max-rounds]] of them, returning whether the last one took
  anything."
  []
  (when (and (premium-features/has-feature? :dependencies)
             (pos? (deps.settings/dependency-entity-check-batch-size)))
    (loop [round 1]
      (let [took? (pos? (process-one-batch!))]
        (if (and took? (< round max-rounds))
          (recur (inc round))
          took?)))))

(declare ^:private job)

(defn- run-batch!
  "Analyze what changed, returning when to run again: right away when work is left, otherwise after the delay, unless
  the dependencies feature is revoked."
  []
  (cond
    (check-entities!)                  1
    (task.util/feature-not-revoked?)   (task.util/next-run-delay job)))

(task/defjob UpdateAnalysisFindings
  "Re-analyze the changed entities and the dependents of changed entities."
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
   :run-batch!       #'run-batch!})

(defmethod task/init! ::UpdateAnalysisFindings [_]
  (task.util/init-job! job))

(defn trigger-analysis-finding-job!
  "Trigger the UpdateAnalysisFindings job, unless MB_DEPENDENCY_ENTITY_CHECK_BATCH_SIZE=0 disables it."
  []
  (task.util/trigger-run! job))
