(ns metabase.util.queue
  (:import
   (java.time Duration Instant)
   (java.util.concurrent ArrayBlockingQueue DelayQueue Delayed SynchronousQueue TimeUnit)))

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

(defrecord DelayValue [value ^Instant ready-at]
  Delayed
  (getDelay [_ unit]
    (.convert unit (- (.toEpochMilli ready-at) (System/currentTimeMillis)) TimeUnit/MILLISECONDS))
  (compareTo [this other]
    (Long/compare (.getDelay this TimeUnit/MILLISECONDS)
                  (.getDelay ^Delayed other TimeUnit/MILLISECONDS))))

(defn delay-queue
  "Return an unbounded queue that returns each item only after some specified delay."
  ^DelayQueue []
  (DelayQueue.))

(defn put-with-delay!
  "Put an item on the delay queue, with a delay given in milliseconds."
  [^DelayQueue queue delay-ms value]
  (.offer queue (->DelayValue value (.plus (Instant/now) (Duration/ofMillis delay-ms)))))

(defn- take-delayed-batch* [^DelayQueue queue max-items ^long poll-ms acc]
  (loop [acc acc]
    (if (>= (count acc) max-items)
      acc
      (if-let [item (if (pos? poll-ms)
                      (.poll queue poll-ms TimeUnit/MILLISECONDS)
                      (.poll queue))]
        (recur (conj acc (:value item)))
        (not-empty acc)))))

(defn take-delayed-batch!
  "Get up to `max-items` of the ready items off a given delay queue."
  ([queue max-items]
   (take-delayed-batch* queue max-items 0 []))
  ([^DelayQueue queue max-items ^long max-first-ms ^long max-next-ms]
   (if-let [fst (.poll queue max-first-ms TimeUnit/MILLISECONDS)]
     (take-delayed-batch* queue max-items max-next-ms [(:value fst)])
     nil)))
