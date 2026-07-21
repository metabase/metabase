(ns metabase-enterprise.semantic-search.task.metric-collector
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [honey.sql :as sql]
   [metabase-enterprise.ai-index-health.core :as ai-index-health]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.datasource]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.analytics-interface.core :as analytics]
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
  ;; Active, not merely available: on an available-but-inactive instance the index tables never exist,
  ;; and the collectors would warn about them on every run.
  (when (semantic.u/semantic-search-active?)
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.env/get-index-metadata)]
      (collect-gate-size! pgvector)
      (collect-dlq-size! pgvector index-metadata)))
  ;; AI-index coverage/garbage/staleness for both engines: sets the labelled gauges (always) and persists
  ;; the health rows (when the inspector is enabled). Each collector self-gates, so this is a cheap no-op
  ;; when a feature is off. Kept here rather than in a new task since this collector already runs on a metric cadence.
  (ai-index-health/refresh-ai-index-metrics!))

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
  ;; AI-index gauges without a restart; app-db-pgvector instances licensed post-boot need one, matching the
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
