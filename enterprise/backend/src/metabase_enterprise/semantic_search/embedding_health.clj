(ns metabase-enterprise.semantic-search.embedding-health
  "Embedding-service liveness and circuit recovery shared by semantic search and entity retrieval."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.util.log :as log]))

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
    (catch Exception e
      (log/debug e "Embedding service health probe failed")
      {:reachable? false, :error (ex-message e)})))

(def ^:private embedding-service-reachable?*
  (memoize/ttl probe-embedding-service :ttl/threshold (* 60 1000)))

(defn embedding-service-reachable?
  "Probe the configured embedding service. Results are shared for a 60-second window."
  []
  (embedding-service-reachable?*))

(defn embedding-problem
  "A human-readable embedding-service problem, or nil when the service and breaker are ready."
  []
  (let [{:keys [reachable? error]} (embedding-service-reachable?)]
    (cond
      (not reachable?)
      (str "embedding service unreachable: " error)

      (embedding/embedder-circuit-untrusted?)
      "embedder circuit open (probe reachable; breaker still guarding calls)")))

(def ^:private recovery-cooldown-ns
  ;; Matches the breaker's open delay: retries before then can only be rejected without reaching the service.
  (* 30 1000 1000000))

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

(defn- recover-circuit! []
  (try
    ;; More than the current two-success threshold keeps this correct if that threshold is raised modestly.
    (loop [remaining 4]
      (when (and (pos? remaining) (embedding/embedder-circuit-untrusted?))
        (embedding/get-embedding (embedding/get-configured-model)
                                 "health check"
                                 {:type :query, :record-tokens? false, :snowplow? false})
        (recur (dec remaining))))
    (catch Exception e
      (log/debug e "Embedding service circuit recovery probe failed"))
    (finally
      (swap! recovery-state assoc :running? false))))

(defn request-circuit-recovery!
  "Schedule a throttled breaker-controlled probe when the embedder circuit is not closed. Returns promptly."
  []
  (when (and (embedding/embedder-circuit-untrusted?)
             (claim-recovery! (System/nanoTime)))
    (future (recover-circuit!)))
  nil)

(defn- clear-probe-cache-on-recovery! [state]
  (when (= :closed state)
    (memoize/memo-clear! embedding-service-reachable?*)))

;; Register the shared cache hook before either consumer registers its health-row hook.
(swap! embedding/embedder-circuit-state-change-hooks conj #'clear-probe-cache-on-recovery!)
