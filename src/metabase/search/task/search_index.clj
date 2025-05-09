(ns metabase.search.task.search-index
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as ingestion]
   [metabase.startup.core :as startup]
   [metabase.task.core :as task]
   [metabase.util.cluster-lock :as cluster-lock]
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
      (search/init-index! {:force-reset? false, :re-populate? false}))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc                        "Populate a new Search Index"}
  SearchIndexReindex [_ctx]
  (search/reindex!))

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
