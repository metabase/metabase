(ns metabase-enterprise.semantic-search.task.duplicates-backfill
  "Full-pass semantic duplicate snapshot generation."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.semantic-search.duplicates :as duplicates]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.sqlite :as sqlite]
   [metabase-enterprise.semantic-search.sqlite-config :as sqlite-config]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.db :as search.db]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private source-batch-size 50)
(def ^:private retry-delay-seconds (* 10 60))
(def ^:private job-key (jobs/key "metabase.task.semantic-duplicates-backfill.job"))
(def ^:private trigger-key (triggers/key "metabase.task.semantic-duplicates-backfill.trigger"))
(def ^:private cluster-lock-key ::semantic-duplicates-backfill)

(defn- model-identity
  [active-state]
  {:metadata-id  (-> active-state :metadata-row :id)
   :table-name   (-> active-state :index :table-name)
   :cosine-distance-threshold duplicates/cosine-distance-threshold
   :embedding-model (select-keys (-> active-state :index :embedding-model)
                                 [:provider :model-name :model-revision :vector-dimensions
                                  :embedding-space-id :embedding-spi-version])})

(defn- prepared-run
  "Resolve the index and embedding provider once, before any source work starts."
  []
  (when-not (premium-features/has-feature? :semantic-search)
    (throw (ex-info "Semantic search is not licensed" {:reason :unlicensed})))
  (when-not (semantic.u/semantic-search-active?)
    (throw (ex-info "Semantic search is not active" {:reason :inactive})))
  (let [pgvector        (semantic.env/get-pgvector-datasource!)
        index-metadata  (semantic.env/get-index-metadata)
        active-state    (semantic.index-metadata/get-active-index-state pgvector index-metadata)
        configured-model (embedding/get-configured-model)
        resolved-model  (embedding/resolve-model configured-model)
        active-model    (some-> active-state :index :embedding-model)]
    (when-not active-state
      (throw (ex-info "Semantic search has no active index" {:reason :no-active-index})))
    (when-not (embedding/embedding-supported? configured-model)
      (throw (ex-info "The configured semantic embedding provider is unavailable" {:reason :embedder-unavailable})))
    (when-not (= (select-keys resolved-model
                              [:provider :model-name :model-revision :vector-dimensions
                               :embedding-space-id :embedding-spi-version])
                 (select-keys active-model
                              [:provider :model-name :model-revision :vector-dimensions
                               :embedding-space-id :embedding-spi-version]))
      (throw (ex-info "The active semantic index is incompatible with the configured embedding model"
                      {:reason :incompatible-index})))
    ;; Compare against indexable questions, not all scan sources: the search spec deliberately excludes some
    ;; collections and document cards. Those sources must not leave an otherwise complete index perpetually pending.
    (let [total-questions (duplicates/eligible-question-count)
          expected-count  (count (into #{} (map :id)
                                       (search.db/spec-index-reducible-rows "card" [:= :this.archived false])))
          indexed-count   (semantic.index/indexed-model-count pgvector (:table-name (:index active-state)) "card")]
      (when (< indexed-count expected-count)
        (throw (ex-info "The active semantic index has not caught up with saved questions"
                        {:reason :index-catching-up
                         :indexed-count indexed-count
                         :expected-count expected-count
                         :total-questions total-questions})))
      {:pgvector         pgvector
       :index            (:index active-state)
       :embedding-model  active-model
       :identity         (model-identity active-state)
       :total-questions  total-questions})))

(defn- prepared-sqlite-run
  "Resolve the SQLite semantic store and verify that it has caught up with saved questions."
  []
  (when-not (premium-features/has-feature? :semantic-search)
    (throw (ex-info "Semantic search is not licensed" {:reason :unlicensed})))
  (when-not (semantic.u/semantic-search-active?)
    (throw (ex-info "Semantic search is not active" {:reason :inactive})))
  (let [configured-model (embedding/get-configured-model)]
    (when-not (embedding/embedding-supported? configured-model)
      (throw (ex-info "The configured semantic embedding provider is unavailable" {:reason :embedder-unavailable})))
    ;; Opening the store also creates it when necessary and recreates it when the configured model changes.
    (sqlite/open!)
    (let [total-questions (duplicates/eligible-question-count)
          indexed-count   (get-in (sqlite/stats) [:by-model "card"] 0)]
      (when (< indexed-count total-questions)
        (throw (ex-info "The SQLite semantic index has not caught up with saved questions"
                        {:reason :index-catching-up
                         :indexed-count indexed-count
                         :expected-count total-questions})))
      {:total-questions total-questions})))

(defn- scan-source
  [pgvector index embedding-model {:keys [id name description]}]
  (try
    (let [text      (duplicates/question-search-text name description)
          query     (embedding/prefix-search-query embedding-model text)
          vector    (embedding/get-embedding embedding-model query
                                             {:type :query :record-tokens? true})
          target-ids (semantic.index/model-ids-within-cosine-distance
                      pgvector
                      index
                      {:model             "card"
                       :excluded-model-id id
                       :embedding         vector
                       :max-distance      duplicates/cosine-distance-threshold})]
      [id (->> target-ids
               (keep (fn [target-id]
                       (try
                         (let [target-id (Long/parseLong (str target-id))]
                           (when (pos? target-id) target-id))
                         (catch NumberFormatException _ nil))))
               set)])
    (catch InterruptedException e
      (throw e))
    (catch Throwable e
      (log/errorf "Semantic duplicate scan failed for question %s: %s" id (ex-message e))
      (throw e))))

(defn- scan-batch
  [pgvector index embedding-model questions]
  (let [matches (into {} (map #(scan-source pgvector index embedding-model %)) questions)
        target-ids (into #{} (mapcat val) matches)
        live-target-ids (duplicates/live-eligible-question-ids target-ids)]
    (into #{}
          (mapcat (fn [[source-id target-ids]]
                    (keep (fn [target-id]
                            (when (contains? live-target-ids target-id)
                              (duplicates/canonical-pair source-id target-id)))
                          target-ids)))
          matches)))

(defn- scan-source-sqlite
  [{:keys [id name description]}]
  (try
    (let [text (duplicates/question-search-text name description)
          rows (:rows (sqlite/search-text text
                                          :models ["card"]
                                          :k 1000
                                          :max-distance duplicates/cosine-distance-threshold
                                          :record-tokens? true))]
      [id (->> rows
               (keep (fn [{:keys [model_id]}]
                       (try
                         (let [target-id (Long/parseLong (str model_id))]
                           (when (pos? target-id) target-id))
                         (catch NumberFormatException _ nil))))
               set)])
    (catch InterruptedException e
      (throw e))
    (catch Throwable e
      (log/errorf "SQLite semantic duplicate scan failed for question %s: %s" id (ex-message e))
      (throw e))))

(defn- scan-batch-sqlite
  [questions]
  (let [matches         (into {} (map scan-source-sqlite questions))
        target-ids      (into #{} (mapcat val) matches)
        live-target-ids (duplicates/live-eligible-question-ids target-ids)]
    (into #{}
          (mapcat (fn [[source-id target-ids]]
                    (keep (fn [target-id]
                            (when (contains? live-target-ids target-id)
                              (duplicates/canonical-pair source-id target-id)))
                          target-ids)))
          matches)))

(defn- ensure-index-identity!
  [identity]
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.env/get-index-metadata)
        active-state   (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
    (when-not (= identity (model-identity active-state))
      (throw (ex-info "Semantic index identity changed during duplicate scan"
                      {:reason :index-changed}))))
  nil)

(defn backfill!
  "Synchronously scan all eligible questions and atomically publish a complete pair snapshot.

  This is intentionally public for the local nREPL helper and for the Quartz wrapper. It does not run the scan in an
  app-DB transaction. Only the final delete/insert/status publication is transactional."
  []
  (try
    (cluster-lock/with-detached-cluster-lock {:lock cluster-lock-key :timeout-seconds 1}
      (if (sqlite-config/enabled?)
        (let [{:keys [total-questions]} (prepared-sqlite-run)]
          (duplicates/mark-running! total-questions)
          (loop [last-id  nil
                 processed 0
                 pairs    #{}]
            (let [batch          (duplicates/eligible-questions last-id source-batch-size)
                  questions      (:questions batch)
                  batch-last-id  (:last-id batch)]
              (if (nil? batch-last-id)
                (duplicates/publish-pairs! (sort pairs) processed total-questions)
                (let [batch-pairs (if (seq questions)
                                    (scan-batch-sqlite questions)
                                    #{})
                      processed   (+ processed (count questions))]
                  (duplicates/mark-progress! processed)
                  (recur batch-last-id processed (into pairs batch-pairs)))))))
        (let [{:keys [pgvector index embedding-model identity total-questions]} (prepared-run)]
          (duplicates/mark-running! total-questions)
          (loop [last-id  nil
                 processed 0
                 pairs    #{}]
            (let [batch          (duplicates/eligible-questions last-id source-batch-size)
                  questions      (:questions batch)
                  batch-last-id  (:last-id batch)]
              (if (nil? batch-last-id)
                (do
                  (ensure-index-identity! identity)
                  (duplicates/publish-pairs! (sort pairs) processed total-questions))
                (let [batch-pairs (if (seq questions)
                                    (scan-batch pgvector index embedding-model questions)
                                    #{})
                      processed   (+ processed (count questions))]
                  (duplicates/mark-progress! processed)
                  (recur batch-last-id processed (into pairs batch-pairs)))))))))
    (catch InterruptedException e
      (throw e))
    (catch Throwable e
      (try
        (duplicates/mark-failed! e)
        (catch Throwable status-error
          (log/errorf "Unable to persist semantic duplicate backfill failure status: %s"
                      (ex-message status-error))))
      (throw e))))

(declare job)

(defn- schedule-daily!
  [scheduler]
  (let [trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule "0 17 3 * * ? *")
                   (cron/in-time-zone (java.util.TimeZone/getTimeZone "UTC")))))]
    (task/schedule-task! scheduler (job) trigger)))

(defn- schedule-retry!
  [scheduler]
  (let [start-at (-> (Instant/now)
                     (.plusSeconds retry-delay-seconds)
                     Date/from)
        trigger  (triggers/build
                  (triggers/with-identity trigger-key)
                  (triggers/for-job job-key)
                  (triggers/start-at start-at))]
    (log/infof "Scheduling semantic duplicate backfill retry at %s" start-at)
    (task/schedule-task! scheduler (job) trigger)))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Find semantically similar saved questions and publish a duplicate snapshot"}
  SemanticDuplicatesBackfill [ctx]
  (let [^JobExecutionContext ctx ctx
        scheduler (.getScheduler ctx)]
    (when (semantic.u/semantic-search-active?)
      (try
        (backfill!)
        ;; A retry temporarily replaces the daily trigger. Restore the daily schedule after a successful run.
        (schedule-daily! scheduler)
        (catch InterruptedException e
          (throw e))
        (catch Throwable e
          (schedule-retry! scheduler)
          (throw e))))))

(defn- job
  []
  (jobs/build
   (jobs/of-type SemanticDuplicatesBackfill)
   (jobs/store-durably)
   (jobs/with-identity job-key)))

(defonce ^:private local-backfill (atom nil))

(defn trigger-backfill!
  "Request a nonblocking run of the registered duplicate backfill job."
  []
  (if-let [scheduler (when-not (task/scheduler-disabled?) (task/scheduler))]
    (do
      (task/add-job! (job))
      (.triggerJob ^org.quartz.Scheduler scheduler job-key))
    (if (and config/is-dev? (task/scheduler-disabled?))
      ;; The local development instance deliberately disables unrelated Quartz jobs.
      (locking local-backfill
        (when (or (nil? @local-backfill) (future-done? @local-backfill))
          (duplicates/mark-running! 0)
          (reset! local-backfill
                  (future
                    (try
                      (backfill!)
                      (catch Throwable e
                        (log/error e "Local semantic duplicate backfill failed")))))))
      (throw (ex-info "Semantic duplicate scheduler is unavailable" {:status-code 503}))))
  nil)

(defmethod task/init! ::SemanticDuplicatesBackfill
  [_]
  (duplicates/recover-stale-status!)
  (when (semantic.u/semantic-search-configured?)
    (let [scheduler (task/scheduler)]
      (when scheduler
        (let [job-detail (job)]
          (task/schedule-task!
           scheduler
           job-detail
           (triggers/build
            (triggers/with-identity trigger-key)
            (triggers/for-job job-key)
            (triggers/start-at (Date/from (.plusSeconds (Instant/now) 15))))))))))
