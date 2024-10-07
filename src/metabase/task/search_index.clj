(ns metabase.task.search-index
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.search :as search]
   [metabase.task :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

;; This is problematic multi-instance deployments, see below.
(def ^:private recreated? (atom false))

(def job-key
  "Key used to define and trigger the search-index task."
  (jobs/key "metabase.task.search-index.job"))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Populate Search Index"}
  SearchIndexing [_ctx]
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

(defmethod task/init! ::SearchIndex [_]
  (let [job     (jobs/build
                 (jobs/of-type SearchIndexing)
                 (jobs/with-identity job-key))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key "metabase.task.search-index.trigger"))
                 (triggers/start-now)
                 (triggers/with-schedule
                  (simple/schedule (simple/with-interval-in-hours 1))))]
    (task/schedule-task! job trigger)))
