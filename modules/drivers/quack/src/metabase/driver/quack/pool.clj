(ns metabase.driver.quack.pool
  "Per-conn-spec pool of Quack ``connection_id``\\ s.

  The Quack overview and the DuckDB *Tuning Workloads* guide both recommend
  reusing connections across requests: each fresh connection is a
  ``CONNECTION_REQUEST`` round-trip *plus* a TCP (and, with TLS, a TLS
  handshake) on the HTTP transport. This pool holds idle ``connection_id``\\ s
  keyed by endpoint (host/port/ssl/token) so a steady Metabase workload reuses
  a handful of server-side connections instead of dialing fresh per query.

  The pool is *connection-id* pooling only. HTTP/TLS keep-alive is handled by
  the shared ``java.net.http.HttpClient`` in ``quack.client``. Both layers must
  reuse for the documented benefit to land.

  Concurrency: each endpoint's deque is independent; the deque itself is a
  thread-safe ``LinkedBlockingDeque``. Borrow/connect is the only path that can
  race on \"create a new connection\" and a race there is harmless (worst case:
  one extra connection, which gets returned to the pool or disconnected).

  Idle expiry: entries older than ``max-idle-ms`` are discarded on borrow
  (never handed out) without a network probe — cheaper than a ``SELECT 1``
  ping and never hands out a possibly-dead connection. After ``max-idle-ms``
  of inactivity the pool drains naturally, which is the right behavior (we
  don't want to hold server-side connections forever).

  No background sweeper thread: idle entries are reaped lazily on borrow and
  return. A conn that is *borrowed* and never returned (a misbehaving consumer)
  is out of the pool's reach — callers MUST reduce the reducible returned by
  ``quack.client/execute-query`` so the conn is returned or discarded.

  Injected: the pool takes ``connect!`` / ``disconnect!`` at creation time so
  it has no dependency on ``quack.client`` (avoids a require cycle) and is unit-
  testable with mock fns (no live server needed)."
  (:require
   [metabase.util.performance :refer [select-keys]])
  (:import [java.util.concurrent LinkedBlockingDeque]))

(set! *warn-on-reflection* true)

(def ^:private default-max-idle 4)
(def ^:private default-max-idle-ms (* 5 60 1000))   ; 5 minutes

(defn- pool-key
  "The cache key for a conn-spec. Same endpoint + auth = same pool. Tunneled
  conn-specs are marked ``::no-pool?`` by the caller and never reach the pool."
  [conn-spec]
  (select-keys conn-spec [:host :port :ssl :token :trust-store :trust-store-password :insecure-tls]))

(defn make-pool
  "Build a new pool. Opts:

  * ``:connect!``     ``(conn-spec) -> conn-id`` — create a fresh server-side connection.
  * ``:disconnect!``  ``(conn-spec conn-id) -> any`` — tear one down (best-effort).
  * ``:max-idle``     max idle entries per endpoint (default 4).
  * ``:max-idle-ms``  max idle time before an entry is stale (default 300000)."
  [{:keys [connect! disconnect! max-idle max-idle-ms]
    :or   {max-idle default-max-idle max-idle-ms default-max-idle-ms}
    :as opts}]
  (when-not (and (ifn? connect!) (ifn? disconnect!))
    (throw (ex-info "pool requires :connect! and :disconnect! fns" {:opts (dissoc opts :connect! :disconnect!)})))
  {:connect!    connect!
   :disconnect! disconnect!
   :max-idle    (long max-idle)
   :max-idle-ms (long max-idle-ms)
   ;; {pool-key {:queue LinkedBlockingDeque<[conn-id ts]>}}
   :pools       (atom {})})

(defn- entry-queue
  "Get-or-create the deque for `pool-key`."
  ^LinkedBlockingDeque
  [pool key]
  (let [pools (:pools pool)
        ;; swap! for create-if-absent; existing entries are returned as-is.
        _ (swap! pools (fn [m] (if (get m key) m (assoc m key {:queue (LinkedBlockingDeque.)}))))
        entry (get @pools key)]
    (:queue entry)))

(defn borrow!
  "Return a usable ``conn-id`` for `conn-spec`. Pops a fresh-enough idle entry;
  discards stale ones (older than ``max-idle-ms``); creates a new connection
  only when the queue is empty. Never hands out a stale conn."
  [{:keys [connect! disconnect! max-idle-ms] :as pool} conn-spec]
  (let [key   (pool-key conn-spec)
        ^LinkedBlockingDeque queue (entry-queue pool key)
        now   (System/currentTimeMillis)]
    (loop []
      (if-let [pair (.poll queue)]                           ; non-blocking; nil if empty
        (let [[conn-id ts] pair]
          (if (< (- now (long ts)) max-idle-ms)
            conn-id                                          ; fresh enough → use it
            (do (disconnect! conn-spec conn-id) (recur))))   ; stale → drop & try next
        (connect! conn-spec)))))                             ; empty → new connection

(defn return!
  "Return `conn-id` to the idle pool for reuse, *unless* the pool is full
  (then disconnect it). Called after a successful operation."
  [{:keys [disconnect! max-idle] :as pool} conn-spec conn-id]
  (let [key   (pool-key conn-spec)
        ^LinkedBlockingDeque queue (entry-queue pool key)]
    (if (< (.size queue) (long max-idle))
      (.put queue [conn-id (System/currentTimeMillis)])
      (disconnect! conn-spec conn-id))))

(defn discard!
  "Tear down `conn-id` WITHOUT returning it to the pool — for use after an
  error, when the connection might be in a bad state. Distinct from
  [[return!]] so error paths never poison the idle queue."
  [{:keys [disconnect!]} conn-spec conn-id]
  (disconnect! conn-spec conn-id))

(defn close-all!
  "Disconnect every idle connection in every endpoint pool and clear them.
  Used by tests (via ``quack.client/reset-pool!``) and on shutdown.

  Passes each entry's pool-key (the endpoint+auth subset of a conn-spec) as the
  conn-spec to ``disconnect!`` — that's exactly the keys ``quack.client``'s
  DISCONNECT needs (host/port/ssl/token), so real disconnects actually fire.
  (Previously this passed ``nil``, which the client's best-effort disconnect!
  swallowed via its try/catch — silently leaking every pooled connection_id.)"
  [{:keys [disconnect!] :as pool}]
  (let [pools  (:pools pool)
        m      (swap-vals! pools (fn [_] {}))
        emptied (first m)]
    (doseq [[pool-key {:keys [^LinkedBlockingDeque queue]}] emptied
            pair (.toArray queue)]
      (let [[conn-id _ts] pair]
        (try (disconnect! pool-key conn-id) (catch Throwable _))))))

(defn stats
  "Return a debug map ``{pool-key {:idle n}}``. Stable enough for assertions in
  tests; not a public API."
  [pool]
  (let [m @(:pools pool)]
    (into {} (for [[k {:keys [^LinkedBlockingDeque queue]}] m]
               [k {:idle (.size queue)}]))))
