(ns metabase.util.queue
  "Functionality for working with queues.

  The main functionality is exposed by:

  - the `create-delay-queue-listener` and `create-array-blocking-queue-listener` functions.

  Both of these functions create and register queue listeners. Registered queue listeners will be started/stopped along with Metabase.

  The delay queue listener allows submitting events with a delay. These events will not be processed until the delay has passed.

  Once started, the queue listener will dispatch incoming messages, in batches, to the handler provided.

  - `put!` and `put-with-delay!`, which allow enqueing items or events to the queue

  - `queue-size` allows getting the current size of the queue

  - `start-listeners!` and `stop-listeners!` start and stop all registered listeners, respectively.
  "
  (:require
   [com.climate.claypoole :as cp]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.queue.protocols :as protocols])
  (:import
   (java.time Duration Instant)
   (java.util.concurrent
    ArrayBlockingQueue
    BlockingQueue
    DelayQueue
    Delayed
    ExecutorService
    TimeUnit)))

(set! *warn-on-reflection* true)

(defrecord DelayValue [value ^Instant ready-at]
  Delayed
  (getDelay [_ unit]
    (.convert unit (- (.toEpochMilli ready-at) (System/currentTimeMillis)) TimeUnit/MILLISECONDS))
  (compareTo [this other]
    (Long/compare (.getDelay this TimeUnit/MILLISECONDS)
                  (.getDelay ^Delayed other TimeUnit/MILLISECONDS))))

(defn- delay-queue
  "Return an unbounded queue that returns each item only after some specified delay."
  ^DelayQueue []
  (DelayQueue.))

(defn- -put-with-delay!
  "Put an item on a delay queue, with a delay given in milliseconds."
  [^DelayQueue queue delay-ms value]
  (.offer queue (->DelayValue value (.plus (Instant/now) (Duration/ofMillis delay-ms)))))

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

(defn- take-batch!
  "Get a batch of messages off the given queue.
  Will wait max-first-ms for the first message to be available, then will collect up to max-message, waiting up to max-next-ms for each additional message, whichever comes first.
  For convenience, if the queue is a DelayQueue, the returned values will be the actual values, not the Delay objects."
  ([^BlockingQueue queue ^long max-first-ms ^long max-batch-messages ^long max-next-ms]
   (when-let [fst (.poll queue max-first-ms TimeUnit/MILLISECONDS)]
     (take-batch* queue max-batch-messages max-next-ms [(if (instance? DelayQueue queue) (:value fst) fst)]))))

(defn- handle-batch! [{:keys [listener-name
                              handler
                              success-handler
                              error-handler]
                       :as ql}
                      pool
                      batch]
  (cp/future pool
             (try
               (let [timer (u/start-timer)
                     output (handler batch)
                     duration (u/since-ms timer)]
                 (log/debugf "Listener %s processed batch in %.0fms" listener-name duration)
                 (success-handler ql output duration listener-name))
               (catch Exception e
                 (error-handler ql e listener-name)
                 (log/errorf e "Error in %s while processing batch" listener-name)))))

(defrecord QueueListener [^BlockingQueue queue
                          state
                          listener-name
                          handler
                          success-handler
                          error-handler
                          max-batch-messages
                          max-next-ms
                          pool-size]
  protocols/IQueueListener
  (-stop [_this]
    (let [{:keys [status executor dispatcher]} @state]
      (when (= status ::running)
        (log/info "Cancelling running queue listener")
        (swap! state assoc :status ::shutting-down)
        (future
          ;; wait for the dispatcher to finish processing the items from the queue
          (log/info "Waiting for dispatcher to finish processing")
          (deref dispatcher)
          ;; shutdown the executor
          (log/info "Gracefully shutting down")
          (cp/shutdown executor)
          (log/info "Executor shutodwn complete")
          (swap! state assoc :status ::shut-down)))))
  (-stop! [this]
    (let [{:keys [executor]} @state]
      (log/warn "Forcibly shutting down")
      (protocols/-stop this)
      (when executor (cp/shutdown! executor))
      (swap! state assoc :status ::shut-down)))
  (-await-termination [_this timeout-ms]
    (if-let [executor ^ExecutorService (:executor @state)]
      (.awaitTermination executor timeout-ms TimeUnit/MILLISECONDS)
      true))
  (-start [this]
    (log/info "Starting threadpool/dispatcher" {:listener-name listener-name})
    (let [executor (cp/threadpool pool-size)]
      (reset! state {:status ::running
                     :executor executor
                     :dispatcher (future
                                   (log/with-context {:listener-name listener-name}
                                     (loop []
                                       (log/trace "Listener waiting for next batch")
                                       (if (protocols/-closed? this)
                                         (do
                                           (log/warn "Listener processing last batches - shutdown")
                                           (while (not (zero? (protocols/queue-size this)))
                                             (when-let [batch (seq (take-batch! queue 0 max-batch-messages 0))]
                                               (handle-batch! this executor batch))))
                                         (if-let [batch (seq (take-batch! queue max-next-ms max-batch-messages max-next-ms))]
                                           (do
                                             (log/info "Listener processing batch" {:batch-size (count batch)
                                                                                    :max-next-ms max-next-ms
                                                                                    :max-batch-messages max-batch-messages})
                                             (log/trace "Listener processing batch" {:batch batch})
                                             (handle-batch! this executor batch)
                                             (recur))
                                           (do
                                             (log/trace "No items to process")
                                             (Thread/sleep 100)
                                             (recur)))))))})))
  (-closed? [_this]
    (not (contains? #{::running ::initialized}
                    (get @state :status))))
  (queue-size [_this] (.size queue)))

(defrecord DelayQueueListener [ql]
  protocols/IDelayQueuePutter
  (put-with-delay! [_this delay-ms item]
    (when (protocols/-closed? ql)
      (throw (ex-info "Queue listener is closed, no items may be added." {})))
    (-put-with-delay! (:queue ql) delay-ms item))
  protocols/IQueuePutter
  (put! [this item]
    (protocols/put-with-delay! this 0 item))
  protocols/IQueueListener
  (-start [_this] (protocols/-start ql))
  (-stop [_this] (protocols/-stop ql))
  (-stop! [_this] (protocols/-stop! ql))
  (-closed? [_this] (protocols/-closed? ql))
  (-await-termination [_this timeout-ms] (protocols/-await-termination ql timeout-ms))
  (queue-size [_this] (protocols/queue-size ql)))

(defrecord BlockingQueueListener [ql]
  protocols/IQueuePutter
  (put! [_this item]
    (.offer ^BlockingQueue (:queue ql) item))
  protocols/IQueueListener
  (-start [_this] (protocols/-start ql))
  (-stop [_this] (protocols/-stop ql))
  (-stop! [_this] (protocols/-stop! ql))
  (-closed? [_this] (protocols/-closed? ql))
  (-await-termination [_this timeout-ms] (protocols/-await-termination ql timeout-ms))
  (queue-size [_this] (protocols/queue-size ql)))

(defonce
  ^:private
  ^{:malli/schema [:map-of :string #(satisfies? protocols/IQueueListener %)]}
  listeners (atom {}))

(defn- listener-exists?
  "Returns true if there is a running listener with the given name"
  [listener-name]
  (contains? @listeners listener-name))

(mu/defn- stop-listening!
  "Stops the listener previously started with (listen!).
  If there is no running listener with the given name, it is a no-op"
  [listener-name :- :string]
  (log/with-context {:listener-name listener-name}
    (if-let [ql (get @listeners listener-name)]
      (do
        (log/info "Shutting down...")
        (protocols/-stop ql)
        (if (protocols/-await-termination ql 9000)
          (log/info "Finished graceful shutdown")
          (do
            (protocols/-stop! ql)
            (if (protocols/-await-termination ql 1000)
              (log/warn "Threadpool terminated by cancelling running tasks")
              (log/error "Unable to terminate")))))
      (log/info "No running listener"))))

(mu/defn- create-queue-listener
  [{:keys [listener-name
           queue
           handler
           success-handler
           error-handler
           pool-size
           max-batch-messages
           max-next-ms
           register?]
    :as args
    :or {success-handler (constantly nil)
         error-handler (constantly nil)
         pool-size 1
         max-batch-messages 50
         max-next-ms 100
         register? true}}]
  (log/with-context {:listener listener-name}
    (if (listener-exists? listener-name)
      (do
        (log/warn "Listener exists")
        (get @listeners listener-name))
      (let [inner-ql (map->QueueListener {:queue queue
                                          :pool-size pool-size
                                          :state (atom {:status ::initialized})
                                          :listener-name listener-name
                                          :handler handler
                                          :success-handler success-handler
                                          :error-handler error-handler
                                          :max-batch-messages max-batch-messages
                                          :max-next-ms max-next-ms})
            ql (if (instance? DelayQueue queue)
                 (->DelayQueueListener inner-ql)
                 (->BlockingQueueListener inner-ql))]
        (when register? (swap! listeners assoc listener-name ql))
        ql))))

(mr/def ::listener-options
  :any
  #_[:map
   ;; hook for when we successfully handle a batch
     [:success-handler {:optional true} [:=> [:cat #(satisfies? protocols/IQueueListener %)
                                              :any
                                              :double
                                              :string]
                                         :any]
    ;; hook for when an error occurs while processing a batch
      :error-handler {:optional true} [:=> [:cat
                                            #(satisfies? protocols/IQueueListener %)
                                            [:fn (ms/InstanceOfClass Throwable) :string]]
                                       :any]
    ;; the number of threads that should process batches
      :pool-size {:optional true} [:or number? #(= :serial %)]
    ;; the name of the listener. Used for registration and logging.
      :listener-name string?
    ;; if `true`, we will register this listener globally such that it will be started/shut down with metabase
      :register? {:optional true} boolean?
    ;; the maximum number of messages that can be processed at once by the handler
      :max-batch-messages {:optional true} number?
    ;; how long should we wait after receiving one message for the rest of a batch?
      :max-next-ms {:optional true} number?]])

(mu/defn create-delay-queue-listener
  "Creates and optional registers a queue and (optionally) multithreaded listeners on the queue.
  See `::listener-options` for details on what options may be passed."
  [listener-name :- :string
   handler :- [:=> [:cat [:sequential :any]] :any]
   args :- ::listener-options]
  (create-queue-listener (assoc args :handler handler :queue (delay-queue) :listener-name listener-name)))

(mu/defn create-array-blocking-queue-listener
  "Creates and optionally registers a queue and (optionally) multithreaded listeners on the queue.
  See `::listener-options` for details on what options may be passed."
  [listener-name :- :string
   handler :- [:=> [:cat [:sequential :any]] :any]
   {:keys [queue-size] :as args} :- [:and
                                     ::listener-options
                                     [:map
                                      [:queue-size pos-int?]]]]
  (create-queue-listener (assoc args :handler handler :queue (ArrayBlockingQueue. queue-size) :listener-name listener-name)))

(defn start-listeners!
  "Call all implementations of `init-listener!`. Called by metabase.core/init!"
  []
  (doseq [[listener-name queue-listener] @listeners]
    (try (protocols/-start queue-listener)
         (catch Throwable e
           (log/errorf e "Error initializing listener %s" listener-name)))))

(defn stop-listeners!
  "Stops all running listeners"
  []
  (doseq [[name _] @listeners]
    (stop-listening! name)))

(defn put! [ql item]
  (protocols/put! ql item))

(defn put-with-delay! [ql delay-ms item]
  (protocols/put-with-delay! ql delay-ms item))

(defn queue-size [ql]
  (protocols/queue-size ql))
