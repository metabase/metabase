(ns metabase-enterprise.semantic-search.db.store-health
  "Readiness of the pgvector store itself -- can this instance reach a vector database, and which one.
  The store is shared: semantic search and entity retrieval each provision their own tables in it, as more
  may later, so this reports the store rather than any one feature's index.
  Index health lives in [[metabase-enterprise.semantic-search.health]]."
  (:require
   [metabase-enterprise.semantic-search.db.datasource :as semantic.datasource]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.app-db.core :as mdb]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.search.index-health :as search.index-health]
   [metabase.util.log :as log])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private storage-labels
  "The mutually exclusive pgvector backings, as `:storage` label values.
  A dedicated URL always wins over the app-db fallback, so at most one can be available at a time."
  ["dedicated" "appdb"])

(defonce ^:private ^{:doc "The last readiness probe, `{:storage :connected? :at}`, nil before the first.
  Shared with [[pgvector-store-health-check]] so it doesn't probe again."}
  last-readiness-probe
  (atom nil))

(def ^:private readiness-refresh-interval-seconds
  "How often the readiness probe runs.
  Hourly: an app db that can't host pgvector yet re-runs the support check, which may attempt rolled-back DDL."
  (* 60 60))

(def ^:private readiness-scrape-interval-seconds
  "How often the scrape path reconsiders probing.
  Far shorter than the probe interval, because the pull collector stamps its throttle before the refresh
  runs: an hourly slot spent on a probe that couldn't answer -- an app db still migrating at startup -- would
  leave the gauges wrong for the rest of the hour. The probe's own cadence is enforced by
  [[readiness-refresh-due?]] instead, off the last probe that did answer."
  60)

(def ^:private probe-wait-ms
  "How long the health check waits on a probe before reporting without it.
  Above the JDBC timeouts that end one first: the dedicated probe's connect and socket timeouts, the app db's
  connection checkout plus statement timeouts.
  Only a probe none of those bound runs past it -- a blackholed host on a URL with no socketTimeout -- and
  holding the whole health-inspector run behind that would be worse than reporting the previous answer."
  (* 60 1000))

(defn- store-connected?
  "Whether `mode`'s store answers. A refused or failed connection is an answer, and reads as disconnected."
  [mode]
  (try
    (case mode
      :dedicated   (do (semantic.datasource/probe-dedicated-connection!) true)
      :app-db      (semantic.datasource/probe-app-db-store!)
      :unavailable false)
    (catch Exception e
      ;; The exception is the only record of why the gauge dropped.
      (log/warn e "Pgvector connection probe failed" {:mode mode})
      false)))

(defn- app-db-store-allowed?
  "Whether this instance may check the app db for pgvector support, the same boot-safe gate the semantic
  metric collector schedules on.
  Licensed, so an unlicensed instance never runs that check and its rolled-back DDL."
  []
  ;; TODO (Chris 2026-07-29) -- `:semantic-search` only.
  ;; Entity retrieval is dedicated-only today, so its instances never reach here; once it supports pgvector
  ;; on the app db, an app-db instance licensed for `:library-retrieval` alone would report no store at all.
  (semantic.u/semantic-search-configured?))

(def ^:private unresolved-store
  "What the probe reports when it couldn't find out: no store, and due to be retried on the next scrape
  rather than holding the hourly slot."
  {:mode :unavailable, :connected? false, :resolved? false})

(defn- resolve-store
  "Which store this instance uses, and whether it answers."
  []
  (cond
    ;; A dedicated URL always wins, and reading it asks the app db nothing.
    (semantic.datasource/dedicated-url-configured?)
    {:mode :dedicated, :connected? (store-connected? :dedicated), :resolved? true}

    ;; Everything below reads the license or probes the app db, and neither can answer until migrations
    ;; finish. Say so rather than guess, or the guess is what the gauges show for the next hour.
    (not (mdb/db-is-set-up?))
    unresolved-store

    (not (app-db-store-allowed?))
    {:mode :unavailable, :connected? false, :resolved? true}

    :else
    (let [mode (semantic.datasource/pgvector-mode)]
      {:mode       mode
       :connected? (store-connected? mode)
       ;; A support check that errored also reads as :unavailable, and that is a guess, not an answer.
       :resolved?  (or (not= mode :unavailable)
                       (not @semantic.datasource/app-db-support-check-errored?))})))

(defn- probe-store
  "[[resolve-store]], reporting no store when it throws.
  Choosing the mode is itself a database call -- the app-db arm can attempt rolled-back DDL against a host
  that never answers -- so the whole resolution runs here, not only the connection probe."
  []
  (try
    (resolve-store)
    ;; Throwable, not Exception: an Error here would otherwise abandon the gauge writes, freezing every
    ;; series at its last value instead of dropping it.
    (catch Throwable e
      ;; The exception is the only record of why the gauges dropped.
      (log/warn e "Pgvector store probe failed")
      unresolved-store)))

(defn- clear-stale-last-success!
  "Drop the last-success timestamp when this instance switches from one backing to another.
  It is only ever written for the current storage, so the label left behind would otherwise sit at its final
  value for the life of the process, reading as a store that has not connected since.
  Losing the store is not a switch: that is precisely when the last known good timestamp is worth keeping."
  [previous-storage storage]
  (when (and previous-storage storage (not= previous-storage storage))
    ;; Clearing takes every label with it, which is what we want here -- only one can ever hold a value.
    (analytics/clear! :metabase-pgvector/store-last-success-timestamp-seconds)))

(defn- collect-pgvector-readiness-metrics!
  "Record availability and connection health for the selected pgvector store.
  Ignores engine activation, so a pgvector rollout can be validated before enabling anything that uses it.
  Needs no lock of its own: [[request-pgvector-readiness-refresh!]] admits one probe at a time."
  []
  (let [previous-storage (:storage @last-readiness-probe)
        {:keys [mode connected? resolved?]} (probe-store)
        storage          (case mode :dedicated "dedicated" :app-db "appdb" nil)
        at               (.getEpochSecond (Instant/now))]
    ;; Publish both stable series on every instance; both are zero when no store is usable.
    (doseq [candidate storage-labels]
      (analytics/set-gauge! :metabase-pgvector/store-available
                            {:storage candidate}
                            (if (= candidate storage) 1 0))
      (analytics/set-gauge! :metabase-pgvector/store-connected
                            {:storage candidate}
                            (if (and (= candidate storage) connected?) 1 0)))
    (clear-stale-last-success! previous-storage storage)
    (reset! last-readiness-probe {:storage    storage
                                  :connected? connected?
                                  :resolved?  resolved?
                                  :at         at})
    (when connected?
      (analytics/set-gauge! :metabase-pgvector/store-last-success-timestamp-seconds
                            {:storage storage}
                            at))))

(defn- readiness-probe-stale?
  [{:keys [at]}]
  (or (nil? at)
      (> (- (.getEpochSecond (Instant/now)) ^long at)
         (* 2 readiness-refresh-interval-seconds))))

(defn- readiness-refresh-due?
  "Whether to probe again on this scrape.
  A probe that couldn't answer is retried on the next one; one that did answer holds for the full interval."
  [{:keys [at resolved?]}]
  (or (nil? at)
      (not resolved?)
      (>= (- (.getEpochSecond (Instant/now)) ^long at) readiness-refresh-interval-seconds)))

(defn- refresh-pgvector-readiness-metrics!
  []
  (try
    (collect-pgvector-readiness-metrics!)
    (catch Throwable e
      ;; The scrape path never derefs this, so a throw here is otherwise silent.
      (log/error e "Pgvector readiness metric refresh failed"))))

(defonce ^:private readiness-probe-future (atom nil))

(defn- submit-pgvector-readiness-refresh!
  [f]
  (future-call f))

(defn- request-pgvector-readiness-refresh!
  "Start a readiness probe unless one is still running, and return the running probe.
  A live probe is never replaced. One stuck in a socket read cannot be cancelled, so admitting a replacement
  would strand another thread on every scrape; leaving the gauges on their last values until it ends is the
  better of the two, and only a database that answers nothing at all gets there."
  []
  (locking readiness-probe-future
    (let [running @readiness-probe-future]
      (if (and running (not (realized? running)))
        running
        (reset! readiness-probe-future
                (submit-pgvector-readiness-refresh! refresh-pgvector-readiness-metrics!))))))

(defn- pgvector-store-health-check
  "Health-inspector row for pgvector store reachability, nil when there is no store to reach.
  Reports the last probe, waiting up to [[probe-wait-ms]] on a fresh one when that is stale, so an unscraped
  instance still gets a current row without holding up every other check behind an unresponsive database."
  []
  (when (readiness-probe-stale? @last-readiness-probe)
    (deref (request-pgvector-readiness-refresh!) probe-wait-ms nil))
  (let [{:keys [storage connected? resolved?] :as probe} @last-readiness-probe]
    (cond
      ;; nil is reserved for "this instance has no pgvector store", which is a fact. Not finding out is not,
      ;; whether the probe answered that it couldn't tell or is still out there when the wait runs out.
      (or (nil? probe) (not resolved?))
      (search.index-health/degraded "Could not determine whether a pgvector store is reachable.")

      (not storage) nil
      connected?    (search.index-health/healthy (format "pgvector store (%s) reachable." storage))
      :else         (search.index-health/degraded (format "pgvector store (%s) unreachable." storage)))))

(health-inspector/register-check! :pgvector-store pgvector-store-health-check)

;; Seed both series at startup so every process exposes them before its first probe.
(defmethod analytics.core/known-labels :metabase-pgvector/store-available [_]
  (for [storage storage-labels]
    {:storage storage}))

(defmethod analytics.core/known-labels :metabase-pgvector/store-connected [_]
  (analytics.core/known-labels :metabase-pgvector/store-available))

;; store-last-success-timestamp-seconds is deliberately absent: a seeded 0 reads as 1970, firing any
;; staleness alert forever.
;; It appears once a probe succeeds.

;; No initial-value either, though a configured dedicated URL is available without being probed:
;; observe-initial-values increments rather than sets, so seeding 1 would leave the gauge at 2 wherever a
;; scrape had already probed. Both series start at 0 and the first probe corrects them.

(defn- scrape-pgvector-readiness-gauges!
  "Probe when due, and never wait for the answer -- the scrape carries no database latency."
  []
  (when (readiness-refresh-due? @last-readiness-probe)
    (request-pgvector-readiness-refresh!))
  nil)

;; Prometheus scrapes every Metabase process, whereas a Quartz job runs on only one member of a cluster.
;; Start a local, single-flight background probe from the scrape path so every process refreshes its own
;; gauge series.
(defmethod analytics.core/pull-collector ::pgvector-readiness-gauges [_]
  {:min-interval-s readiness-scrape-interval-seconds
   :f              scrape-pgvector-readiness-gauges!})
