(ns metabase.task.search-index
  ;; metabase.search.postgres.ingestion has not been exposed publicly yet, it needs a higher level API
  #_{:clj-kondo/ignore [:metabase/ns-module-checker]}
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.search :as search]
   [metabase.search.postgres.ingestion :as search.ingestion]
   [metabase.task :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

;; This is problematic multi-instance deployments, see below.
(def ^:private recreated? (atom false))

(def job-key-full
  "Key used to define and trigger the search-index-full task."
  (jobs/key "metabase.task.search-index-full.job"))

(def job-key-incremental
  "Key used to define and trigger the search-index-incremental task."
  (jobs/key "metabase.task.search-index-incremental.job"))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Populate Search Index"}
  SearchIndexFull [_ctx]
  (when (search/supports-index?)
    (if (not @recreated?)
      (do (log/info "Recreating search index from the latest schema")
          ;; Each instance in a multi-instance deployment will recreate the table the first time it is selected to run
          ;; the job, resulting in a momentary lack of search results.
          ;; One solution to this would be to store metadata about the index in another table, which we can use to
          ;; determine whether it was built by another version of Metabase and should be rebuilt.
          (search/init-index! {:force-reset? (not @recreated?)})
          (reset! recreated? true))
      (do (log/info "Reindexing searchable entities")
          (search/reindex!)))
    (log/info "Done indexing.")))

(defmethod task/init! ::SearchIndexFull [_]
  (let [job         (jobs/build
                     (jobs/of-type SearchIndexFull)
                     (jobs/store-durably)
                     (jobs/with-identity job-key-full))
        trigger-key (triggers/key "metabase.task.search-index-full.trigger")
        trigger     (triggers/build
                     (triggers/with-identity trigger-key)
                     (triggers/start-now)
                     (triggers/with-schedule
                      (simple/schedule (simple/with-interval-in-hours 1))))]
    ;; For some reason, using the schedule-task! with a non-durable job causes it to only fire on the first trigger.
    #_(task/schedule-task! job trigger)
    (task/delete-task! job-key-incremental trigger-key)
    (task/add-job! job)
    (task/add-trigger! trigger)))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Keep Search Index updated"}
  SearchIndexIncremental [_ctx]
  (when (search/supports-index?)
    (while true
      (let [updated-entry-count (search.ingestion/process-next-batch Long/MAX_VALUE 100)]
        (when (pos? updated-entry-count)
          (log/infof "Updated %d search index entries" updated-entry-count))))))

(defmethod task/init! ::SearchIndexIncremental [_]
  (let [job         (jobs/build
                     (jobs/of-type SearchIndexIncremental)
                     (jobs/store-durably)
                     (jobs/with-identity job-key-incremental))
        trigger-key (triggers/key "metabase.task.search-index-incremental.trigger")
        trigger     (triggers/build
                     (triggers/with-identity trigger-key)
                     (triggers/for-job job-key-incremental)
                     (triggers/start-now)
                     ;; This schedule is only here to restart the task if it dies for some reason.
                     (triggers/with-schedule (simple/schedule (simple/with-interval-in-seconds 1))))]
    ;; For some reason, using the schedule-task! with a non-durable job causes it to only fire on the first trigger.
    #_(task/schedule-task! job trigger)
    (task/delete-task! job-key-incremental trigger-key)
    (task/add-job! job)
    (task/add-trigger! trigger)))

(comment
  (task/job-exists? job-key-full)
  (task/job-exists? job-key-incremental))
