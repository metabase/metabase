(ns metabase.task.search-index
  ;; metabase.search.postgres.ingestion has not been exposed publicly yet, it needs a higher level API
  #_{:clj-kondo/ignore [:metabase/ns-module-checker]}
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.search :as search]
   [metabase.search.postgres.ingestion :as search.ingestion]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution JobDetail Trigger)))

(set! *warn-on-reflection* true)

;; This is problematic multi-instance deployments, see below.
(def ^:private recreated? (atom false))

(def ^:private reindex-stem "metabase.task.search-index.reindex")
(def ^:private update-stem "metabase.task.search-index.update")

(def reindex-job-key
  "Key used to define and trigger a job that rebuilds the entire index from scratch."
  (jobs/key (str reindex-stem ".job")))

(def update-job-key
  "Key used to define and trigger a job that makes incremental updates to the search index."
  (jobs/key (str update-stem ".job")))

;; We define the job bodies outside the defrecord, so that we can redefine them live from the REPL

(defn- report->prometheus! [report]
  (doseq [[model cnt] report]
    (prometheus/inc! :metabase-search/index {:model model} cnt)))

(defn reindex!
  "Reindex the whole AppDB"
  []
  (when (search/supports-index?)
    (let [timer  (u/start-timer)
          report (if (not @recreated?)
                   (do (log/info "Recreating search index from the latest schema")
                       ;; Each instance in a multi-instance deployment will recreate the table the first time it is
                       ;; selected to run the job, resulting in a momentary lack of search results.  One solution to
                       ;; this would be to store metadata about the index in another table, which we can use to
                       ;; determine whether it was built by another version of Metabase and should be rebuilt.

                       (u/prog1 (search/init-index! {:force-reset? (not @recreated?)})
                         (reset! recreated? true)))
                   (do (log/info "Reindexing searchable entities")
                       (search/reindex!)))]
      (report->prometheus! report)
      (log/infof "Done indexing in %.0fms %s" (u/since-ms timer) (sort-by (comp - val) report)))))

(defn- update-index! []
  (when (search/supports-index?)
    (while true
      (let [timer  (u/start-timer)
            report (search.ingestion/process-next-batch Long/MAX_VALUE 100)]
        (when (seq report)
          (report->prometheus! report)
          (log/debugf "Indexed search entries in %.0fms %s" (u/since-ms timer) (sort-by (comp - val) report)))))))

(defn- force-scheduled-task! [^JobDetail job ^Trigger trigger]
  ;; For some reason, using the schedule-task! with a non-durable job causes it to only fire on the first trigger.
  #_(task/schedule-task! job trigger)
  (task/delete-task! (.getKey job) (.getKey trigger))
  (task/add-job! job)
  (task/add-trigger! trigger))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Populate Search Index"}
  SearchIndexReindex [_ctx]
  (reindex!))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Keep Search Index updated"}
  SearchIndexUpdate [_ctx]
  (update-index!))

(defmethod task/init! ::SearchIndexReindex [_]
  (let [job         (jobs/build
                     (jobs/of-type SearchIndexReindex)
                     (jobs/store-durably)
                     (jobs/with-identity reindex-job-key))
        trigger-key (triggers/key (str reindex-stem ".trigger"))
        trigger     (triggers/build
                     (triggers/with-identity trigger-key)
                     (triggers/for-job reindex-job-key)
                     (triggers/start-now)
                     (triggers/with-schedule
                      (simple/schedule (simple/with-interval-in-hours 1))))]
    (force-scheduled-task! job trigger)))

(defmethod task/init! ::SearchIndexUpdate [_]
  (let [job         (jobs/build
                     (jobs/of-type SearchIndexUpdate)
                     (jobs/store-durably)
                     (jobs/with-identity update-job-key))
        trigger-key (triggers/key (str update-stem ".trigger"))
        trigger     (triggers/build
                     (triggers/with-identity trigger-key)
                     (triggers/for-job update-job-key)
                     (triggers/start-now)
                     ;; This schedule is only here to restart the task if it dies for some reason.
                     (triggers/with-schedule (simple/schedule (simple/with-interval-in-seconds 1))))]
    (force-scheduled-task! job trigger)))

(comment
  (task/job-exists? reindex-job-key)
  (task/job-exists? update-job-key))
