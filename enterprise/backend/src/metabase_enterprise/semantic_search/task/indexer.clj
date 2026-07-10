(ns metabase-enterprise.semantic-search.task.indexer
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.indexer :as semantic-search.indexer]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
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

(defn- hnsw-strategy? []
  (contains? search.config/hnsw-index-backed-strategies
             (semantic.settings/semantic-search-vector-strategy)))

(deftype ^{DisallowConcurrentExecution true
           :doc                        "Runs an indexer process for a time, expects to be rescheduled to continue"}
 SemanticSearchIndexer []
  org.quartz.Job
  (execute [_ _]
    (when (semantic.u/semantic-search-active?)
      (log/with-context {:quartz-job-type 'SemanticSearchIndexer}
        (try
          (vreset! execution-thread-ref (Thread/currentThread))
          (let [pgvector       (semantic.env/get-pgvector-datasource!)
                index-metadata (semantic.env/get-index-metadata)]
            (if-let [{:keys [index]} (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
              (do
                ;; The strategy setter's build event no-ops while semantic is inactive, so an index-backed
                ;; strategy configured before (re)activation arrives here with no HNSW index. CONCURRENTLY
                ;; registers the index in pg_indexes as soon as the build starts, so this fires only once.
                (when (and (hnsw-strategy?)
                           (not (semantic.u/index-exists? pgvector (semantic.index/hnsw-index-name index))))
                  (semantic.core/build-hnsw-index-async!))
                (semantic-search.indexer/quartz-job-run! pgvector index-metadata))
              ;; Engines can activate at runtime (license applied, kill switch re-enabled,
              ;; additional-search-engines set on another node); initializing from the next tick heals
              ;; every such path within seconds. Initialize all active engines, not just semantic:
              ;; activation may also have activated dependencies with no index.
              (do
                (search/init-index!)
                (when (hnsw-strategy?)
                  (semantic.core/build-hnsw-index-async!)))))
          (finally
            (locking execution-thread-ref
              (vreset! execution-thread-ref nil)))))))
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
  (when (semantic.u/semantic-search-configured?)
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
      (task/schedule-task! job trigger))
    ;; Safety net: an instance that booted already configured for an HNSW-index-backed strategy (set via env
    ;; var, or set before an active index existed) never saw the setter's transition event, so build the
    ;; index now. Covers :hnsw and the :hnsw-iterative-* strategies, which all query through the index.
    (when (hnsw-strategy?)
      (semantic.core/build-hnsw-index-async!))))
