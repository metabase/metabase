(ns metabase-enterprise.semantic-search.task.indexer
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.indexer :as semantic-search.indexer]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.search.engine :as search.engine]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import (java.time Duration Instant)
           (java.util Date)
           (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private indexer-stem
  (jobs/key "metabase-enterprise.semantic-search.indexer"))

(def indexer-job-key
  "Key used to define and trigger a job that maintains semantic search indexes."
  (jobs/key (str indexer-stem ".job")))

;; would prefer a job member, as quartz suggests in its InterruptableJob docs
;; but if I do that quartz cannot initialize the job - there is probably a way around this.
(defonce ^:private execution-thread-ref (volatile! nil))

(deftype ^{DisallowConcurrentExecution true
           :doc                        "Runs an indexer process for a time, expects to be rescheduled to continue"}
 SemanticSearchIndexer []
  org.quartz.Job
  (execute [_ _]
    (when (semantic.u/semantic-search-available?)
      (log/with-context {:quartz-job-type 'SemanticSearchIndexer}
        (when (search.engine/supported-engine? :search.engine/semantic)
          (try
            (vreset! execution-thread-ref (Thread/currentThread))
            (semantic-search.indexer/quartz-job-run! (semantic.env/get-pgvector-datasource!) (semantic.env/get-index-metadata))
            (finally
              (locking execution-thread-ref
                (vreset! execution-thread-ref nil))))))))
  org.quartz.InterruptableJob
  (interrupt [_]
   ;; locking required here to avoid racing with the unset in the finally
   ;; and interrupting some other unintended task/work
    (locking execution-thread-ref
      (when-some [^Thread execution-thread @execution-thread-ref]
        (.interrupt execution-thread)))))

(def ^:private ^Duration startup-delay (Duration/parse "PT10S"))
(def ^:private ^Duration run-frequency (Duration/parse "PT20S"))

(defmethod task/init! ::SemanticSearchIndexer [_]
  (when (semantic.u/semantic-search-available?)
    (let [job         (jobs/build
                       (jobs/of-type SemanticSearchIndexer)
                       (jobs/store-durably)
                       (jobs/with-identity indexer-job-key))
          trigger-key (triggers/key (str indexer-stem ".trigger"))
          trigger     (triggers/build
                       (triggers/with-identity trigger-key)
                       (triggers/for-job indexer-job-key)
                       (triggers/start-at (Date/from (.plus (Instant/now) startup-delay)))
                       (triggers/with-schedule
                        (simple/schedule
                         (simple/with-interval-in-milliseconds (.toMillis run-frequency))
                         (simple/repeat-forever))))]
      (task/schedule-task! job trigger))))
