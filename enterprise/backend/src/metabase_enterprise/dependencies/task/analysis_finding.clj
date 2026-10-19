(ns metabase-enterprise.dependencies.task.analysis-finding
  (:require
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- run-batch!
  "Analyze a batch of entities whose findings are outdated, returning when to run again: right away when it took any,
  or nil."
  []
  (when (premium-features/has-feature? :dependencies)
    (let [batch-size (deps.settings/dependency-entity-check-batch-size)
          analyzed   (reduce (fn [taken entity-type]
                               (let [analyzed (deps.analysis-finding/analyze-batch! entity-type batch-size)]
                                 (when (pos? analyzed)
                                   (log/info "Analyzed" analyzed "entities of type" entity-type))
                                 (+ taken analyzed)))
                             0
                             deps.analysis-finding/analyzable-entities)]
      (when (pos? analyzed)
        1))))

(declare ^:private job)

(task/defjob UpdateAnalysisFindings
  "Re-analyze the entities that changed or whose upstreams changed."
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
