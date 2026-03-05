(ns metabase.mq.queue.impl
  "Internal implementation for the queue system: listener registration, batching, and public API."
  (:require
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

(def ^:dynamic *listeners*
  "Atom containing a map of queue-name → {:listener fn :max-batch-messages int :max-next-ms int}.
  Backend-agnostic."
  (atom {}))

(def ^:dynamic *accumulators*
  "Per-queue accumulation state for cross-bundle batching.
  queue-name → {:messages [...] :deadline-ms long
                :message-bundles {bundle-id backend-key}}"
  (atom {}))

(defn exclusive?
  "Returns true if the given queue name is registered with `:exclusive true`."
  [queue-name]
  (:exclusive (get @*listeners* queue-name)))

(defn exclusive-queue-names
  "Returns the set of queue names (as strings) that are registered with `:exclusive true`."
  []
  (into #{}
        (comp (filter (fn [[_k v]] (:exclusive v)))
              (map (fn [[k _v]] (name k))))
        @*listeners*))

;;; ------------------------------------------- Message handling -------------------------------------------

(mu/defn handle!
  "Handles messages from one or more bundles by invoking the registered listener.
  For max-batch-messages=1 (listen!), calls listener with each message individually.
  For max-batch-messages>1 (batch-listen!), calls listener with each batch vec.
  On success, marks all bundles as successful. On failure, marks all as failed.
  `message-bundles` is a map of bundle-id → backend-key, so each bundle is acked/nacked on the
  correct backend even when backends are swapped at runtime."
  [queue-name :- :metabase.mq.queue/queue-name
   message-bundles :- [:map-of :any ::q.backend/backend]
   messages :- [:sequential :any]]
  (let [{:keys [listener max-batch-messages]} (get @*listeners* queue-name)]
    (mq.impl/invoke-listener!
     {:channel-name    queue-name
      :listener-fn     (constantly listener)
      :invoke-fn       (fn [h]
                         (if (= 1 max-batch-messages)
                           (doseq [msg messages] (h msg))
                           (doseq [batch (partition-all max-batch-messages messages)]
                             (h (vec batch)))))
      :on-success      #(run! (fn [[bid backend]]
                                (q.backend/bundle-successful! backend queue-name bid))
                              message-bundles)
      :on-error        (fn [_e]
                         (run! (fn [[bid backend]]
                                 (q.backend/bundle-failed! backend queue-name bid))
                               message-bundles))})))

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
         :or   {max-batch-messages 1 max-next-ms 0}} (get @*listeners* queue-name)]
    (if (= 1 max-batch-messages)
      (handle! queue-name {bundle-id backend} messages)
      (let [drained (atom nil)]
        (swap! *accumulators*
               (fn [accs]
                 (let [acc (-> (or (get accs queue-name)
                                   {:messages [] :deadline-ms 0 :message-bundles {}})
                               (update :messages into messages)
                               (update :message-bundles assoc bundle-id backend)
                               (cond->
                                (zero? (:deadline-ms (get accs queue-name {:deadline-ms 0})))
                                 (assoc :deadline-ms (+ (System/currentTimeMillis) max-next-ms))))]
                   (if (>= (count (:messages acc)) max-batch-messages)
                     (do (reset! drained acc)
                         (dissoc accs queue-name))
                     (assoc accs queue-name acc)))))
        (when-let [{:keys [message-bundles messages]} @drained]
          (handle! queue-name message-bundles messages))))))

(mu/defn flush-pending!
  "Flushes any accumulated batch for the given queue whose deadline has passed.
  Backend info comes from the drained accumulator's `:message-bundles`."
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
    (when-let [{:keys [message-bundles messages]} @drained]
      (when (seq messages)
        (handle! queue-name message-bundles messages)))))

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

(defn start!
  "Starts the background message-manager thread and triggers backend processing
  for all registered queues."
  []
  (let [exec (Executors/newSingleThreadScheduledExecutor
              (reify ThreadFactory
                (newThread [_ r]
                  (doto (Thread. r "mq-message-manager")
                    (.setDaemon true)))))]
    (if (compare-and-set! flush-executor nil exec)
      (.scheduleAtFixedRate exec ^Runnable flush-all-pending! 100 100 TimeUnit/MILLISECONDS)
      (.shutdown exec)))
  (q.backend/start! q.backend/*backend*))

(defn stop-message-manager!
  "Stops the background message-manager thread."
  []
  (when-let [^ScheduledExecutorService exec (first (reset-vals! flush-executor nil))]
    (.shutdownNow exec)))

;;; ------------------------------------------- Listener registration -------------------------------------------

(defn- register-listener!
  "Atomically registers a listener for the given queue, throwing if one already exists.
  Returns the new listeners map on success."
  [queue-name listener-map]
  (let [already-registered? (atom false)]
    (swap! *listeners*
           (fn [m]
             (if (contains? m queue-name)
               (do (reset! already-registered? true) m)
               (assoc m queue-name listener-map))))
    (when @already-registered?
      (throw (ex-info "Queue listener already defined" {:queue queue-name})))))

(defmethod mq.impl/listen! "queue"
  [queue-name opts listener]
  (register-listener! queue-name {:listener           listener
                                  :max-batch-messages 1
                                  :max-next-ms        0
                                  :exclusive          (boolean (:exclusive opts))}))

(mu/defn batch-listen!
  "Registers a batch listener for a queue.
   The listener will be called with a vec of messages, sized up to :max-batch-messages.
   Pass `:exclusive true` in config to ensure only one node processes messages at a time."
  [queue-name :- :metabase.mq.queue/queue-name
   listener :- fn?
   config :- [:map [:max-batch-messages pos-int?] [:max-next-ms nat-int?] [:exclusive {:optional true} :boolean]]]
  (register-listener! queue-name (merge {:exclusive false} config {:listener listener})))

(defmethod mq.impl/unlisten! "queue"
  [queue-name]
  (swap! *listeners* dissoc queue-name))

(defmacro with-queue
  "Runs the body with the ability to add messages to the given queue.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown.

  NOTE: Publishing is best-effort and not transactional with the application database.
  If the caller's DB transaction commits but `publish!` subsequently fails, the queue
  message will be lost. Callers that need stronger guarantees should publish within
  the same DB transaction or use an idempotent retry strategy."
  [queue-name [queue-binding] & body]
  `(mq.impl/with-buffer
     (fn [msgs#]
       (q.backend/publish! q.backend/*backend* ~queue-name msgs#)
       (mq.impl/analytics-inc! :metabase-mq/queue-messages-published
                               {:queue (name ~queue-name)}
                               (count msgs#)))
     "Error in queue processing, no messages will be persisted to the queue"
     [~queue-binding]
     ~@body))

(mu/defn queue-length :- :int
  "The number of message *bundles* in the queue."
  [queue-name :- :metabase.mq.queue/queue-name]
  (q.backend/queue-length q.backend/*backend* queue-name))
