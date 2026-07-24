(ns metabase.mq.test-util
  "Test fixture for exercising the MQ subsystem in tests. `with-test-mq` starts a
  fresh async memory backend and exposes a fixture context that carries the layer,
  the backend instances, and convenience fns (`flush!`, `wait-for-idle!`,
  `eventually!`) for driving delivery and waiting for quiescence.

  `do-with-test-mq!` also accepts `:duplicate-delivery? true` to wrap the
  backends with a decorator that publishes every message twice. The duplicate-
  delivery mode exists to force listeners under test to prove they handle the
  MQ's at-least-once contract — any scenario that silently relies on exactly-
  once delivery will fail loudly under this mode."
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.init :as mq.init]
   [metabase.mq.listener :as listener]
   [metabase.mq.memory :as memory]
   [metabase.mq.polling :as mq.polling]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.concurrency :as q.concurrency]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.registry :as q.registry]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Quiescence -------------------------------------------

(defn- layer-drained?
  "Returns true if no stored memory message belongs to a channel that currently has a listener.
  Messages on channels with no listener are orphaned by design (published after `unlisten!`) and
  would otherwise block teardown. Returns true for non-memory fixtures (appdb/redis) — no layer."
  [{:keys [layer]}]
  (if (nil? layer)
    true
    (let [listeners @listener/*listeners*]
      (not-any? #(contains? listeners (:queue %)) (vals @(:messages layer))))))

(defn- unmet-idle-conditions
  "Returns a set of the idle conditions that currently do NOT hold. Empty set == idle."
  [ctx]
  (cond-> #{}
    (seq @publish-buffer/*publish-buffer*)   (conj :publish-buffer-nonempty)
    (seq (q.concurrency/working-channels))   (conj :channels-still-working)
    (not (layer-drained? ctx))               (conj :memory-messages-pending)))

(defn wait-for-idle!
  "Blocks until the MQ fixture reaches quiescence or `timeout-ms` elapses. Throws
  an ex-info whose `:unmet` key names the conditions still holding on timeout.

  Because the poll loop drains memory channels *before* the next submit-delivery
  claims its slot, a single idle observation can occur in the gap between the two.
  We require two consecutive idle observations 20 ms apart."
  ([ctx] (wait-for-idle! ctx 5000))
  ([ctx timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop [consecutive-idle 0]
       ;; Wake every active polling thread on each tick so appdb backends drain
       ;; immediately instead of waiting on their 5s default poll interval.
       (mq.polling/notify-all!)
       (let [unmet (unmet-idle-conditions ctx)]
         (cond
           (and (empty? unmet) (>= consecutive-idle 1)) :idle
           (empty? unmet) (do (Thread/sleep 20) (recur (inc consecutive-idle)))
           (< (System/currentTimeMillis) deadline) (do (Thread/sleep 10) (recur 0))
           :else (throw (ex-info "MQ did not reach idle state before timeout"
                                 {:timeout-ms timeout-ms :unmet unmet}))))))))

(defn- force-expire-publish-buffer!
  "Marks every accumulation entry as past its deadline so the next `flush-publish-buffer!` call drains
  them immediately."
  []
  (swap! publish-buffer/*publish-buffer*
         (fn [buf]
           (into {} (map (fn [[k v]] [k (assoc v :deadline-ms 1)])) buf))))

(defn flush!
  "Force-drains the publish buffer and waits until the MQ is idle. This is the
  standard 'move time forward' primitive for tests: publish things, call `flush!`,
  then assert on the resulting state."
  ([ctx] (flush! ctx 5000))
  ([ctx timeout-ms]
   (force-expire-publish-buffer!)
   (publish-buffer/flush-publish-buffer!)
   (wait-for-idle! ctx timeout-ms)))

(defn wait-for!
  "Polls `pred` until it returns truthy or `timeout-ms` elapses; returns the final value (truthy, or
  nil/false on timeout). Use for async conditions that aren't expressible as 'the MQ is idle' and
  that don't need the polling threads woken (unlike [[eventually!]])."
  ([pred] (wait-for! pred 5000))
  ([pred timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
       (or (pred)
           (when (< (System/currentTimeMillis) deadline)
             (Thread/sleep 10)
             (recur)))))))

(defn eventually!
  "Polls `pred` until truthy or `timeout-ms` elapses. Returns the final value of
  `pred`. Use when the thing you're waiting on can't be expressed as 'MQ is idle'
  — for example, when waiting for a specific count to be reached or for
  appdb-backed delivery to round-trip through the database."
  ([_ctx pred] (eventually! _ctx pred 2000))
  ([_ctx pred timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
       ;; Wake any polling threads so appdb backends drain promptly instead of
       ;; blocking on their production poll interval.
       (mq.polling/notify-all!)
       (let [v (pred)]
         (if v
           v
           (if (< (System/currentTimeMillis) deadline)
             (do (Thread/sleep 10) (recur))
             v)))))))

;;; ------------------------------------------- Fixture -------------------------------------------

(defn listen!
  "Test helper — registers a per-message listener by wrapping `listener-fn` so it's called
  once per message in each batch, with error isolation. Production code should use
  [[metabase.mq.core/def-listener!]] instead; this is for ad-hoc test registration where
  declaring at namespace-load time isn't convenient.

  As a convenience, auto-declares the queue (with `{:transactional :try}`) if it hasn't been
  declared yet. Tests that need other queue-level config (e.g. `:exclusive`) or a different
  `:transactional` mode should call [[q.registry/register-queue!]] explicitly before calling this."
  [channel listener-fn]
  (when (and (= "queue" (namespace channel))
             (nil? (q.registry/get-queue channel)))
    (q.registry/register-queue! channel {:transactional :try}))
  (listener/batch-listen! channel
                          (fn [messages]
                            (let [error (volatile! nil)]
                              (doseq [m messages]
                                (try (listener-fn m)
                                     (catch Throwable e (vreset! error e))))
                              (when-let [e @error] (throw e))))))

(defn- merge-listeners!
  "Merges a user-supplied listener map on top of whatever listeners
  `register-listeners!` already registered. Values can be plain single-message
  fns (wrapped to match the vec-of-messages contract that `handle!` expects)
  or full config maps with `:listener` etc. Map-form values are passed through
  as-is — their `:listener` must already accept a vec of messages.

  Auto-declares the queue for any `:queue/*` channel that isn't already declared, matching
  the convenience semantics of [[listen!]]."
  [listeners]
  (when (seq listeners)
    (doseq [k (keys listeners)
            :when (and (= "queue" (namespace k))
                       (nil? (q.registry/get-queue k)))]
      (q.registry/register-queue! k {:transactional :try}))
    (swap! listener/*listeners*
           (fn [current]
             (reduce-kv (fn [m k v]
                          (assoc m k (if (fn? v)
                                       (if-let [existing (get current k)]
                                         (assoc existing :listener (partial run! v))
                                         {:listener (partial run! v)})
                                       v)))
                        current
                        listeners)))))

(defn- make-fixture-backends
  "Constructs backend instances for the given fixture kind. Memory gets a fresh
  isolated layer."
  [kind]
  (case kind
    :memory (let [layer (memory/make-layer)]
              {:backend  :memory
               :layer    layer
               :queue-be (q.memory/make-backend layer)})))

;; A defrecord (not reify) so it exposes a `:poll-context` field — the transport reads
;; `(:poll-context backend)` to wake the poll loop, and that must resolve to the inner backend's
;; poll context (the one the inner poll loop actually waits on).
(defrecord DoubleDeliveryBackend [inner poll-context]
  q.backend/QueueBackend
  (publish! [_ queue-name messages]
    (q.backend/publish! inner queue-name messages)
    (q.backend/publish! inner queue-name messages))
  (batch-successful! [_ queue-name batch-id]
    (q.backend/batch-successful! inner queue-name batch-id))
  (failure-count [_ queue-name batch-id]
    (q.backend/failure-count inner queue-name batch-id))
  (retry-batch! [_ queue-name batch-id]
    (q.backend/retry-batch! inner queue-name batch-id))
  (fail-batch! [_ queue-name batch-id]
    (q.backend/fail-batch! inner queue-name batch-id))
  (start! [_] (q.backend/start! inner))
  (shutdown! [_] (q.backend/shutdown! inner))
  (backend-id [_] (q.backend/backend-id inner))
  (fetch! [_ queue->free-slots] (q.backend/fetch! inner queue->free-slots))
  (recover-stale! [_ stale-timeout-ms max-retries]
    (q.backend/recover-stale! inner stale-timeout-ms max-retries))
  (run-heartbeats! [_] (q.backend/run-heartbeats! inner))
  (queue-depths [_] (q.backend/queue-depths inner)))

(defn- double-delivery-queue-backend!
  "Wraps an inner `QueueBackend` so that `publish!` calls the inner backend's
  `publish!` twice with the same payload. Used by `do-with-test-mq!` when
  `:duplicate-delivery?` is set, to force listeners under test to handle the
  MQ's at-least-once contract."
  [inner]
  (->DoubleDeliveryBackend inner (:poll-context inner)))

(defn do-with-test-mq!
  "Function form of [[with-test-mq]]. `opts` may include:

  - `:backend`                 `:memory` (default)
  - `:listeners`            listener map, same shape as `with-sync-mq` had
  - `:duplicate-delivery?`  when true, wraps both backends with a decorator
                            that publishes every message twice — used to
                            verify listeners handle at-least-once delivery

  The fixture forces `*publish-buffer-ms*` to 0 so publishes go straight to the
  backend without waiting for the background flush scheduler. Tests that want to
  exercise buffering behaviour must rebind it explicitly in the body."
  ([f] (do-with-test-mq! {} f))
  ([opts f]
   (let [{:keys [backend listeners duplicate-delivery?] :or {backend :memory}} opts]
     (binding [listener/*listeners*            (atom {})
               q.registry/*queues*             (atom {})
               q.concurrency/*in-flight*       (atom {})
               publish-buffer/*publish-buffer* (atom {})
               publish-buffer/*publish-buffer-ms* 0]
       (let [backends (make-fixture-backends backend)
             queue-be (cond-> (:queue-be backends)
                        duplicate-delivery? double-delivery-queue-backend!)
             handle   (mq.init/start! queue-be)
             ctx      (assoc backends :queue-be queue-be :handle handle)]
         (try
           (merge-listeners! listeners)
           (let [result (f ctx)]
             (flush! ctx)
             result)
           (finally
             (mq.init/stop! handle))))))))

(defmacro with-test-mq
  "Starts an MQ subsystem, runs body with `ctx-sym` bound to a fixture context
  map, then drains and shuts down.

  The binding vector is `[ctx-sym]` or `[ctx-sym opts-map]` where `opts-map`
  may contain `:backend`, `:duplicate-delivery?`, etc. — anything
  [[do-with-test-mq!]] accepts.

  An optional listener map may follow the binding vector (same shape as the
  old `with-sync-mq`). It is merged into the opts under `:listeners`.

  Use `(mq.tu/flush! ctx)` between publishes and assertions, and
  `(mq.tu/wait-for-idle! ctx)` / `(mq.tu/eventually! ctx pred)` where finer
  control is needed.

  Examples:

      (with-test-mq [ctx]
        body)

      (with-test-mq [ctx]
        {:queue/foo (fn [msg] ...)}
        body)

      (with-test-mq [ctx {:duplicate-delivery? true}]
        body)"
  {:style/indent 1}
  [[ctx-sym & [opts-expr]] & body]
  (let [[listeners body] (if (map? (first body))
                           [(first body) (rest body)]
                           [nil body])]
    `(do-with-test-mq! (merge ~opts-expr {:listeners ~listeners})
                       (fn [~ctx-sym] ~@body))))

(defmacro with-worker-redefs
  "`with-redefs`, for stubbing fns that a queue *handler* calls.

  Handlers run on MQ worker threads, which do not carry the test thread's dynamic bindings, so
  `mt/with-dynamic-fn-redefs` is not an option here: the
  worker would simply never see the rebinding. A root swap is the only thing it observes.

  That swap is process-global for the duration of `body`, so a test using this must be marked
  `^:synchronous`, exactly as it would if it reached for `with-redefs` directly.

  Prefer this over a bare `with-redefs` + inline `:clj-kondo/ignore` in queue tests. Stubbing a
  handler's collaborators is a standing requirement of testing a queue, not a code smell, and
  spelling it once here keeps the `prefer-with-dynamic-fn-redefs` nudge — and the ignore ratchet it
  feeds — meaningful for the redefs that really could have been dynamic.

      (with-worker-redefs [runner/run-query! (fn [_id] (throw (ex-info \"boom\" {})))]
        (with-test-mq [ctx]
          ...))"
  {:style/indent 1}
  [bindings & body]
  `(with-redefs ~bindings ~@body))

;;; ------------------------------------------- Fixture self-tests -------------------------------------------

(deftest duplicate-delivery-doubles-queue-messages-test
  (testing "With :duplicate-delivery? true, the queue backend delivers each message twice"
    (with-test-mq [ctx {:duplicate-delivery? true}]
      (let [received (atom [])]
        (listen! :queue/chaos-smoke #(swap! received conj %))
        (mq/with-queue :queue/chaos-smoke [q]
          (mq/put q "hello"))
        (eventually! ctx #(= 2 (count @received)) 5000)
        (is (= ["hello" "hello"] @received)
            "Single published message is delivered to the listener twice")
        (mq/unlisten! :queue/chaos-smoke)))))

(deftest duplicate-delivery-off-by-default-test
  (testing "The default fixture delivers each message exactly once"
    (with-test-mq [ctx]
      (let [received (atom [])
            dup      (promise)] ; delivered only if an (unexpected) second delivery arrives
        (listen! :queue/chaos-default (fn [m]
                                        (when (> (count (swap! received conj m)) 1)
                                          (deliver dup :dup))))
        (mq/with-queue :queue/chaos-default [q]
          (mq/put q "once"))
        (eventually! ctx #(>= (count @received) 1) 5000)
        ;; A second (unexpected) delivery would resolve `dup`; wait on it (returning early if it
        ;; fires) and confirm it never does.
        (is (= ::none (deref dup 200 ::none)) "no second (duplicate) delivery")
        (is (= ["once"] @received)
            "Default fixture delivers exactly once")
        (mq/unlisten! :queue/chaos-default)))))
