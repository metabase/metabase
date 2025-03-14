(ns metabase.util.queue
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.time Duration Instant)
   (java.util.concurrent ArrayBlockingQueue BlockingQueue DelayQueue Delayed ExecutorService Executors SynchronousQueue TimeUnit)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

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
  ^BlockingQueue []
  (DelayQueue.))

(defn put-with-delay!
  "Put an item on the delay queue, with a delay given in milliseconds."
  [^BlockingQueue queue delay-ms value]
  (.offer queue (->DelayValue value (.plus (Instant/now) (Duration/ofMillis delay-ms)))))

(defn- take-delayed-batch* [^BlockingQueue queue max-items ^long poll-ms acc]
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
  ([^BlockingQueue queue max-items ^long max-first-ms ^long max-next-ms]
   (when-let [fst (.poll queue max-first-ms TimeUnit/MILLISECONDS)]
     (take-delayed-batch* queue max-items max-next-ms [(:value fst)]))))

(defonce ^:private listeners (atom {}))

(mr/def ::listener-options [:map [:result-handler {:optional true} [:=> [:cat :any :int :string] :any]
                                  :err-handler {:optional true} [:=> [:cat [:fn (ms/InstanceOfClass Throwable)]] :any]
                                  :finally-handler {:optional true} [:=> [:cat] :any]
                                  :pool-size {:optional true} number?
                                  :max-batch-items {:optional true} number?
                                  :max-next-ms {:optional true} number?]])

(mu/defn- listener-thread [listener-name :- :string
                           queue :- (ms/InstanceOfClass BlockingQueue)
                           handler :- [:=> [:cat [:sequential :any]] :any]
                           {:keys [result-handler err-handler finally-handler max-batch-items max-next-ms]} :- ::listener-options]
  (log/infof "Listener %s started" listener-name)
  (while true
    (try
      (let [batch (take-delayed-batch! queue max-batch-items Long/MAX_VALUE max-next-ms)]
        (when (seq batch)
          (log/debugf "Listener %s processing batch: %s" listener-name batch)
          (let [timer (u/start-timer)
                output (handler batch)]
            (result-handler output (u/since-ms timer) listener-name))))
      (catch InterruptedException e
        (log/infof "Listener %s interrupted" listener-name)
        (throw e))
      (catch Exception e
        (err-handler e)
        (log/errorf e "Error in %s while processing batch" listener-name))
      (finally (finally-handler))))
  (log/infof "Listener %s stopped" listener-name))

(mu/defn listen!
  "Starts an async listener on the given queue.

  Arguments:
  - listener-name: A unique string. Calls to register another listener with the same name will be a no-op
  - queue: The queue to listen on
  - handler: A function taking a list of 1 or more values that have been sent to the queue.

  Options:
  - result-handler: A function called when handler does not throw an exception. Accepts [result-of-handler, duration-in-ms, listener-name]
  - err-handler: A function called when the handler throws an exception. Accepts [exception]
  - finally-handler: A no-arg function called after result-handler or err-handler regardless of the handler response.
  - pool-size: Number of threads in the listener. Default: 1
  - max-batch-items: Max number of items to batch up before calling handler. Default 50
  - max-next-ms: Max number of ms to let queued items collect before calling the handler. Default 100"
  [listener-name :- :string
   queue :- (ms/InstanceOfClass BlockingQueue)
   handler :- [:=> [:cat [:sequential :any]] :any]
   {:keys [result-handler
           err-handler
           finally-handler
           pool-size
           max-batch-items
           max-next-ms]
    :or   {result-handler
           (fn [_ duration passed-name] (log/debugf "Listener %s processed batch in %dms" passed-name duration))

           err-handler
           (fn [_] nil)

           finally-handler (fn [] nil)
           pool-size       1
           max-batch-items 50
           max-next-ms     100}} :- ::listener-options]
  (if (contains? @listeners listener-name)
    (log/errorf "Listener %s already exists" listener-name)

    (let [executor (Executors/newFixedThreadPool
                    pool-size
                    (.build
                     (doto (BasicThreadFactory$Builder.)
                       (.namingPattern (str "queue-" listener-name "-%d"))
                       (.daemon true))))]
      (.addShutdownHook
       (Runtime/getRuntime)
       (Thread. ^Runnable (fn []
                            (.shutdownNow ^ExecutorService executor)
                            (try
                              (.awaitTermination ^ExecutorService executor 30 TimeUnit/SECONDS)
                              (catch InterruptedException _
                                (log/warn (str "Interrupted while waiting for " listener-name "executor to terminate")))))))

      (dotimes [_ pool-size]
        (.submit ^ExecutorService executor ^Callable #(listener-thread listener-name queue handler
                                                                       {:result-handler  result-handler
                                                                        :err-handler     err-handler
                                                                        :finally-handler finally-handler
                                                                        :max-batch-items max-batch-items
                                                                        :max-next-ms     max-next-ms})))

      (swap! listeners assoc listener-name executor))))

(mu/defn stop-listening!
  "Stops the listener previously started with (listen!).
  If there is no running listener with the given name, it is a no-op"
  [listener-name :- :string]
  (if-let [executor (get @listeners listener-name)]
    (do
      (log/infof "Stopping listener %s..." listener-name)
      (.shutdownNow ^ExecutorService executor)
      (.awaitTermination ^ExecutorService executor 30 TimeUnit/SECONDS)

      (swap! listeners dissoc listener-name)
      (log/infof "Stopping listener %s...done" listener-name))
    (log/infof "No running listener named %s" listener-name)))
