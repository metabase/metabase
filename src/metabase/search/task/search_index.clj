(ns metabase.search.task.search-index
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics.core :as analytics]
   [metabase.search.core :as search]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private init-stem "metabase.task.search-index.init")
(def ^:private reindex-stem "metabase.task.search-index.reindex")
(def ^:private update-stem "metabase.task.search-index.update")

(def init-job-key
  "Key used to define and trigger a job that ensures there is an active index."
  (jobs/key (str init-stem ".job")))

(def reindex-job-key
  "Key used to define and trigger a job that rebuilds the entire index from scratch."
  (jobs/key (str reindex-stem ".job")))

(def update-job-key
  "Key used to define and trigger a job that makes incremental updates to the search index."
  (jobs/key (str update-stem ".job")))

;; We define the job bodies outside the defrecord, so that we can redefine them live from the REPL

(defn- report->prometheus! [duration report]
  (analytics/inc! :metabase-search/index-ms duration)
  (doseq [[model cnt] report]
    (analytics/inc! :metabase-search/index {:model model} cnt)))

(defn init!
  "Create a new index, if necessary"
  []
  (when (search/supports-index?)
    (try
      (let [timer    (u/start-timer)
            report   (search/init-index! {:force-reset? false, :re-populate? false})
            duration (u/since-ms timer)]
        (if (seq report)
          (do (report->prometheus! duration report)
              (log/infof "Done indexing in %.0fms %s" duration (sort-by (comp - val) report))
              true)
          (log/info "Found existing search index, and using it.")))
      (catch Exception e
        (analytics/inc! :metabase-search/index-error)
        (throw e)))))

(defn reindex!
  "Reindex the whole AppDB"
  []
  (when (search/supports-index?)
    (try
      (log/info "Reindexing searchable entities")
      (let [timer    (u/start-timer)
            report   (search/reindex!)
            duration (u/since-ms timer)]
        (report->prometheus! duration report)
        (log/infof "Done reindexing in %.0fms %s" duration (sort-by (comp - val) report))
        report)
      (catch Exception e
        (analytics/inc! :metabase-search/index-error)
        (throw e)))))

(defn- update-index! [^JobExecutionContext ctx]
  (when (search/supports-index?)
    (log/info "Starting Realtime Search Index Update worker")
    (task/rerun-on-error ctx
      (while true
        (try
          (let [batch    (search/get-next-batch! Long/MAX_VALUE 100)
                _        (log/trace "Processing batch" batch)
                timer    (u/start-timer)
                report   (search/bulk-ingest! batch)
                duration (u/since-ms timer)]
            (when (seq report)
              (report->prometheus! duration report)
              (log/debugf "Indexed search entries in %.0fms %s" duration (sort-by (comp - val) report))))
          (catch Exception e
            (analytics/inc! :metabase-search/index-error)
            (throw e)))))))

(jobs/defjob ^{:doc "Ensure a Search Index exists"}
  SearchIndexInit [_ctx]
  (init!))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Populate a new Search Index"}
  SearchIndexReindex [_ctx]
  (reindex!))

(jobs/defjob ^{:doc                        "Keep Search Index updated"}
  SearchIndexUpdate [ctx]
  (update-index! ctx))

(defmethod task/init! ::SearchIndexInit [_]
  (let [job (jobs/build
             (jobs/of-type SearchIndexInit)
             (jobs/store-durably)
             (jobs/with-identity init-job-key))]
    (task/add-job! job)
    (task/trigger-now! init-job-key)))

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

(defmethod task/init! ::SearchIndexUpdate [_]
  (let [job         (jobs/build
                     (jobs/of-type SearchIndexUpdate)
                     (jobs/with-identity update-job-key))
        trigger-key (triggers/key (str update-stem ".trigger"))
        trigger     (triggers/build
                     (triggers/with-identity trigger-key)
                     (triggers/for-job update-job-key)
                     (triggers/start-now))]
    (task/schedule-task! job trigger)))

(comment
  (task/job-exists? reindex-job-key)
  (task/job-exists? update-job-key))
