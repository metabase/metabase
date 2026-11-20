(ns metabase.util.queue
  "Queues: a custom BoundedTransferQueue, a delay queue, and taking batches off a queue.

  The BoundedTransferQueue allows for callers to decide whether to block the previous synchronous put to complete
  before adding another message, or attempt to add it to a fixed-sized async queue if there is space.
  See `bounded-transfer-queue` for more details.

  Listeners that process a queue in batches are in `metabase.queue-listener.core`."
  (:import
   (java.time Duration Instant)
   (java.util.concurrent
    ArrayBlockingQueue
    BlockingQueue
    DelayQueue
    Delayed
    SynchronousQueue
    TimeUnit)
   (java.util.concurrent.atomic AtomicLong)))

(set! *warn-on-reflection* true)

(defprotocol BoundedTransferQueue
  (maybe-put! [queue msg]
    "Put a message on the queue if there is space for it, otherwise drop it.
     Returns whether the item was enqueued.")
  (blocking-put! [queue timeout msg]
    "Put a message on the queue. If necessary, block until there is space for it.")
  (blocking-take! [queue timeout]
    "Take a message off the queue, blocking if necessary.")
  (clear! [queue]
    "Discard all messages on the given queue."))

;; Similar to java.util.concurrent.LinkedTransferQueue, but bounded.
(deftype ^:private ArrayTransferQueue [^ArrayBlockingQueue async-queue
                                       ^SynchronousQueue sync-queue
                                       ^long block-ms
                                       ^long sleep-ms]
  BoundedTransferQueue
  (maybe-put! [_ msg]
    (.offer async-queue msg))
  (blocking-put! [_ timeout msg]
    (.offer sync-queue msg timeout TimeUnit/MILLISECONDS))
  (blocking-take! [_ timeout]
    (loop [time-remaining timeout]
      (when (pos? time-remaining)
        ;; Async messages are given higher priority, as sync messages will never be dropped.
        (or (.poll async-queue)
            (.poll sync-queue block-ms TimeUnit/MILLISECONDS)
            (do (Thread/sleep ^long sleep-ms)
                ;; This is an underestimate, as the thread may have taken a while to wake up. That's OK.
                (recur (- time-remaining block-ms sleep-ms)))))))
  (clear! [_]
    (.clear sync-queue)
    (.clear async-queue)))

(defn bounded-transfer-queue
  "Create a bounded transfer queue, specialized based on the high-level options."
  [capacity & {:keys [block-ms sleep-ms]
               :or   {block-ms 100
                      sleep-ms 100}}]
  (->ArrayTransferQueue (ArrayBlockingQueue. capacity)
                        (SynchronousQueue.)
                        block-ms
                        sleep-ms))

(defonce ^{:private true, :tag AtomicLong} delay-sequence (AtomicLong.))

(defrecord DelayValue [value ^Instant ready-at ^long order]
  Delayed
  (getDelay [_ unit]
    (.convert unit (- (.toEpochMilli ready-at) (System/currentTimeMillis)) TimeUnit/MILLISECONDS))
  (compareTo [_ other]
    (let [^DelayValue other other
          ready-order       (Long/compare (.toEpochMilli ready-at) (.toEpochMilli ^Instant (.-ready-at other)))]
      (if (zero? ready-order)
        (Long/compare order (.-order other))
        ready-order))))

(defn delay-queue
  "Return an unbounded queue that returns each item only after some specified delay."
  ^DelayQueue []
  (DelayQueue.))

(defn put-with-delay!
  "Put an item on a delay queue, with a delay given in milliseconds."
  [^DelayQueue queue delay-ms value]
  (.offer queue (->DelayValue value
                              (.plus (Instant/now) (Duration/ofMillis delay-ms))
                              (.incrementAndGet delay-sequence))))

(defn- take-batch* [^BlockingQueue queue ^long max-messages ^long poll-ms acc]
  (loop [acc acc]
    (if (>= (count acc) max-messages)
      acc
      (if-let [item (if (pos? poll-ms)
                      (.poll queue poll-ms TimeUnit/MILLISECONDS)
                      (.poll queue))]
        (recur (conj acc (if (instance? DelayQueue queue)
                           (:value item)
                           item)))
        (not-empty acc)))))

(defn take-batch!
  "Get a batch of messages off the given queue.
  Will wait max-first-ms for the first message to be available, then will collect up to max-message, waiting up to max-next-ms for each additional message, whichever comes first.
  For convenience, if the queue is a DelayQueue, the returned values will be the actual values, not the Delay objects."
  ([^BlockingQueue queue ^long max-first-ms ^long max-batch-messages ^long max-next-ms]
   (when-let [fst (.poll queue max-first-ms TimeUnit/MILLISECONDS)]
     (take-batch* queue max-batch-messages max-next-ms [(if (instance? DelayQueue queue) (:value fst) fst)]))))
