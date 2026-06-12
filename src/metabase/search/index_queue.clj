(ns metabase.search.index-queue
  "Owns the asynchronous search-index ingestion queue: the backing queue, the listener
   lifecycle, and in-flight message accounting so that idleness can be detected precisely.

   Two implementations mirror the [[metabase.search.appdb.index-state]] pattern:
     [[AsyncIngestionQueue]] — production; a DelayQueue drained by a background listener.
     [[SyncIngestionQueue]]  — alternative/test wiring; runs the handler inline on the
                               calling thread, so it is always idle.

   In-flight accounting: a message counts as pending from the moment it is enqueued until
   the batch that contains it finishes processing. `pending` is therefore (queued + being
   processed) with no gap, so [[idle?]] is exact — unlike polling the raw queue size, which
   reads zero in the window after the listener dequeues a batch but before it has finished
   writing it to the index."
  (:require
   [metabase.util.log :as log]
   [metabase.util.queue :as queue])
  (:import
   (java.util.concurrent DelayQueue)
   (java.util.concurrent.atomic AtomicLong)))

(set! *warn-on-reflection* true)

(defprotocol IngestionQueue
  (enqueue! [q updates]
    "Submit a sequence of updates for asynchronous processing. Returns true.")
  (pending-count [q]
    "Number of messages enqueued but not yet fully processed (queued + in-flight).")
  (await-idle! [q opts]
    "Block until the queue is idle, or until `:timeout-ms` (default 30000) elapses.
     Returns true if idle, false on timeout.")
  (clear! [q]
    "Discard all not-yet-taken messages and reset accounting. Intended for test/restore
     reset when the system is quiescent.")
  (running? [q]
    "True if the queue is actively processing (listener running; always true for the sync impl).")
  (start! [q]
    "Begin asynchronous processing. Logs and no-ops if already running.")
  (stop! [q]
    "Stop asynchronous processing. No-op for the sync impl."))

(defn idle?
  "True when the queue has no pending work."
  [q]
  (zero? (pending-count q)))

(defn- wrap-handler
  "Wrap the user handler so that finishing a batch decrements the in-flight counter and
   refreshes the size gauge, even if the handler throws."
  [handler ^AtomicLong pending ^DelayQueue queue gauge-fn]
  (fn [batch]
    (try
      (handler batch)
      (finally
        (.addAndGet pending (- (count batch)))
        (when gauge-fn (gauge-fn (.size queue)))))))

(defrecord AsyncIngestionQueue [^DelayQueue queue
                                ^AtomicLong pending
                                ^long delay-ms
                                listener-name
                                handler
                                listener-opts
                                gauge-fn]
  IngestionQueue
  (enqueue! [_ updates]
    (doseq [u updates]
      (.incrementAndGet pending)
      (queue/put-with-delay! queue delay-ms u))
    (when gauge-fn (gauge-fn (.size queue)))
    true)

  (pending-count [_]
    ;; The counter is bumped on enqueue and decremented only once a batch finishes processing,
    ;; so it spans the gap between dequeue and index write that a raw `.size` read misses.
    (max 0 (.get pending)))

  (await-idle! [this {:keys [timeout-ms poll-ms] :or {timeout-ms 30000 poll-ms 25}}]
    (let [deadline (+ (System/nanoTime) (* (long timeout-ms) 1000000))]
      (loop []
        (cond
          (idle? this)                      true
          (>= (System/nanoTime) deadline)   (do (log/warnf "await-idle! timed out with %d messages still pending"
                                                           (pending-count this))
                                                false)
          :else                             (do (Thread/sleep (long poll-ms)) (recur))))))

  (clear! [_]
    (.clear queue)
    (.set pending 0)
    (when gauge-fn (gauge-fn 0)))

  (running? [_]
    (queue/listener-exists? listener-name))

  (start! [this]
    (queue/listen! listener-name queue (wrap-handler handler pending queue gauge-fn) listener-opts)
    this)

  (stop! [this]
    (queue/stop-listening! listener-name)
    this))

(defrecord SyncIngestionQueue [handler]
  IngestionQueue
  (enqueue! [_ updates] (handler updates) true)
  (pending-count [_] 0)
  (await-idle! [_ _opts] true)
  (clear! [_] nil)
  (running? [_] true)
  (start! [this] this)
  (stop! [this] this))

(defn async-queue
  "Create a production async ingestion queue.

   Options:
   - :delay-ms       delay applied to each message before it becomes takeable (commit-settle window)
   - :listener-name  unique listener name
   - :handler        fn of a batch (sequence of messages) that performs the indexing
   - :listener-opts  options passed to [[metabase.util.queue/listen!]] (success/err handlers, batching)
   - :gauge-fn       optional fn of a number, called with the queue size to update a metric"
  [{:keys [delay-ms listener-name handler listener-opts gauge-fn]}]
  (->AsyncIngestionQueue (queue/delay-queue)
                         (AtomicLong. 0)
                         (long delay-ms)
                         listener-name
                         handler
                         (or listener-opts {})
                         gauge-fn))

(defn sync-queue
  "Create an ingestion queue that processes inline on the calling thread (no listener)."
  [handler]
  (->SyncIngestionQueue handler))
