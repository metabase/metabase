(ns metabase.mq.queue.impl
  "Internal implementation for the queue system: listener registration, batching, and public API."
  (:require
   [metabase.analytics.prometheus :as analytics]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.util.concurrent Executors ScheduledExecutorService TimeUnit ThreadFactory)))

;; log is used by the with-queue macro expansion
(comment log/keep-me)

(set! *warn-on-reflection* true)

(mr/def :metabase.mq.queue/queue-name
  [:and :keyword [:fn {:error/message "Queue name must be namespaced to 'queue'"}
                  #(= "queue" (namespace %))]])

(def ^:dynamic *handlers*
  "Atom containing a map of queue-name → {:handler fn :max-batch-messages int :max-next-ms int}.
  Backend-agnostic."
  (atom {}))

(def ^:dynamic *accumulators*
  "Per-queue accumulation state for cross-bundle batching.
  queue-name → {:bundle-ids [...] :messages [...] :deadline-ms long
                :bundle-backends {bundle-id backend-key}}"
  (atom {}))

;;; ------------------------------------------- Message handling -------------------------------------------

(mu/defn handle!
  "Handles messages from one or more bundles by invoking the registered handler.
  For max-batch-messages=1 (listen!), calls handler with each message individually.
  For max-batch-messages>1 (batch-listen!), partitions messages and calls handler with each batch vec.
  On success, marks all bundles as successful. On failure, marks all as failed.
  `bundle-backends` is a map of bundle-id → backend-key, so each bundle is acked/nacked on the
  correct backend even when backends are swapped at runtime."
  [bundle-backends :- [:map-of :any ::q.backend/backend]
   queue-name :- :metabase.mq.queue/queue-name
   bundle-ids :- [:sequential :any]
   messages :- [:sequential :any]]
  (let [{:keys [handler max-batch-messages]} (get @*handlers* queue-name)
        start (System/nanoTime)]
    (try
      (when-not handler
        (throw (ex-info "No handler defined for queue" {:queue queue-name})))
      (if (= 1 max-batch-messages)
        (doseq [msg messages]
          (handler msg))
        (doseq [batch (partition-all max-batch-messages messages)]
          (handler (vec batch))))
      (log/debug "Handled queue messages" {:queue queue-name :bundle-ids bundle-ids :count (count messages)})
      (run! (fn [bid] (q.backend/bundle-successful! (get bundle-backends bid) queue-name bid)) bundle-ids)
      (analytics/inc! :metabase-mq/queue-bundles-handled {:queue (name queue-name) :status "success"})
      (catch Exception e
        (log/error e "Error handling queue message" {:queue queue-name :bundle-ids bundle-ids})
        (run! (fn [bid] (q.backend/bundle-failed! (get bundle-backends bid) queue-name bid)) bundle-ids)
        (analytics/inc! :metabase-mq/queue-bundles-handled {:queue (name queue-name) :status "error"}))
      (finally
        (analytics/observe! :metabase-mq/queue-handle-duration-ms
                            {:queue (name queue-name)}
                            (/ (double (- (System/nanoTime) start)) 1e6))))))

;;; ------------------------------------------- Batching / accumulation -------------------------------------------

(mu/defn deliver-bundle!
  "Called by backends when they have a bundle ready. For max-batch-messages=1,
  calls handle! immediately. For max-batch-messages>1, accumulates and flushes
  when the batch is full."
  [backend :- ::q.backend/backend
   queue-name :- :metabase.mq.queue/queue-name
   bundle-id :- :any
   messages :- [:sequential :any]]
  (let [{:keys [max-batch-messages max-next-ms]
         :or   {max-batch-messages 1 max-next-ms 0}} (get @*handlers* queue-name)]
    (if (= 1 max-batch-messages)
      (handle! {bundle-id backend} queue-name [bundle-id] messages)
      (let [drained (atom nil)]
        (swap! *accumulators*
               (fn [accs]
                 (let [acc (-> (or (get accs queue-name)
                                   {:bundle-ids [] :messages [] :deadline-ms 0 :bundle-backends {}})
                               (update :bundle-ids conj bundle-id)
                               (update :messages into messages)
                               (update :bundle-backends assoc bundle-id backend)
                               (cond->
                                (zero? (:deadline-ms (get accs queue-name {:deadline-ms 0})))
                                 (assoc :deadline-ms (+ (System/currentTimeMillis) max-next-ms))))]
                   (if (>= (count (:messages acc)) max-batch-messages)
                     (do (reset! drained acc)
                         (dissoc accs queue-name))
                     (assoc accs queue-name acc)))))
        (when-let [{:keys [bundle-ids bundle-backends messages]} @drained]
          (handle! bundle-backends queue-name bundle-ids messages))))))

(mu/defn flush-pending!
  "Flushes any accumulated batch for the given queue whose deadline has passed.
  Backend info comes from the drained accumulator's `:bundle-backends`."
  [queue-name :- :metabase.mq.queue/queue-name]
  (let [drained (atom nil)]
    (swap! *accumulators*
           (fn [accs]
             (if-let [{:keys [deadline-ms] :as acc} (get accs queue-name)]
               (if (and (pos? deadline-ms)
                        (>= (System/currentTimeMillis) deadline-ms))
                 (do (reset! drained acc)
                     (dissoc accs queue-name))
                 accs)
               accs)))
    (when-let [{:keys [bundle-ids bundle-backends messages]} @drained]
      (when (seq messages)
        (handle! bundle-backends queue-name bundle-ids messages)))))

;;; ------------------------------------------- Background message manager---------------------------------------

(defonce ^:private flush-executor (atom nil))

(defn- flush-all-pending!
  "Iterates all keys in *accumulators* and flushes any whose deadline has passed."
  []
  (doseq [queue-name (keys @*accumulators*)]
    (try
      (flush-pending! queue-name)
      (catch Exception e
        (log/error e "Error flushing pending batch" {:queue queue-name})))))

(defn start-message-manager!
  "Starts a background thread that drains expired accumulators every ~100ms."
  []
  (let [exec (Executors/newSingleThreadScheduledExecutor
              (reify ThreadFactory
                (newThread [_ r]
                  (doto (Thread. r "mq-message-manager")
                    (.setDaemon true)))))]
    (if (compare-and-set! flush-executor nil exec)
      (.scheduleAtFixedRate exec ^Runnable flush-all-pending! 100 100 TimeUnit/MILLISECONDS)
      (.shutdown exec))))

(defn stop-message-manager!
  "Stops the background message-manager thread."
  []
  (when-let [^ScheduledExecutorService exec (first (reset-vals! flush-executor nil))]
    (.shutdownNow exec)))

;;; ------------------------------------------- Listener registration -------------------------------------------

(mu/defn listen!
  "Registers a handler function for the given queue and starts listening.
  The handler will be called with a single message at a time.
  Throws if the queue name is invalid or if a handler is already registered."
  [queue-name :- :metabase.mq.queue/queue-name
   handler :- fn?]
  (when (get @*handlers* queue-name)
    (throw (ex-info "Queue handler already defined" {:queue queue-name})))
  (swap! *handlers* assoc queue-name
         {:handler handler
          :max-batch-messages 1
          :max-next-ms 0})
  (q.backend/listen! q.backend/*backend* queue-name))

(mu/defn batch-listen!
  "Registers a batch handler function for the given queue and starts listening.
  The handler will be called with a vec of messages, sized up to :max-batch-messages.
  Batches can span multiple backend bundles, waiting up to :max-next-ms for additional bundles.
  Throws if a handler is already registered."
  [queue-name :- :metabase.mq.queue/queue-name
   handler :- fn?
   config :- [:map [:max-batch-messages pos-int?] [:max-next-ms nat-int?]]]
  (when (get @*handlers* queue-name)
    (throw (ex-info "Queue handler already defined" {:queue queue-name})))
  (swap! *handlers* assoc queue-name
         (merge config {:handler handler}))
  (q.backend/listen! q.backend/*backend* queue-name))

(mu/defn stop-listening!
  "Stops listening to the given queue and closes it."
  [queue-name :- :metabase.mq.queue/queue-name]
  (q.backend/stop-listening! q.backend/*backend* queue-name))

(defmacro with-queue
  "Runs the body with the ability to add messages to the given queue.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown.

  NOTE: Publishing is best-effort and not transactional with the application database.
  If the caller's DB transaction commits but `publish!` subsequently fails, the queue
  message will be lost. Callers that need stronger guarantees should publish within
  the same DB transaction or use an idempotent retry strategy."
  [queue-name [queue-binding] & body]
  `(let [buffer# (atom [])
         ~queue-binding (reify mq.impl/MessageBuffer
                          (put [_ msg#] (swap! buffer# conj msg#)))]
     (try
       (let [result# (do ~@body)]
         (let [msgs# @buffer#]
           (when (seq msgs#)
             (q.backend/publish! q.backend/*backend* ~queue-name msgs#)
             (analytics/inc! :metabase-mq/queue-messages-published
                             {:queue (name ~queue-name)}
                             (count msgs#))))
         result#)
       (catch Exception e#
         (log/error e# "Error in queue processing, no messages will be persisted to the queue")
         (throw e#)))))

(mu/defn queue-length :- :int
  "The number of message *bundles* in the queue."
  [queue-name :- :metabase.mq.queue/queue-name]
  (q.backend/queue-length q.backend/*backend* queue-name))
