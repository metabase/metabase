(ns metabase-enterprise.dependencies.task.result-metadata
  "Implements a task that re-derives the result metadata of the MBQL cards depending on changed entities, see
  [[metabase-enterprise.dependencies.result-metadata]]."
  (:require
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(declare ^:private job)

(mu/defn- run-batch! :- [:maybe ms/PositiveInt]
  "Re-derive a batch of stale cards, returning when to run again: a second from now when it took any, or nil."
  []
  (when (premium-features/has-feature? :dependencies)
    (let [taken (deps.result-metadata/update-result-metadata! (deps.settings/dependency-result-metadata-batch-size))]
      (when (pos? taken)
        (log/debug "Processed" taken "entities for result metadata")
        1))))

(task/defjob UpdateResultMetadata
  "Re-derive the result metadata of the MBQL cards depending on changed entities."
  {:saved-class "metabase_enterprise.dependencies.task.result_metadata.UpdateResultMetadata"
   :concurrent? false}
  [ctx]
  (log/debug "Executing UpdateResultMetadata job...")
  (task.util/run-and-reschedule! (.getScheduler ^JobExecutionContext ctx) job))

(def ^:private job
  {:job-type         UpdateResultMetadata
   :job-key          "metabase.dependencies.task.result-metadata.job"
   :trigger-key      "metabase.dependencies.task.result-metadata.trigger"
   :job-name         "Update Result Metadata"
   :batch-size       deps.settings/dependency-result-metadata-batch-size
   :delay-minutes    deps.settings/dependency-result-metadata-delay-minutes
   :variance-minutes deps.settings/dependency-result-metadata-variance-minutes
   :run-batch!       #'run-batch!})

(mu/defn trigger-result-metadata-job! :- :any
  "Trigger the UpdateResultMetadata job, unless a MB_DEPENDENCY_RESULT_METADATA_BATCH_SIZE that isn't positive
  disables it."
  []
  (task.util/trigger-run! job))

(defmethod task/init! ::UpdateResultMetadata [_]
  (task.util/init-job! job))
