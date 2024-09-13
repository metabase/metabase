(ns metabase.task.search-index
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.search :as search]
   [metabase.settings :as settings]
   [metabase.task :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

;; We need each instance to initialize on start-up currently, this will need to be refined.
(jobs/defjob ^{DisallowConcurrentExecution false
               :doc                        "Populate Search Index"}
  SearchIndexing [_ctx]
  (when (settings/experimental-fulltext-search-enabled)
    (log/info "Recreating search index from latest schema")
    (search/init-index! {:force-reset? true})
    (log/info "Populating search index")
    (search/reindex!)
    (log/info "Done indexing.")))

(defmethod task/init! ::SearchIndex [_]
  (let [job     (jobs/build
                 (jobs/of-type SearchIndexing)
                 (jobs/with-identity (jobs/key "metabase.task.search-index.job")))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key "metabase.task.search-index.trigger"))
                 (triggers/start-now))]
    (task/schedule-task! job trigger)))
