(ns metabase.util.queue
  "Functionality for working with queues.
   There are two main blocks of functionality: a custom BoundedTransferQueue and a queue listener.

  The BoundedTransferQueue allows for callers to decide whether to block the previous synchronous put to complete
  before adding another message, or attempt to add it to a fixed-sized async queue if there is space.
  See `bounded-transfer-queue` for more details.

  The queue listener allows the creation and management of (possibly) multithreaded queue listeners that can
  process messages off the queue in batches.
  Listeners should generally be managed with `init-listener! which calls `listen!`.
  "
  (:require
   [com.climate.claypoole :as cp]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.time Duration Instant)
   (java.util.concurrent ArrayBlockingQueue BlockingQueue DelayQueue Delayed ScheduledExecutorService SynchronousQueue TimeUnit)))

(set! *warn-on-reflection* true)

(defprotocol BatchedQueue
  (process-batch! [this handler]))

(deftype BatchedBlockingQueue [^BlockingQueue queue ^long max-first-ms ^long max-batch-messages ^long max-next-ms]
  BatchedQueue
  (process-batch! [_ handler]
    (letfn [(poll [poll-ms]
              (let [item (.poll queue poll-ms TimeUnit/MILLISECONDS)]
                (if (instance? DelayQueue queue)
                  (:value item)
                  item)))

            (take-batch* [acc]
              (loop [acc acc]
                (if (>= (count acc) max-batch-messages)
                  acc
                  (if-let [item (poll max-next-ms)]
                    (recur (conj acc item))
                    (not-empty acc)))))]
      (if-let [fst (poll max-first-ms)]
        (let [batch (take-batch* [fst])]
          (log/debugf "Processing batch of %d" (count batch))
          (log/tracef "Processing batch: %s" batch)
          [(handler batch) (count batch)])
        (do
          (log/debugf "No items in queue after %dms" max-first-ms)
          [nil 0])))))

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
  "Put an item on a delay queue, with a delay given in milliseconds."
  [^DelayQueue queue delay-ms value]
  (.offer queue (->DelayValue value (.plus (Instant/now) (Duration/ofMillis delay-ms)))))

(mr/def ::listener-options [:map [:success-handler {:optional true} [:=> [:cat :any :double :string] :any]
                                  :err-handler {:optional true} [:=> [:cat [:fn (ms/InstanceOfClass Throwable) :string]] :any]
                                  :pool-size {:optional true} number?]])

(defonce ^:private ^{:malli/schema [:map-of :string (ms/InstanceOfClass ScheduledExecutorService)]} listeners (atom {}))

(defn listener-exists?
  "Returns true if there is a running listener with the given name"
  [listener-name]
  (contains? @listeners listener-name))

(defn- interrupted-exception?
  "If Throwable `e` is an InterruptedException or one of its causes is."
  [e]
  (or (instance? InterruptedException e)
      (some-> (ex-cause e) interrupted-exception?)))

(mu/defn- listener-thread [listener-name :- :string
                           queue :- [:fn #(satisfies? BatchedQueue %)]
                           handler :- [:=> [:cat [:sequential :any]] :any]
                           {:keys [success-handler err-handler]} :- ::listener-options]
  (log/debugf "Thread for listener %s started" listener-name)
  (let [run (volatile! true)]
    (while @run
      (try
        (log/debugf "Listener %s waiting for next batch..." listener-name)
        (let [timer (u/start-timer)
              [output batch-size] (process-batch! queue handler)
              duration (u/since-ms timer)]
          (when (< 0 batch-size)
            (do
              (log/debugf "Listener %s processed batch of %d in %.0fms" listener-name batch-size duration)
              (let [success-timer (u/start-timer)]
                (success-handler output duration listener-name)
                (log/debugf "Listener %s success handler ran in %.0fms" listener-name (u/since-ms success-timer))))))
        (catch Exception e
          (if (interrupted-exception? e)
            (do (log/debugf "Listener thread %s stopped" listener-name)
                (vreset! run false))
            (do
              (err-handler e listener-name)
              (log/errorf e "Error in %s while processing batch" listener-name))))))
    (log/infof "Listener %s stopped" listener-name)))

(mu/defn listen!
  "Starts an async listener on the given queue. This should generally be called from `init-listener!` in a task namespace.

  Arguments:
  - listener-name: A unique string. Calls to register another listener with the same name will be a no-op
  - queue: The queue to listen on
  - handler: A function taking a list of 1 or more values that have been sent to the queue.

  Options:
  - success-handler: A function called when handler does not throw an exception. Accepts [result-of-handler, duration-in-ms, listener-name]
  - err-handler: A function called when the handler throws an exception. Accepts [exception, duration-in-ms, listener-name]
  - pool-size: Number of threads in the listener. Default: 1"
  [listener-name :- :string
   queue :- [:fn #(satisfies? BatchedQueue %)]
   handler :- [:=> [:cat [:sequential :any]] :any]
   {:keys [success-handler
           err-handler
           pool-size]
    :or   {success-handler (constantly nil)
           err-handler (constantly nil)
           pool-size       1}} :- ::listener-options]
  (if (listener-exists? listener-name)
    (log/errorf "Listener %s already exists" listener-name)

    (let [executor (cp/threadpool pool-size {:name (str "queue-" listener-name)})]
      (log/infof "Starting listener %s with %d threads %s" (u/format-color 'green listener-name) pool-size (u/emoji "\uD83C\uDFA7"))
      (dotimes [_ pool-size]
        (cp/future executor (listener-thread listener-name queue handler
                                             {:success-handler    success-handler
                                              :err-handler        err-handler})))

      (swap! listeners assoc listener-name executor))))

(mu/defn stop-listening!
  "Stops the listener previously started with (listen!).
  If there is no running listener with the given name, it is a no-op"
  [listener-name :- :string]
  (if-let [executor (get @listeners listener-name)]
    (do
      (log/infof "Stopping listener %s..." listener-name)
      (cp/shutdown! executor)

      (swap! listeners dissoc listener-name)
      (log/infof "Stopping listener %s...done" listener-name))
    (log/infof "No running listener named %s" listener-name)))

(defmulti init-listener!
  "Initialize a listener with a given name. All implementations of this method are called once and only
  once when the server is starting up. Task namespaces (`metabase.*.task`) should add new
  implementations of this method to start new listeners they define (i.e., with a call to `queue/listen!`.)

  The dispatch value for this function can be any unique keyword, but by convention is a namespaced keyword version of
  the name of the listener being initialized; for sake of consistency with the listener name itself, the keyword should be left
  CamelCased.

    (defmethod queue/init-listener! ::ExampleListener [_]
      (queue/listen! \"example-listener\" queue handler)"
  {:arglists '([job-name-string])}
  keyword)

(defn start-listeners!
  "Call all implementations of `init-listener!`. Called by metabase.core/init!"
  []
  (doseq [[k f] (methods init-listener!)]
    (try
      (f k)
      (catch Throwable e
        (log/errorf e "Error initializing listener %s" k)))))

(defn stop-listeners!
  "Stops all running listeners"
  []
  (doseq [[name _] @listeners]
    (stop-listening! name)))
