(ns metabase.search.task.search-index
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics.core :as analytics]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as ingestion]
   [metabase.startup.core :as startup]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.cluster-lock :as cluster-lock]
   [metabase.util.log :as log]
   [metabase.util.queue :as queue]
   [metabase.util.quick-task :as quick-task])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private init-stem "metabase.task.search-index.init")
(def ^:private reindex-stem "metabase.task.search-index.reindex")

(def init-job-key
  "Key used to define and trigger a job that ensures there is an active index."
  (jobs/key (str init-stem ".job")))

(def reindex-job-key
  "Key used to define and trigger a job that rebuilds the entire index from scratch."
  (jobs/key (str reindex-stem ".job")))

;; We define the job bodies outside the defrecord, so that we can redefine them live from the REPL

(defn init!
  "Create a new index, if necessary"
  []
  (when (search/supports-index?)
    (cluster-lock/with-cluster-lock ::search-init-lock
      (try
        (let [timer (u/start-timer)
              report (search/init-index! {:force-reset? false, :re-populate? false})
              duration (u/since-ms timer)]
          (if (seq report)
            (do (ingestion/report->prometheus! duration report)
                (log/infof "Done indexing in %.0fms %s" duration (sort-by (comp - val) report))
                true)
            (log/info "Found existing search index, and using it.")))
        (catch Exception e
          (analytics/inc! :metabase-search/index-error)
          (throw e))))))

(defn reindex!
  "Reindex the whole AppDB"
  []
  (when (search/supports-index?)
    (try
      (log/info "Reindexing searchable entities")
      (let [timer    (u/start-timer)
            report   (search/reindex!)
            duration (u/since-ms timer)]
        (ingestion/report->prometheus! duration report)
        (log/infof "Done reindexing in %.0fms %s" duration (sort-by (comp - val) report))
        report)
      (catch Exception e
        (analytics/inc! :metabase-search/index-error)
        (throw e)))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc                        "Populate a new Search Index"}
  SearchIndexReindex [_ctx]
  (reindex!))

(defmethod startup/def-startup-logic! ::SearchIndexInit [_]
  (quick-task/submit-task! (init!)))

(defmethod task/init! ::SearchIndexReindex [_]
  (let [job         (jobs/build
                     (jobs/of-type SearchIndexReindex)
                     (jobs/store-durably)
                     (jobs/with-identity reindex-job-key))
        trigger-key (triggers/key (str reindex-stem ".trigger"))
        trigger     (triggers/build
                     (triggers/with-identity trigger-key)
                     (triggers/for-job reindex-job-key)
                     (triggers/start-at (Date/from (.plusSeconds (Instant/now) 3600)))
                     (triggers/with-schedule
                      (simple/schedule
                       (simple/with-interval-in-hours 1)
                       (simple/repeat-forever))))]
    (task/schedule-task! job trigger)))

(defmethod queue/init-listener! ::SearchIndexUpdate [_]
  (ingestion/start-listener!))

(comment
  (task/job-exists? reindex-job-key))
