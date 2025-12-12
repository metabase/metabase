(ns metabase-enterprise.semantic-search.task.index-repair
  "Task to run repair-index! hourly for semantic search maintenance."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.semantic-search.core :as semantic-search.core]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private repair-job-key (jobs/key "metabase.task.semantic-index-repair.job"))
(def ^:private repair-trigger-key (triggers/key "metabase.task.semantic-index-repair.trigger"))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Runs repair-index! to maintain semantic search consistency"}
  SemanticIndexRepair [_ctx]
  (when (semantic.u/semantic-search-available?)
    (log/with-context {:quartz-job-type 'SemanticIndexRepair}
      (try
        (log/info "Starting semantic search index repair")
        (semantic-search.core/repair-index! (search.ingestion/searchable-documents))
        (log/info "Completed semantic search index repair")
        (catch Exception e
          (log/error e "Failed to complete semantic search index repair"))))))

(defmethod task/init! ::SemanticIndexRepair [_]
  (when (semantic.u/semantic-search-available?)
    (let [job (jobs/build
               (jobs/of-type SemanticIndexRepair)
               (jobs/with-identity repair-job-key))
          trigger (triggers/build
                   (triggers/with-identity repair-trigger-key)
                   (triggers/start-now)
                   (triggers/with-schedule
                  ;; Run hourly at minute 15
                    (cron/cron-schedule "0 15 * * * ? *")))]
      (task/schedule-task! job trigger))))
