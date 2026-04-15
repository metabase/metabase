(ns metabase.mq.test-util
  "Test fixture for exercising the MQ subsystem in tests. `with-test-mq` starts a
  fresh async memory backend and exposes a fixture context that carries the layer,
  the backend instances, and convenience fns (`flush!`, `wait-for-idle!`,
  `eventually`) for driving delivery and waiting for quiescence."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.init :as mq.init]
   [metabase.mq.listener :as listener]
   [metabase.mq.memory :as memory]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.topic.memory :as topic.memory])
  (:import
   (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Quiescence -------------------------------------------

(defn- layer-channels-empty?
  "Returns true if every memory channel that currently has a listener is empty.
  Channels with no listener are not counted — messages published after an
  `unlisten!` are orphaned by design and would otherwise block teardown."
  [{:keys [layer]}]
  (let [listeners @listener/*listeners*]
    (every? (fn [[channel-name ^LinkedBlockingQueue q]]
              (or (not (contains? listeners channel-name))
                  (.isEmpty q)))
            @(:channels layer))))

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

(defn eventually
  "Polls `pred` until truthy or `timeout-ms` elapses. Returns the final value of
  `pred`. Use when the thing you're waiting on can't be expressed as 'MQ is idle'
  — for example, when waiting for a specific count to be reached."
  ([_ctx pred] (eventually _ctx pred 2000))
  ([_ctx pred timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
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

(defn do-with-test-mq
  "Implementation detail for [[with-test-mq]]."
  [listeners f]
  (binding [listener/*listeners*            (atom {})
            publish-buffer/*publish-buffer* (atom {})]
    (let [layer    (memory/make-layer)
          queue-be (q.memory/make-backend layer)
          topic-be (topic.memory/make-backend layer)
          handle   (mq.init/start! queue-be topic-be)
          ctx      {:layer    layer
                    :queue-be queue-be
                    :topic-be topic-be
                    :handle   handle}]
      (try
        (merge-listeners! listeners)
        (let [result (f ctx)]
          (flush! ctx)
          result)
        (finally
          (mq.init/stop! handle))))))

(defmacro with-test-mq
  "Starts an MQ subsystem backed by isolated memory queue + topic backends on a
  fresh `MemoryLayer`, runs body with `ctx-sym` bound to a fixture context map of
  the form `{:layer :queue-be :topic-be :handle}`, then drains and shuts down.

  An optional listener map may follow the binding vector, same shape as the old
  `with-sync-mq`.

  Use `(mq.tu/flush! ctx)` between publishes and assertions, and
  `(mq.tu/wait-for-idle! ctx)` / `(mq.tu/eventually ctx pred)` where finer
  control is needed."
  {:style/indent 1}
  [[ctx-sym] & body]
  (let [[listeners body] (if (map? (first body))
                           [(first body) (rest body)]
                           [nil body])]
    `(do-with-test-mq ~listeners (fn [~ctx-sym] ~@body))))

