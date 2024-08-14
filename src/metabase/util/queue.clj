(ns metabase.util.queue
  (:import
   (java.util HashSet Queue Set)
   (java.util.concurrent ArrayBlockingQueue BlockingQueue SynchronousQueue TimeUnit)))

(set! *warn-on-reflection* true)

(defprotocol BoundedTransferQueue
  (maybePut! [queue msg]
    "Put a message on the queue if there is space for it, otherwise drop it.
     Returns whether the item was enqueued.")
  (blockingPut! [queue msg]
    "Put a message on the queue. If necessary, block until there is space for it.")
  (blockingTake! [queue]
    "Take a message off the queue, blocking if necessary."))

;; Similar to java.util.concurrent.LinkedTransferQueue, but bounded.
(deftype ^:private ArrayTransferQueue
  [^ArrayBlockingQueue async-queue
   ^SynchronousQueue sync-queue
   ^long block-ms
   ^long sleep-ms]
  BoundedTransferQueue
  (maybePut! [_ msg]
    (.offer async-queue msg))
  (blockingPut! [_ msg]
    (.offer sync-queue msg Long/MAX_VALUE TimeUnit/DAYS))
  (blockingTake! [_]
    ;; Async messages are given higher priority, as sync messages will never be dropped.
    (or (.poll async-queue)
        (.poll sync-queue block-ms TimeUnit/MILLISECONDS)
        (do (Thread/sleep ^long sleep-ms)
            (recur)))))

;; Similar to ArrayTransferQueue, but drops events that are already in the queue.
(deftype ^:private DeduplicatingArrayTransferQueue
  [^Queue async-queue
   ^BlockingQueue sync-queue
   ^Set queued-set
   ^long block-ms
   ^long sleep-ms]
  BoundedTransferQueue
  (maybePut!
    [_ msg]
    (let [payload (:payload msg msg)]
      ;; we hold the lock while we push to avoid races
      (locking queued-set
        ;; returns null if we have already enqueued the message
        (when (.add queued-set payload)
          (let [accepted? (.offer ^Queue async-queue msg)]
            (when-not accepted?
              (.remove queued-set payload))
            accepted?)))))
  (blockingPut! [_ msg]
   ;; we cannot hold the lock while we push, so there is some chance of a duplicate
    (when (locking queued-set (.add queued-set (:payload msg msg)))
      (.offer sync-queue msg Long/MAX_VALUE TimeUnit/DAYS)))
  (blockingTake! [_]
   ;; we lock here to avoid leaving a blocking entry behind that can never be cleared
    (or (locking queued-set
          (when-let [msg (or (.poll ^Queue async-queue)
                             (.poll sync-queue block-ms TimeUnit/MILLISECONDS))]
            (.remove queued-set (:payload msg msg))
            msg))
        (do (Thread/sleep ^long sleep-ms)
            (recur)))))

(defn bounded-transfer-queue
  "Create a bounded transfer queue, specialized based on the high-level options."
  [capacity & {:keys [block-ms sleep-ms dedupe?]
               :or   {block-ms 100
                      sleep-ms 100
                      dedupe?  false}}]
  (if dedupe?
    (->DeduplicatingArrayTransferQueue (ArrayBlockingQueue. capacity)
                                       (SynchronousQueue.)
                                       (HashSet.)
                                       block-ms
                                       sleep-ms)

    (->ArrayTransferQueue (ArrayBlockingQueue. capacity)
                          (SynchronousQueue.)
                          block-ms
                          sleep-ms)))
