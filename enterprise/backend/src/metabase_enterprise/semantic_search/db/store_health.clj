(ns metabase-enterprise.semantic-search.db.store-health
  "Readiness of the pgvector store itself -- can this instance reach a vector database, and which one.
  Store-level, not index-level: semantic search provisions the store, but entity retrieval and anything
  else needing vectors shares it, so this reports the store rather than any one feature's index. Index
  health lives in [[metabase-enterprise.semantic-search.health]]."
  (:require
   [metabase-enterprise.semantic-search.db.datasource :as semantic.datasource]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.search.index-health :as search.index-health]
   [metabase.util.log :as log])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private storage-labels
  "The mutually exclusive pgvector backings, as `:storage` label values. A dedicated URL always wins over
  the app-db fallback, so at most one can be available at a time."
  ["dedicated" "appdb"])

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
  "Whether this instance may resolve its pgvector store, the same boot-safe gate the semantic metric
  collector schedules on.
  Licensed, so an unlicensed instance never runs the app-db support check and its rolled-back DDL."
  []
  ;; TODO (Chris 2026-07-29) -- the licensed arm is `:semantic-search` only. Entity retrieval is
  ;; dedicated-only today, so its instances always pass on the URL arm; once it supports pgvector on the
  ;; app db, an app-db instance licensed for `:library-retrieval` alone would report no store at all.
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
          storage    (case mode :dedicated "dedicated" :app-db "appdb" nil)
          connected? (probe-connected? mode)]
      ;; Publish both stable series on every instance; both are zero when no store is usable.
      (doseq [candidate storage-labels]
        (analytics/set-gauge! :metabase-pgvector/store-available
                              {:storage candidate}
                              (if (= candidate storage) 1 0))
        (analytics/set-gauge! :metabase-pgvector/store-connected
                              {:storage candidate}
                              (if (and (= candidate storage) connected?) 1 0)))
      (reset! last-readiness-probe {:storage    storage
                                    :connected? connected?
                                    :at         (.getEpochSecond (Instant/now))})
      (when connected?
        (analytics/set-gauge! :metabase-pgvector/store-last-success-timestamp-seconds
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

;; Seed both series at startup so every process exposes them before its first probe.
(defmethod analytics.core/known-labels :metabase-pgvector/store-available [_]
  (for [storage storage-labels]
    {:storage storage}))

(defmethod analytics.core/known-labels :metabase-pgvector/store-connected [_]
  (analytics.core/known-labels :metabase-pgvector/store-available))

;; store-last-success-timestamp-seconds is deliberately absent: a seeded 0 reads as 1970, firing any
;; staleness alert forever. It appears once a probe succeeds.

(defmethod analytics.core/initial-value :metabase-pgvector/store-available
  [_ {:keys [storage]}]
  ;; A configured dedicated URL is already known to be available without touching it; app-db availability
  ;; is discovered by the background probe.
  (if (and (= storage "dedicated") (semantic.datasource/dedicated-url-configured?))
    1
    0))

(defonce ^:private readiness-refresh-running? (atom false))

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
      (reset! readiness-refresh-running? false))))

(defn- submit-pgvector-readiness-refresh!
  [f]
  (future-call f))

(defn- request-pgvector-readiness-refresh!
  []
  (when (compare-and-set! readiness-refresh-running? false true)
    (try
      (submit-pgvector-readiness-refresh! refresh-pgvector-readiness-metrics!)
      (catch Exception e
        (reset! readiness-refresh-running? false)
        (log/error e "Could not schedule pgvector readiness metric refresh"))))
  nil)

;; Prometheus scrapes every Metabase process, whereas a Quartz job runs on only one member of a cluster. Start
;; a local, single-flight background probe from the scrape path so every process refreshes its own gauge series
;; without putting database connection latency on the synchronous scrape.
(defmethod analytics.core/pull-collector ::pgvector-readiness-gauges [_]
  {:min-interval-s readiness-refresh-interval-seconds
   :f              request-pgvector-readiness-refresh!})
