(ns metabase-enterprise.semantic-search.task.indexer-heartbeat
  (:require [clojurewerkz.quartzite.jobs :as jobs]
            [clojurewerkz.quartzite.schedule.simple :as simple]
            [clojurewerkz.quartzite.triggers :as triggers]
            [metabase-enterprise.semantic-search.env :as semantic.env]
            [metabase-enterprise.semantic-search.indexer :as semantic-search.indexer]
            [metabase.task.core :as task])
  (:import (java.time Duration Instant)
           (java.util Date)
           (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private indexer-stem
  (jobs/key "metabase-enterprise.semantic-search.indexer-heartbeat"))

(def indexer-job-key
  "Key used to define and trigger a job that maintains semantic search indexes."
  (jobs/key (str indexer-stem ".job")))

(defonce ^:private proc-map (semantic-search.indexer/init-process-map!))

(defonce ^:private shutdown-hook
  (delay
    (.addShutdownHook (Runtime/getRuntime)
                      (Thread. (fn [] (semantic-search.indexer/shutdown! proc-map))))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc                        "Ensures an indexer process is running, and restarts it if not."}
  SemanticSearchIndexer
  [_]
  @shutdown-hook
  (semantic-search.indexer/heartbeat! proc-map (semantic.env/get-pgvector-datasource!) (semantic.env/get-index-metadata)))

(def ^:private ^Duration startup-delay (Duration/parse "PT1M"))
(def ^:private ^Duration heartbeat-frequency (Duration/parse "PT1H"))

(defmethod task/init! ::SemanticSearchIndexer [_]
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
                       (simple/with-interval-in-hours (.toMillis heartbeat-frequency))
                       (simple/repeat-forever))))]
    (task/schedule-task! job trigger)))
