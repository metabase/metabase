(ns metabase-enterprise.semantic-search.embedding-health
  "Embedding-service liveness and circuit recovery shared by semantic search and entity retrieval."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Executors ScheduledExecutorService ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(defn- probe-embedding-service
  []
  (try
    ;; This liveness signal must not mutate the breaker; recovery trials are scheduled separately below.
    (binding [embedding/*bypass-circuit-breaker* true]
      (embedding/get-embedding (embedding/get-configured-model)
                               "health check"
                               {:type :query, :record-tokens? false, :snowplow? false}))
    {:reachable? true, :error nil}
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      (log/debug e "Embedding service health probe failed")
      {:reachable? false, :error (ex-message e)})))

(def ^:private embedding-service-reachable?*
  (memoize/ttl probe-embedding-service :ttl/threshold (* 60 1000)))

(defn embedding-service-reachable?
  "Probe the configured embedding service. Results are shared for a 60-second window."
  []
  (embedding-service-reachable?*))

(declare request-circuit-recovery!)

(defn embedding-problem
  "Return an embedding-service problem, or nil when the service and circuit are ready.
  A reachable probe schedules circuit recovery when an idle workload has not supplied trial calls."
  []
  (let [{:keys [reachable? error]} (embedding-service-reachable?)]
    (cond
      (not reachable?)
      (str "embedding service unreachable: " error)

      (embedding/embedder-circuit-untrusted?)
      (do
        (request-circuit-recovery!)
        "embedder circuit open (probe reachable; breaker still guarding calls)"))))

(def ^:private recovery-delay-ms 30000)

(def ^:private recovery-cooldown-ns
  (* recovery-delay-ms 1000000))

(defonce ^:private ^ScheduledExecutorService recovery-scheduler
  (Executors/newSingleThreadScheduledExecutor
   (reify ThreadFactory
     (newThread [_ runnable]
       (doto (Thread. runnable "embedding-circuit-recovery")
         (.setDaemon true))))))

(defonce ^:private recovery-state
  (atom {:running? false, :last-start-ns nil}))

(defn- claim-recovery! [now-ns]
  (loop []
    (let [{:keys [running? last-start-ns] :as state} @recovery-state]
      (cond
        running? false
        (and last-start-ns (< (- now-ns last-start-ns) recovery-cooldown-ns)) false
        (compare-and-set! recovery-state state {:running? true, :last-start-ns now-ns}) true
        :else (recur)))))

(defn- run-recovery-probe! []
  (embedding/get-embedding (embedding/get-configured-model)
                           "health check"
                           {:type :query, :record-tokens? false, :snowplow? false}))

(defn- recover-circuit! []
  (try
    ;; More than the current two-success threshold keeps this correct if that threshold is raised modestly.
    (loop [remaining 4]
      (when (and (pos? remaining) (embedding/embedder-circuit-untrusted?))
        (run-recovery-probe!)
        (recur (dec remaining))))
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      (log/debug e "Embedding service circuit recovery probe failed"))
    (finally
      (swap! recovery-state assoc :running? false)))
  ;; A still-untrusted breaker needs another delayed trial even when no user traffic or health consumer runs.
  (when (embedding/embedder-circuit-untrusted?)
    (request-circuit-recovery!)))

(defn- schedule-recovery! [f]
  (.schedule recovery-scheduler ^Runnable f (long recovery-delay-ms) TimeUnit/MILLISECONDS))

(defn request-circuit-recovery!
  "Schedule a throttled breaker-controlled probe after the breaker's open delay. Returns promptly."
  []
  (when (and (embedding/embedder-circuit-untrusted?)
             (claim-recovery! (System/nanoTime)))
    (try
      (schedule-recovery! recover-circuit!)
      (catch Exception e
        (swap! recovery-state assoc :running? false)
        (log/error e "Failed to schedule embedding service circuit recovery"))))
  nil)

(defn- clear-probe-cache-on-recovery! [state]
  (when (= :closed state)
    (memoize/memo-clear! embedding-service-reachable?*)))

(defn- request-recovery-on-open! [state]
  (when (= :open state)
    (request-circuit-recovery!)))

;; Register the shared cache hook before either consumer registers its health-row hook.
(swap! embedding/embedder-circuit-state-change-hooks conj #'clear-probe-cache-on-recovery!)
(swap! embedding/embedder-circuit-state-change-hooks conj #'request-recovery-on-open!)
