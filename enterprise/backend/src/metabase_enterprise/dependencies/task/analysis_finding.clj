(ns metabase-enterprise.dependencies.task.analysis-finding
  "The job that runs the analysis of the entities whose AnalysisFindingStatus is stale, missing or outdated."
  (:require
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mu/defn- run-batch! :- [:maybe ms/PositiveInt]
  "Analyze a batch of entities whose findings are outdated, returning when to run again: a second from now when it took
  any, or nil."
  []
  (when (premium-features/has-feature? :dependencies)
    (let [batch-size (deps.settings/dependency-entity-check-batch-size)
          taken      (deps.analysis-finding/analyze-batch! batch-size)]
      (when (pos? taken)
        (log/debug "Processed" taken "entities for analysis")
        1))))

(declare ^:private job)

(task/defjob UpdateAnalysisFindings
  "Re-analyze the entities that changed or whose upstreams changed."
  {:saved-class "metabase_enterprise.dependencies.task.entity_check.DependencyEntityCheck"
   :concurrent? false}
  [ctx]
  (log/debug "Executing UpdateAnalysisFindings job...")
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

(mu/defn trigger-analysis-finding-job! :- :any
  "Trigger the UpdateAnalysisFindings job, unless a MB_DEPENDENCY_ENTITY_CHECK_BATCH_SIZE that isn't positive
  disables it."
  []
  (task.util/trigger-run! job))
