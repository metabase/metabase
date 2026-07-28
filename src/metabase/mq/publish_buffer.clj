(ns metabase.mq.publish-buffer
  "Publish buffering: batches rapid-fire publishes into time-windowed groups
   and flushes them on a background scheduled thread."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.outbox :as q.outbox]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.transport :as transport]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Executors ScheduledExecutorService ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:dynamic *publish-buffer-ms*
  "Time window in ms to buffer rapid-fire publishes. 0 = immediate publish.
   Resets on every new message (sliding window)."
  100)

(def ^:dynamic *publish-buffer-max-ms*
  "Maximum time in ms since the first message before a flush is forced. 0 = no max."
  5000)

(def ^:dynamic *publish-buffer*
  "Accumulation buffer for rapid-fire publishes.
   channel → {:messages [...] :deadline-ms long :created-ms long}"
  (atom {}))

(defn- max-batch-size [channel]
  (q.registry/max-batch-messages channel))

(defn buffered-publish!
  "Routes messages through *publish-buffer* or publishes immediately based on `*publish-buffer-ms*`.

   The sync path (when `*publish-buffer-ms*` is 0) splits `messages` into chunks of
   `:max-batch-messages` before handing them to the transport.

   The buffered path appends to the buffer and, if buffering pushes the channel's queued
   count to or past `:max-batch-messages`, trips the channel's deadline so the next tick
   of the background flush executor drains it. The actual flush stays on the executor
   thread — publisher threads never block on backend writes.

   `:max-batch-messages` is a soft target here, not a hard cap, a fuller over-the-wire batch is cheaper than several small ones."
  [channel messages]
  (let [max-size (max-batch-size channel)]
    (if (zero? *publish-buffer-ms*)
      (doseq [chunk (partition-all max-size messages)]
        (transport/publish! channel (vec chunk)))
      (let [[_ new] (swap-vals! *publish-buffer*
                                (fn [buf]
                                  (let [now (System/currentTimeMillis)]
                                    (update buf channel
                                            (fn [entry]
                                              (-> (or entry {:messages [] :deadline-ms 0 :created-ms now})
                                                  (update :messages into messages)
                                                  (assoc :deadline-ms (+ now *publish-buffer-ms*))))))))]
        (when (>= (count (get-in new [channel :messages])) max-size)
          ;; Buffer reached the per-channel max-batch limit. Trip its deadline so the next
          ;; background flush tick drains it. Other channels' deadlines are left untouched.
          ;; The publisher does not flush synchronously — that would block on a backend write.
          (swap! *publish-buffer*
                 (fn [buf] (cond-> buf (contains? buf channel) (assoc-in [channel :deadline-ms] 1)))))))))

(defn- handoff-to-outbox!
  "A flush of `messages` on `channel` couldn't reach the backend. Hand the batch to the durable outbox for further attempts."
  [channel messages ^Exception e]
  (try
    (q.outbox/insert-batch! channel (payload/encode messages))
    (analytics/inc! :metabase-mq/batches-retried {:channel (name channel) :reason "publish-outbox-handoff"})
    (log/warnf e "Backend publish failed for %s; handed %d message(s) to the durable outbox for recovery"
               channel (count messages))
    (catch Exception oe
      (analytics/inc! :metabase-mq/batches-dropped {:channel (name channel) :reason "outbox-handoff-failed"})
      (log/errorf oe "Backend publish AND outbox handoff both failed for %s; dropping %d message(s). Publish error: %s"
                  channel (count messages) (ex-message e)))))

(defn- flush-accumulation!
  "Drains accumulation entries past their deadline (or all of them when `force?`) and publishes each.
   An entry is due once its sliding `:deadline-ms` arrives or it has sat for `*publish-buffer-max-ms*`
   since its first message."
  [force?]
  (doseq [channel (keys @*publish-buffer*)]
    (let [drained (atom nil)]
      (swap! *publish-buffer*
             (fn [buf]
               (if-let [{:keys [deadline-ms created-ms] :as entry} (get buf channel)]
                 (let [now (System/currentTimeMillis)]
                   (if (or force?
                           (and (pos? deadline-ms) (>= now deadline-ms))
                           (and (pos? *publish-buffer-max-ms*) (>= now (+ created-ms *publish-buffer-max-ms*))))
                     (do (reset! drained entry) (dissoc buf channel))
                     buf))
                 buf)))
      (when-let [{:keys [messages]} @drained]
        (try (transport/publish! channel messages)
             (catch Exception e
               (handoff-to-outbox! channel messages e)))))))

(defn flush-publish-buffer!
  "Drains accumulation entries past their deadline, handing any that can't reach the backend to the
   durable outbox. When `force?` is true (the graceful-shutdown path) every entry is drained
   regardless of deadline, so nothing buffered is lost on shutdown."
  ([] (flush-publish-buffer! false))
  ([force?]
   (doseq [[channel entry] @*publish-buffer*]
     (analytics/set-gauge! :metabase-mq/publish-buffer-depth
                           {:channel (name channel)}
                           (count (:messages entry))))
   (flush-accumulation! force?)))

(defonce ^:private publish-buffer-executor (atom nil))

(defn- safe-flush!
  "Runs `flush-publish-buffer!` swallowing any throwable. `scheduleAtFixedRate` silently stops
  rescheduling a task that throws an uncaught exception, which would freeze the flusher and stall
  every channel; catching here keeps the periodic task alive across transient flush errors."
  []
  (try
    (flush-publish-buffer!)
    (catch Throwable t
      (log/error t "Unexpected error in publish-buffer flush; flusher continues"))))

(defn start-publish-buffer-flush!
  "Starts a daemon thread that flushes the publish buffer every 100ms. Idempotent.
  Returns `true` if THIS call created the executor, `false` if one was already running."
  []
  (let [exec (Executors/newSingleThreadScheduledExecutor
              (reify ThreadFactory
                (newThread [_ r]
                  (doto (Thread. r "mq-publish-buffer-flush")
                    (.setDaemon true)))))]
    (if (compare-and-set! publish-buffer-executor nil exec)
      (do (.scheduleAtFixedRate exec ^Runnable safe-flush! 100 100 TimeUnit/MILLISECONDS)
          true)
      (do (.shutdown exec) false))))

(defn stop-publish-buffer-flush!
  "Stops the publish buffer flush thread and force-drains all remaining entries
   (graceful shutdown — buffered messages are flushed regardless of deadline)."
  []
  (when-let [^ScheduledExecutorService exec
             (first (reset-vals! publish-buffer-executor nil))]
    (.shutdownNow exec))
  (flush-publish-buffer! true))
