(ns metabase.search.task.search-index
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as ingestion]
   [metabase.startup.core :as startup]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util.queue :as queue])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private init-stem "metabase.task.search-index.init")
(def ^:private reindex-stem "metabase.task.search-index.reindex")
(def ^:private cluster-lock-name ::search-index-lock)

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
    (tracing/with-span :search "search.task.init" {}
      (cluster-lock/with-cluster-lock cluster-lock-name
        (search/init-index! {:force-reset? false, :re-populate? false})))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc                        "Populate a new Search Index"}
  SearchIndexReindex [_ctx]
  (cluster-lock/with-cluster-lock cluster-lock-name
    (search/reindex! {:async? false})))

;; Atom holding a promise that is delivered when the background init thread finishes.
;; nil when no init has been started — [[wait-for-init!]] returns immediately in that case.
(defonce ^:private init-promise (atom nil))

(defn wait-for-init!
  "Block until the background search index initialization has completed.
   No-op if init has not been started (e.g. in unit tests)."
  []
  (some-> @init-promise deref))

(defmethod startup/def-startup-logic! ::SearchIndexInit [_]
  (let [p (promise)]
    (reset! init-promise p)
    (doto (Thread. ^Runnable (fn []
                               (try
                                 (init!)
                                 (finally
                                   (deliver p true)))))
      .start)))

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
  (task/job-exists? reindex-job-key)
  (task/trigger-now! reindex-job-key))
