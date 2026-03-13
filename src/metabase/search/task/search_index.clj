(ns metabase.search.task.search-index
  (:require
   [clojure.walk :as walk]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics.core :as analytics]
   [metabase.mq.core :as mq]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.impl :as search.impl]
   [metabase.search.ingestion :as ingestion]
   [metabase.search.spec :as search.spec]
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
  (when (search/supports-index?)
    (search/queue-reindex!)))

(defmethod startup/def-startup-logic! ::SearchIndexInit [_]
  (when (search/supports-index?)
    (search/queue-init!)))

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

(defn handle-command-message!
  "Handle a command message from the search reindex queue."
  [msg]
  (condp = (keyword (:command msg))
    :init (if (= (:version msg) (search.spec/index-version-hash))
            (if-let [engine (:engine msg)]
              (search.engine/init! engine (select-keys msg [:force-reset? :re-populate?]))
              (search.impl/sync-init-index! {:force-reset? (:force-reset? msg false)
                                             :re-populate?      false}))
            (throw (ex-info "Cannot handle init for different index version. Will retry on a different node."
                            {:expected (search.spec/index-version-hash)
                             :received (:version msg)})))
    :reindex (if-let [engine (:engine msg)]
               (search.engine/reindex! engine (select-keys msg [:in-place?]))
               (search.impl/sync-reindex! (select-keys msg [:in-place?])))
    :delete (doseq [e            (search.engine/active-engines)
                    search-model (->> (vals (search.spec/specifications))
                                      (filter (comp #{(:model msg)} :model))
                                      (map :name))]
              (search.engine/delete! e search-model (:ids msg)))))

(defn- command-key
  "Extract the command value from a message map, handling both string and keyword keys
  (messages may not be keywordized yet when dedup runs)."
  [msg]
  (when (map? msg)
    (some-> (or (:command msg) (get msg "command")) keyword)))

(defn dedup-search-messages
  "Dedup function for search reindex queue messages.
  - Update vectors: flatten to individual [model where] pairs, dedup by identity, re-group
  - Command messages: collapse duplicate :init and :reindex (keep last), pass through :delete"
  [messages]
  (let [{commands true updates false} (group-by #(boolean (command-key %)) messages)
        ;; For commands: collapse duplicate :init and :reindex, keep last occurrence
        deduped-commands (let [grouped (group-by command-key commands)]
                           (concat
                            (when-let [inits (seq (:init grouped))]
                              [(last inits)])
                            (when-let [reindexes (seq (:reindex grouped))]
                              [(last reindexes)])
                            (:delete grouped)))
        ;; For updates: flatten all update vecs, dedup individual pairs, re-wrap
        deduped-updates (when (seq updates)
                          (let [all-pairs (into [] cat updates)]
                            (when (seq all-pairs)
                              [(into [] (distinct) all-pairs)])))]
    (vec (concat deduped-commands deduped-updates))))

(mq/def-listener! :queue/search-reindex
  {:max-batch-messages 50 :max-next-ms 100 :exclusive true
   :dedup-fn dedup-search-messages}
  [messages]
  (try
    (let [messages (map #(cond-> % (map? %) walk/keywordize-keys) messages)
          {commands true updates false} (group-by #(boolean (and (map? %) (:command %))) messages)]
      (doseq [cmd commands]
        (handle-command-message! cmd))
      (when (seq updates)
        (ingestion/bulk-ingest! (into [] cat updates))))
    (catch Exception e
      (analytics/inc! :metabase-search/index-error)
      (throw e))))

(comment
  (task/job-exists? reindex-job-key)
  (task/trigger-now! reindex-job-key))
