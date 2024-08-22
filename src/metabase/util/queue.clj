(ns metabase.util.queue
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent ArrayBlockingQueue SynchronousQueue TimeUnit)))

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
    (log/debugf "[query-analysis] put: async queue length: %s" (.size async-queue))
    (log/debugf "[query-analysis] maybe-put! %s %s"
                msg
                (.offer async-queue msg)))
  (blocking-put! [_ timeout msg]
    (log/debugf "[query-analysis] synchronously putting %s" msg)
    (.offer sync-queue msg timeout TimeUnit/MILLISECONDS)
    (log/debugf "[query-analysis] done with sync put %s" msg))
  (blocking-take! [_ timeout]
    (loop [time-remaining timeout]
      (when (pos? time-remaining)
        (log/debugf "[query-analysis] take: async queue length: %s" (.size async-queue))
        ;; Async messages are given higher priority, as sync messages will never be dropped.
        (or (u/prog1 (.poll async-queue)
              (when <>
                (log/debugf "[query-analysis] took %s off the async queue" <>)))
            (u/prog1 (.poll sync-queue block-ms TimeUnit/MILLISECONDS)
              (when <>
                (log/debugf "[query-analysis] took %s off the sync queue" <>)))
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
