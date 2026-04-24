(ns metabase.mq.test-util
  "Test fixture for exercising the MQ subsystem in tests. `with-test-mq` starts a
  fresh async memory backend and exposes a fixture context that carries the layer,
  the backend instances, and convenience fns (`flush!`, `wait-for-idle!`,
  `eventually!`) for driving delivery and waiting for quiescence.

  `do-with-test-mq!` also accepts `:backend :appdb` for running the real database-
  backed backend in parity tests, and `:duplicate-delivery? true` to wrap the
  backends with a decorator that publishes every message twice. The duplicate-
  delivery mode exists to force listeners under test to prove they handle the
  MQ's at-least-once contract — any scenario that silently relies on exactly-
  once delivery will fail loudly under this mode."
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.init :as mq.init]
   [metabase.mq.listener :as listener]
   [metabase.mq.memory :as memory]
   [metabase.mq.polling :as mq.polling]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.topic.appdb :as topic.appdb]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.memory :as topic.memory])
  (:import
   (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Quiescence -------------------------------------------

(defn- layer-channels-empty?
  "Returns true if every memory channel that currently has a listener is empty.
  Channels with no listener are not counted — messages published after an
  `unlisten!` are orphaned by design and would otherwise block teardown.
  Returns true for non-memory fixtures (appdb) since there is no layer."
  [{:keys [layer]}]
  (if (nil? layer)
    true
    (let [listeners @listener/*listeners*]
      (every? (fn [[channel-name ^LinkedBlockingQueue q]]
                (or (not (contains? listeners channel-name))
                    (.isEmpty q)))
              @(:channels layer)))))

(defn- unmet-idle-conditions
  "Returns a set of the idle conditions that currently do NOT hold. Empty set == idle."
  [ctx]
  (cond-> #{}
    (seq @publish-buffer/*publish-buffer*) (conj :publish-buffer-nonempty)
    (seq (mq.impl/busy-channels))          (conj :busy-channels)
    (not (layer-channels-empty? ctx))      (conj :memory-channels-nonempty)))

(defn wait-for-idle!
  "Blocks until the MQ fixture reaches quiescence or `timeout-ms` elapses. Throws
  an ex-info whose `:unmet` key names the conditions still holding on timeout.

  Because `poll-once!` drains memory channels *before* setting `active-handlers`
  on the next submit-delivery, a single idle observation can occur in the gap
  between the two. We require two consecutive idle observations 20 ms apart."
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
  "Marks every entry in the publish buffer as past its deadline so the next
  `flush-publish-buffer!` call drains it immediately."
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

(defn- merge-listeners!
  "Merges a user-supplied listener map on top of whatever listeners
  `register-listeners!` already registered. Values can be plain fns (wrapped in
  standard listener config) or full config maps with `:listener` etc."
  [listeners]
  (when (seq listeners)
    (swap! listener/*listeners*
           (fn [current]
             (reduce-kv (fn [m k v]
                          (assoc m k (if (fn? v)
                                       (if-let [existing (get current k)]
                                         (assoc existing :listener v)
                                         {:listener           v
                                          :max-batch-messages 1})
                                       v)))
                        current
                        listeners)))))

(defn- make-fixture-backends
  "Constructs backend instances for the given fixture kind. Memory gets a fresh
  isolated layer; appdb reuses its process-wide singleton since the DB is shared."
  [kind]
  (case kind
    :memory (let [layer (memory/make-layer)]
              {:backend     :memory
               :layer    layer
               :queue-be (q.memory/make-backend layer)
               :topic-be (topic.memory/make-backend layer)})
    :appdb  {:backend     :appdb
             :queue-be q.appdb/backend
             :topic-be topic.appdb/backend}))

(defn- double-delivery-queue-backend!
  "Wraps an inner `QueueBackend` so that `publish!` calls the inner backend's
  `publish!` twice with the same payload. Used by `do-with-test-mq!` when
  `:duplicate-delivery?` is set, to force listeners under test to handle the
  MQ's at-least-once contract."
  [inner]
  (reify q.backend/QueueBackend
    (publish! [_ queue-name messages]
      (q.backend/publish! inner queue-name messages)
      (q.backend/publish! inner queue-name messages))
    (batch-successful! [_ queue-name batch-id]
      (q.backend/batch-successful! inner queue-name batch-id))
    (batch-failed! [_ queue-name batch-id]
      (q.backend/batch-failed! inner queue-name batch-id))
    (start! [_] (q.backend/start! inner))
    (shutdown! [_] (q.backend/shutdown! inner))))

(defn- double-delivery-topic-backend!
  "Wraps an inner `TopicBackend` so that `publish!` calls the inner backend's
  `publish!` twice with the same payload. Used by `do-with-test-mq!` when
  `:duplicate-delivery?` is set."
  [inner]
  (reify topic.backend/TopicBackend
    (publish! [_ topic-name messages]
      (topic.backend/publish! inner topic-name messages)
      (topic.backend/publish! inner topic-name messages))
    (subscribe! [_ topic-name]
      (topic.backend/subscribe! inner topic-name))
    (unsubscribe! [_ topic-name]
      (topic.backend/unsubscribe! inner topic-name))
    (start! [_] (topic.backend/start! inner))
    (shutdown! [_] (topic.backend/shutdown! inner))))

(defn do-with-test-mq!
  "Function form of [[with-test-mq]]. `opts` may include:

  - `:backend`                 `:memory` (default) or `:appdb`
  - `:listeners`            listener map, same shape as `with-sync-mq` had
  - `:duplicate-delivery?`  when true, wraps both backends with a decorator
                            that publishes every message twice — used to
                            verify listeners handle at-least-once delivery

  The fixture forces `*publish-buffer-ms*` to 0 so publishes go straight to the
  backend without waiting for the background flush scheduler. Tests that want to
  exercise buffering behaviour must rebind it explicitly in the body."
  ([f] (do-with-test-mq! {} f))
  ([opts f]
   (let [{:keys [kind listeners duplicate-delivery?] :or {kind :memory}} opts]
     (binding [listener/*listeners*               (atom {})
               publish-buffer/*publish-buffer*    (atom {})
               publish-buffer/*publish-buffer-ms* 0]
       (let [backends (make-fixture-backends kind)
             queue-be (cond-> (:queue-be backends)
                        duplicate-delivery? double-delivery-queue-backend!)
             topic-be (cond-> (:topic-be backends)
                        duplicate-delivery? double-delivery-topic-backend!)
             handle   (mq.init/start! queue-be topic-be)
             ctx      (assoc backends :queue-be queue-be :topic-be topic-be :handle handle)]
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

      (with-test-mq [ctx {:backend :appdb :duplicate-delivery? true}]
        body)"
  {:style/indent 1}
  [[ctx-sym & [opts-expr]] & body]
  (let [[listeners body] (if (map? (first body))
                           [(first body) (rest body)]
                           [nil body])]
    `(do-with-test-mq! (merge ~opts-expr {:listeners ~listeners})
                       (fn [~ctx-sym] ~@body))))

;;; ------------------------------------------- Fixture self-tests -------------------------------------------

(deftest duplicate-delivery-doubles-queue-messages-test
  (testing "With :duplicate-delivery? true, the queue backend delivers each message twice"
    (with-test-mq [ctx {:duplicate-delivery? true}]
      (let [received (atom [])]
        (mq/listen! :queue/chaos-smoke {} #(swap! received conj %))
        (mq/with-queue :queue/chaos-smoke [q]
          (mq/put q "hello"))
        (eventually! ctx #(= 2 (count @received)) 5000)
        (is (= ["hello" "hello"] @received)
            "Single published message is delivered to the listener twice")
        (mq/unlisten! :queue/chaos-smoke)))))

(deftest duplicate-delivery-doubles-topic-messages-test
  (testing "With :duplicate-delivery? true, the topic backend delivers each message twice"
    (with-test-mq [ctx {:duplicate-delivery? true}]
      (let [received (atom [])]
        (mq/listen! :topic/chaos-smoke {} #(swap! received conj %))
        (mq/with-topic :topic/chaos-smoke [t]
          (mq/put t "ping"))
        (eventually! ctx #(= 2 (count @received)) 5000)
        (is (= ["ping" "ping"] @received)
            "Single published topic message is delivered to the subscriber twice")
        (mq/unlisten! :topic/chaos-smoke)))))

(deftest duplicate-delivery-off-by-default-test
  (testing "The default fixture delivers each message exactly once"
    (with-test-mq [ctx]
      (let [received (atom [])]
        (mq/listen! :queue/chaos-default {} #(swap! received conj %))
        (mq/with-queue :queue/chaos-default [q]
          (mq/put q "once"))
        (eventually! ctx #(>= (count @received) 1) 5000)
        ;; Give the poll thread an extra moment in case a second (unexpected)
        ;; delivery is on the way, then confirm exactly one happened.
        (Thread/sleep 100)
        (is (= ["once"] @received)
            "Default fixture delivers exactly once")
        (mq/unlisten! :queue/chaos-default)))))
