(ns metabase-enterprise.data-sensitivity.task.metadata-generation-runs
  "The node heartbeat of the metadata generation runs this node executes, and the clustered reaper of runs whose
  heartbeat is stale."
  (:require
   [metabase-enterprise.data-sensitivity.runner :as runner]
   [metabase.run-tracking.core :as rt]
   [metabase.task.core :as task]))

(defmethod task/init! ::MetadataGenerationRunHeartbeat [_]
  (rt/start-heartbeat! runner/heartbeat-tick! 1))

(defmethod task/init! ::MetadataGenerationRunReaper [_]
  (rt/schedule-reaper! {:job-key "metabase-enterprise.data-sensitivity.metadata-generation-run-reaper"
                        :label   "metadata generation run"
                        :reap-fn #(runner/reap-orphaned-runs! runner/heartbeat-stale-minutes)}))
