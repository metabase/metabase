(ns metabase-enterprise.semantic-search.task.metric-collector
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.datasource]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.search.index-health :as search.index-health]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private collector-job-key (jobs/key "metabase.task.semantic-metric-collector.job"))
(def ^:private collector-trigger-key (triggers/key "metabase.task.semantic-metric-collector.trigger"))

(defonce ^:private ^{:doc "The last readiness probe, `{:storage :connected? :at}`, nil before the first.
  Shared with [[pgvector-store-health-check]] so it doesn't probe again."}
  last-readiness-probe
  (atom nil))

(def ^:private readiness-refresh-interval-seconds
  "How often the readiness probe runs. Hourly: an app db that can't host pgvector yet re-runs the support
  check, which may attempt rolled-back DDL."
  (* 60 60))

(defn- probe-connected?
  [mode]
  (try
    (case mode
      :dedicated   (do (semantic.datasource/probe-dedicated-connection!) true)
      :app-db      (semantic.datasource/probe-app-db-store!)
      :unavailable false)
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      ;; The exception is the only record of why the gauge dropped.
      (log/warn e "Pgvector connection probe failed" {:mode mode})
      false)))

(defn- readiness-probe-allowed?
  "Whether this instance may resolve its pgvector store, the same boot-safe gate
  [[SemanticMetricCollector]] schedules on.
  Licensed, so an unlicensed instance never runs the app-db support check and its rolled-back DDL."
  []
  (or (semantic.datasource/dedicated-url-configured?)
      (semantic.u/semantic-search-configured?)))

(defn- collect-pgvector-readiness-metrics!
  "Record availability and connection health for the selected pgvector store.
  Ignores engine activation, so a pgvector rollout can be validated before enabling anything that uses it."
  []
  ;; The scrape path and a stale health check both call this. Serialize, so their gauge writes and results
  ;; can't interleave.
  (locking last-readiness-probe
    (let [mode       (if (readiness-probe-allowed?)
                       (semantic.datasource/pgvector-mode)
                       :unavailable)
          storage    (case mode :dedicated "external" :app-db "app-db" nil)
          connected? (probe-connected? mode)]
      ;; Publish both stable series on every instance. Exactly one can be available because a dedicated URL
      ;; always wins over the app-db fallback; both are zero when no store is usable.
      (doseq [candidate ["external" "app-db"]]
        (analytics/set-gauge! :metabase-search/pgvector-store-available
                              {:storage candidate}
                              (if (= candidate storage) 1 0))
        (analytics/set-gauge! :metabase-search/pgvector-store-connected
                              {:storage candidate}
                              (if (and (= candidate storage) connected?) 1 0)))
      (reset! last-readiness-probe {:storage    storage
                                    :connected? connected?
                                    :at         (.getEpochSecond (Instant/now))})
      (when connected?
        (analytics/set-gauge! :metabase-search/pgvector-store-last-success-timestamp-seconds
                              {:storage storage}
                              (.getEpochSecond (Instant/now)))))))

(defn- readiness-probe-stale?
  [{:keys [at]}]
  (or (nil? at)
      (> (- (.getEpochSecond (Instant/now)) ^long at)
         (* 2 readiness-refresh-interval-seconds))))

(defn- pgvector-store-health-check
  "Health-inspector row for pgvector store reachability, nil when there is no store to reach.
  Reports the collector's last probe, refreshing a stale one so an unscraped instance still gets a current
  row. Runs under the collector's lock, so the row can't disagree with the gauges."
  []
  (locking last-readiness-probe
    (when (readiness-probe-stale? @last-readiness-probe)
      (collect-pgvector-readiness-metrics!))
    (when-let [{:keys [storage connected?]} @last-readiness-probe]
      (when storage
        (if connected?
          (search.index-health/healthy (format "pgvector store (%s) reachable." storage))
          (search.index-health/degraded (format "pgvector store (%s) unreachable." storage)))))))

(health-inspector/register-check! :pgvector-store pgvector-store-health-check)

(defonce ^:private pgvector-readiness-metrics-initialized? (atom false))
(defonce ^:private pgvector-readiness-refresh-running? (atom false))

(defn- initialize-pgvector-readiness-metrics!
  []
  (when (compare-and-set! pgvector-readiness-metrics-initialized? false true)
    ;; Publish explicit zeroes before the first asynchronous probe so every process exposes both series on
    ;; its first scrape. A configured external store is already known to be available without touching it;
    ;; app-db availability is discovered by the background probe.
    (doseq [storage ["external" "app-db"]]
      (analytics/set-gauge! :metabase-search/pgvector-store-available
                            {:storage storage}
                            (if (and (= storage "external")
                                     (semantic.datasource/dedicated-url-configured?))
                              1
                              0))
      ;; last-success only appears once a probe succeeds: a seeded 0 reads as 1970, firing any staleness
      ;; alert forever.
      (analytics/set-gauge! :metabase-search/pgvector-store-connected {:storage storage} 0))))

(defn- refresh-pgvector-readiness-metrics!
  []
  (try
    (collect-pgvector-readiness-metrics!)
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      ;; Nothing derefs this future, so a throw here is otherwise silent.
      (log/error e "Pgvector readiness metric refresh failed"))
    (finally
      (reset! pgvector-readiness-refresh-running? false))))

(defn- submit-pgvector-readiness-refresh!
  [f]
  (future-call f))

(defn- request-pgvector-readiness-refresh!
  []
  (initialize-pgvector-readiness-metrics!)
  (when (compare-and-set! pgvector-readiness-refresh-running? false true)
    (try
      (submit-pgvector-readiness-refresh! refresh-pgvector-readiness-metrics!)
      (catch Exception e
        (reset! pgvector-readiness-refresh-running? false)
        (log/error e "Could not schedule pgvector readiness metric refresh"))))
  nil)

;; Prometheus scrapes every Metabase process, whereas a Quartz job runs on only one member of a cluster. Start
;; a local, single-flight background probe from the scrape path so every process refreshes its own gauge series
;; without putting database connection latency on the synchronous scrape.
(defmethod analytics.core/pull-collector ::pgvector-readiness-gauges [_]
  {:min-interval-s readiness-refresh-interval-seconds
   :f              request-pgvector-readiness-refresh!})

(defn- row-count
  [pgvector table-name-str]
  (:size
   (jdbc/execute-one!
    pgvector
    (sql/format {:select [[[:count :*] :size]]
                 :from [[[:raw table-name-str]]]}))))

(defn- collect-gate-size!
  [pgvector]
  (let [{:keys [gate-table-name]} (semantic.env/get-index-metadata)]
    (assert (string? gate-table-name))
    (log/debugf "Checking size of gate table %s" gate-table-name)
    (if (semantic.u/table-exists? pgvector gate-table-name)
      (let [table-size (row-count pgvector gate-table-name)]
        (log/debugf "Setting `semantic-gate-size` metric to %d" table-size)
        (analytics/set-gauge! :metabase-search/semantic-gate-size table-size)
        nil)
      (log/warn "Gate table does not exist. Index may not have been initialized."))))

(defn- active-index-id
  [pgvector index-metadata]
  (if (semantic.u/table-exists? pgvector (:control-table-name index-metadata))
    (:id (jdbc/execute-one!
          pgvector
          (sql/format {:select [[:active_id :id]]
                       :from [[[:raw (:control-table-name index-metadata)]]]})
          {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
    (log/warn "Control table does not exist. Index may not have been initialized.")))

(defn- collect-dlq-size!
  [pgvector index-metadata]
  (if-some [active-index-id (active-index-id pgvector index-metadata)]
    (let [dlq-table-name (name (semantic.dlq/dlq-table-name-kw index-metadata active-index-id))]
      (log/debugf "Checking size of DLQ table %s" dlq-table-name)
      (when (semantic.u/table-exists? pgvector dlq-table-name)
        (let [table-size (row-count pgvector dlq-table-name)]
          (log/debugf "Setting `semantic-dlq-size` metric to %d" table-size)
          (analytics/set-gauge! :metabase-search/semantic-dlq-size table-size)
          nil)))
    (log/warn "DLQ table does not exist. Index may not have been initialized.")))

(defn- collect-metrics! []
  (try
    ;; Active, not merely available: on an available-but-inactive instance the index tables never exist,
    ;; and the collectors would warn about them on every run.
    (when (semantic.u/semantic-search-active?)
      (let [pgvector (semantic.env/get-pgvector-datasource!)
            index-metadata (semantic.env/get-index-metadata)]
        (collect-gate-size! pgvector)
        (collect-dlq-size! pgvector index-metadata)))
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      (log/errorf "Semantic search metric collector errored: %s" (ex-message e))))
  ;; Registered collectors self-gate, so refreshing them is a cheap no-op when their feature is off.
  ;; Keep this outside the try: ordinary failures continue here, while interruption and fatal errors exit.
  (search.index-health/refresh-search-index-metrics!))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Collect expensive semantic search metrics"}
  SemanticMetricCollector [_ctx]
  (collect-metrics!))

(def ^:private job-interval-ms (* 10 60 1000))

(defmethod task/init! ::SemanticMetricCollector
  [_]
  ;; Boot-safe gate: plain env/feature checks, never a DB probe (pgvector-configured? would resolve
  ;; pgvector-mode, probing the app db and logging a pgvector-store line on instances that can't use the
  ;; answer). The dedicated-URL arm schedules without the feature, so a token entered post-boot starts the
  ;; search-index gauges without a restart; app-db-pgvector instances licensed post-boot need one, matching the
  ;; other semantic tasks (see [[semantic.u/semantic-search-configured?]]).
  (if (or (semantic.datasource/dedicated-url-configured?)
          (semantic.u/semantic-search-configured?))
    (let [job (jobs/build
               (jobs/of-type SemanticMetricCollector)
               (jobs/with-identity collector-job-key))
          trigger (triggers/build
                   (triggers/with-identity collector-trigger-key)
                   (triggers/start-at (Date/from (.plusMillis (Instant/now) job-interval-ms)))
                   (triggers/with-schedule
                    (simple/schedule
                     (simple/with-interval-in-milliseconds job-interval-ms)
                     (simple/repeat-forever)))
                   (triggers/start-now))]
      (task/schedule-task! job trigger))
    ;; Quartz's job store is persistent, so a collector scheduled by an earlier deploy would otherwise
    ;; keep firing (as a no-op) on an instance whose configuration went away.
    (task/delete-task! collector-job-key collector-trigger-key)))
