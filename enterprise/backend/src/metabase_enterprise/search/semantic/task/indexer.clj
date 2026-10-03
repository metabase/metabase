(ns metabase-enterprise.search.semantic.task.indexer
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.search.semantic.core :as semantic.core]
   [metabase-enterprise.search.semantic.env :as semantic.env]
   [metabase-enterprise.search.semantic.index :as semantic.index]
   [metabase-enterprise.search.semantic.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.search.semantic.indexer :as semantic-search.indexer]
   [metabase-enterprise.search.semantic.settings :as semantic.settings]
   [metabase-enterprise.search.semantic.util :as semantic.u]
   [metabase.classloader.core :as classloader]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import (java.io File)
           (java.time Duration Instant)
           (java.util Date)))

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

(defn execute!
  "Runs the indexer for a time, then returns so Quartz reschedules it.
  Entry point of the Quartz job class in [[metabase-enterprise.search.semantic.task.indexer-job]]."
  []
  (when (semantic.u/semantic-search-active?)
    (log/with-context {:quartz-job-type 'SemanticSearchIndexer}
      (try
        (vreset! execution-thread-ref (Thread/currentThread))
        (let [pgvector       (semantic.env/get-pgvector-datasource!)
              index-metadata (semantic.env/get-index-metadata)]
          (if-let [{:keys [index]} (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
            (do
              ;; The strategy setter's build event no-ops while semantic is inactive, so an index-backed
              ;; strategy configured before (re)activation arrives here with no HNSW index. Retry absent
              ;; or abandoned invalid indexes; an active concurrent build is left alone.
              (let [hnsw-index (semantic.index/schema-qualified-index-name
                                index (semantic.index/hnsw-index-name index))]
                (when (and (hnsw-strategy?)
                           (semantic.u/index-needs-build? pgvector hnsw-index))
                  (semantic.core/build-hnsw-index-async!)))
              (semantic-search.indexer/quartz-job-run! pgvector index-metadata))
            ;; Engines can activate at runtime (license applied, additional-search-engines set on
            ;; another node); initializing from the next tick heals
            ;; every such path within seconds. Initialize all active engines, not just semantic:
            ;; activation may also have activated dependencies with no index.
            (do
              (search/init-index!)
              (when (hnsw-strategy?)
                (semantic.core/build-hnsw-index-async!)))))
        (finally
          (locking execution-thread-ref
            (vreset! execution-thread-ref nil)))))))

(defn interrupt!
  "Interrupt the running [[execute!]], if any."
  []
  ;; locking required here to avoid racing with the unset in the finally
  ;; and interrupting some other unintended task/work
  (locking execution-thread-ref
    (when-some [^Thread execution-thread @execution-thread-ref]
      (.interrupt execution-thread))))

;; Quartz stores a job's class name in the app DB, and this class keeps the name it had before the namespace moved
;; from `semantic-search` to `search.semantic`. During a rolling upgrade, old nodes can then still load the stored
;; class, and the running job is never deleted as classless, so the indexer stays a cluster singleton.
(def ^:private job-class-name "metabase_enterprise.semantic_search.task.indexer.SemanticSearchIndexer")

(defn- load-job-class ^Class []
  (Class/forName job-class-name false (classloader/the-classloader)))

;; The compile also writes the namespace's own classes, which look newer than its source, so `require` prefers them.
;; Left over from another JVM, they would load in place of the source. Left from this compile, they make an unload and
;; reload (`refresh`, clj-reload) load the already-loaded class, and the namespace doesn't come back.
(defn- delete-job-ns-classes! [dir]
  (doseq [^File f (.listFiles (io/file dir "metabase_enterprise" "search" "semantic" "task"))
          :when (str/starts-with? (.getName f) "indexer_job")]
    (.delete f)))

(defn- compile-job-class!
  "Compiles the `gen-class` in [[metabase-enterprise.search.semantic.task.indexer-job]] into a directory on the
  classpath, leaving only the job class there."
  []
  (let [dir (io/file (System/getProperty "java.io.tmpdir") "mb-quartz-jobs")]
    (.mkdirs dir)
    (classloader/add-url-to-classpath! (-> dir .toURI .toURL))
    (delete-job-ns-classes! dir)
    (binding [*compile-path* (str dir)]
      (compile 'metabase-enterprise.search.semantic.task.indexer-job))
    (delete-job-ns-classes! dir)))

(defn- job-class
  "The indexer's Quartz job class, defined by the `gen-class` in
  [[metabase-enterprise.search.semantic.task.indexer-job]]."
  ^Class []
  (try
    (load-job-class)
    (catch ClassNotFoundException _
      ;; AOT-compiled in the uberjar; dev and tests compile nothing ahead of time, so compile the `gen-class` first,
      ;; as [[metabase.mq.quartz-affinity/ensure-delegate-loadable!]] does
      (compile-job-class!)
      (load-job-class))))

(def ^:private ^Duration startup-delay (Duration/parse "PT10S"))
(def ^:private ^Duration run-frequency (Duration/parse "PT20S"))

(defmethod task/init! ::SemanticSearchIndexer [_]
  (when (semantic.u/semantic-search-configured?)
    (let [job         (jobs/build
                       (jobs/of-type (job-class))
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
