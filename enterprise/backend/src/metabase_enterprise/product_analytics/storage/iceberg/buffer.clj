(ns metabase-enterprise.product-analytics.storage.iceberg.buffer
  "In-memory event buffer with scheduled flush for the Iceberg storage backend.
   Uses a lock-free ConcurrentLinkedQueue with a ScheduledExecutorService for periodic flushing."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.util ArrayList)
   (java.util.concurrent ConcurrentLinkedQueue ScheduledExecutorService ScheduledFuture
                         Executors TimeUnit)
   (java.util.concurrent.atomic AtomicLong)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Buffer -------------------------------------------------------

(defn create-buffer
  "Create a new buffer instance. Returns a map with :queue and :count."
  []
  {:queue (ConcurrentLinkedQueue.)
   :count (AtomicLong. 0)})

(defn offer!
  "Add an item to the buffer. Returns true if added."
  [{:keys [^ConcurrentLinkedQueue queue ^AtomicLong count]} item]
  (let [added (.offer queue item)]
    (when added
      (.incrementAndGet count))
    added))

(defn size
  "Return the current number of items in the buffer."
  ^long [{:keys [^AtomicLong count]}]
  (.get count))

(defn drain!
  "Atomically drain all items from the buffer, returning them as a vector.
   The buffer is empty after this call."
  [{:keys [^ConcurrentLinkedQueue queue ^AtomicLong count]}]
  (let [batch (ArrayList.)]
    (loop []
      (when-let [item (.poll queue)]
        (.add batch item)
        (recur)))
    (let [n (.size batch)]
      (.addAndGet count (- n))
      (vec batch))))

;;; -------------------------------------------- Scheduled flush task ----------------------------------------------

(defn start-flush-task!
  "Start a scheduled flush task that calls `flush-fn` every `interval-seconds`.
   Returns a map with :executor and :future that can be passed to [[stop-flush-task!]]."
  [flush-fn ^long interval-seconds]
  (let [executor ^ScheduledExecutorService (Executors/newSingleThreadScheduledExecutor)
        fut      (.scheduleAtFixedRate executor
                                       ^Runnable (fn []
                                                   (try
                                                     (flush-fn)
                                                     (catch Exception e
                                                       (log/errorf e "Error during scheduled Iceberg flush"))))
                                       interval-seconds
                                       interval-seconds
                                       TimeUnit/SECONDS)]
    {:executor executor
     :future   fut}))

(defn stop-flush-task!
  "Stop a scheduled flush task and perform a final drain.
   Calls `flush-fn` one last time after stopping the scheduler to drain remaining items."
  [{:keys [^ScheduledExecutorService executor ^ScheduledFuture future]} flush-fn]
  (when future
    (.cancel future false))
  (when executor
    (.shutdown executor)
    (when-not (.awaitTermination executor 5 TimeUnit/SECONDS)
      (.shutdownNow executor)))
  ;; Final flush to drain any remaining items
  (try
    (flush-fn)
    (catch Exception e
      (log/errorf e "Error during final Iceberg flush on shutdown"))))
