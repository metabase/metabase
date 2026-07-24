(ns metabase-enterprise.semantic-search.task.index-repair
  "Task to run repair-index! hourly for semantic search maintenance."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.semantic-search.core :as semantic-search.core]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private repair-job-key (jobs/key "metabase.task.semantic-index-repair.job"))
(def ^:private repair-trigger-key (triggers/key "metabase.task.semantic-index-repair.trigger"))

(defn- repair-index! []
  (try
    (log/info "Starting semantic search index repair")
    ;; Keep the cache bound while the document eduction is realized inside repair-index!.
    (lib-be/with-metadata-provider-cache
      (let [{:keys [index-id orphans snapshot-at]}
            (semantic-search.core/repair-index! (search.ingestion/searchable-documents))]
        (semantic.health/report-repair-metrics! index-id {:orphan-count orphans
                                                          :snapshot-at  snapshot-at})))
    (log/info "Completed semantic search index repair")
    (catch InterruptedException e
      (semantic.health/report-repair-metrics! nil)
      (throw e))
    (catch Exception e
      ;; Invalidate the shared snapshot when the producing job fails.
      (semantic.health/report-repair-metrics! nil)
      (log/error e "Failed to complete semantic search index repair"))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Runs repair-index! to maintain semantic search consistency"}
  SemanticIndexRepair [_ctx]
  (when (semantic.u/semantic-search-active?)
    (log/with-context {:quartz-job-type 'SemanticIndexRepair}
      (repair-index!))))

(defmethod task/init! ::SemanticIndexRepair [_]
  (when (semantic.u/semantic-search-configured?)
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
