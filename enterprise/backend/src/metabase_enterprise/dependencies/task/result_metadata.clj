(ns metabase-enterprise.dependencies.task.result-metadata
  "Implements a task that re-derives the result metadata of the MBQL cards depending on entities whose result columns
  changed, see [[metabase-enterprise.dependencies.result-metadata]]."
  (:require
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(declare ^:private job)

(defn- run-batch!
  "Process a batch of changed entities, having every job see the cards it re-derived, whose stores fire no hooks,
  returning when to run again: right away when it took any, since a card it stored is changed in turn, or nil."
  []
  (when (premium-features/has-feature? :dependencies)
    (let [batch-size (deps.settings/dependency-result-metadata-batch-size)
          taken      (if (pos? batch-size) (deps.result-metadata/update-result-metadata! batch-size) 0)]
      (when (pos? taken)
        (log/info "Took" taken "entities for result metadata.")
        (task.util/trigger-all-jobs!))
      (when (pos? taken)
        1))))

(task/defjob UpdateResultMetadata
  "Re-derive the result metadata of the MBQL cards depending on changed entities."
  {:saved-class "metabase_enterprise.dependencies.task.result_metadata.UpdateResultMetadata"
   :concurrent? false}
  [ctx]
  (log/info "Executing UpdateResultMetadata job...")
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

(task.util/register-job! job)

(defn trigger-result-metadata-job!
  "Trigger the UpdateResultMetadata job, unless MB_DEPENDENCY_RESULT_METADATA_BATCH_SIZE=0 disables it."
  []
  (task.util/trigger-run! job))

(defmethod task/init! ::UpdateResultMetadata [_]
  (task.util/init-job! job))
