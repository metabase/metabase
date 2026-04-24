(ns metabase.mq.impl
  "Backend coordination: message delivery, analytics helpers, and lifecycle management."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.mq.listener :as listener]
   [metabase.mq.polling :as mq.polling]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.transport :as transport]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Callable ExecutorService Executors Future)))

(set! *warn-on-reflection* true)

(def ^:private active-handlers
  "channel keyword → {:future Future, :metadata map}
   Tracks which channels have an active handler running across all backends."
  (atom {}))

(def ^:private worker-pool
  "Shared thread pool for processing messages off backend poll threads."
  (atom nil))

(def ^:private last-activity*
  "channel keyword → nanoTime of last publish or handler completion."
  (atom {}))

(defn last-activity
  "Returns the nanoTime of the last publish or handler completion for the given channel, or nil."
  [channel]
  (get @last-activity* channel))

(defn record-publish-activity!
  "Records a publish event for the given channel. Called by the publishing pipeline."
  [channel]
  (swap! last-activity* assoc channel (System/nanoTime)))

(defn channel-busy?
  "Returns true if the given channel has an active handler running."
  [channel]
  (contains? @active-handlers channel))

(defn busy-channels
  "Returns the set of channels that currently have an active handler."
  []
  (set (keys @active-handlers)))

(defn active-handler-metadata
  "Returns the metadata map for the active handler on the given channel, or nil.
   Backends store backend-specific data here (e.g. queue backends store :batch-id for heartbeats)."
  [channel]
  (get-in @active-handlers [channel :metadata]))

(defn invoke-listener!
  "Common listener invocation skeleton for both queues and topics.
  Looks up listener via `listener-fn`, times execution, logs errors,
  and records metrics. Calls `on-success` / `on-error` for system-specific
  side effects (e.g. queue ACK/NACK)."
  [{:keys [channel listener-fn invoke-fn on-success on-error]}]
  (let [transport (namespace channel)
        listener    (listener-fn)
        labels      {:transport transport :channel (name channel)}
        start       (System/nanoTime)]
    (try
      (if-not listener
        (log/debugf "No listener registered for %s %s, skipping message" transport (name channel))
        (do
          (invoke-fn listener)
          (when on-success (on-success))
          (analytics/inc! :metabase-mq/batches-handled (assoc labels :status "success"))))
      (catch Exception e
        (log/error e (str "Error handling " transport " message") labels)
        (when on-error (on-error e))
        (analytics/inc! :metabase-mq/batches-handled (assoc labels :status "error")))
      (finally
        (analytics/observe! :metabase-mq/handle-duration-ms labels
                            (/ (double (- (System/nanoTime) start)) 1e6))))))

(defn handle!
  "Handles accumulated messages for a channel by invoking the registered listener.
   Processes each message/batch with error isolation — one failure doesn't block others.
   For queues, batches use all-or-nothing ACK semantics: if ANY message in the batch
   fails, the ENTIRE batch is nacked and will be retried. This means successfully
   processed messages may be re-delivered. Queue listeners MUST be idempotent.
   The :dedup-fn option on listeners helps mitigate duplicate processing on retry."
  [channel message-batches messages]
  (swap! last-activity* assoc channel (System/nanoTime))
  (analytics/inc! :metabase-mq/messages-received
                  {:transport (namespace channel) :channel (name channel)}
                  (count messages))
  (let [{:keys [max-batch-messages]} (listener/get-listener channel)]
    (invoke-listener!
     {:channel      channel
      :listener-fn  #(:listener (listener/get-listener channel))
      :invoke-fn    (fn [h]
                      (let [error (atom nil)]
                        (if (and max-batch-messages (> max-batch-messages 1))
                          (doseq [batch (partition-all max-batch-messages messages)]
                            (try (h (vec batch))
                                 (catch Exception e
                                   (reset! error e)
                                   (log/errorf e "Error handling %s message for %s, continuing"
                                               (namespace channel) (name channel)))))
                          (doseq [msg messages]
                            (try (h msg)
                                 (catch Exception e
                                   (reset! error e)
                                   (log/errorf e "Error handling %s message for %s, continuing"
                                               (namespace channel) (name channel))))))
                        (when-let [e @error]
                          (throw (ex-info "One or more messages failed" {} e)))))
      :on-success   #(doseq [[bid backend] message-batches]
                       (q.backend/batch-successful! backend channel bid))
      :on-error     (fn [_e]
                      (doseq [[bid backend] message-batches]
                        (q.backend/batch-failed! backend channel bid)))})))

(defn deliver!
  "Called by backends when messages are ready for delivery.
   Passes messages directly to handle! for processing.
   `batch-id` and `backend` are optional — queues pass them for ACK/NACK, topics pass nil."
  [channel messages batch-id backend]
  (handle! channel (if batch-id {batch-id backend} {}) messages))

(defn submit-delivery!
  "Submits a delivery to the shared worker pool for non-blocking processing.
   Returns true if submitted, false if the channel already has an active handler.
   `metadata` is an opaque map stored alongside the future — backends can use it for
   backend-specific tracking (e.g. queues store {:batch-id id} for heartbeat updates).
   Uses bound-fn to convey dynamic bindings to the worker thread.
   The busy-check and registration are atomic via a single swap!.
   A generation counter prevents a completed future's cleanup from clobbering a
   re-submission that won the slot between the finally and the dissoc."
  [channel messages batch-id backend metadata]
  (let [claimed? (atom false)
        gen      (Object.)]
    (swap! active-handlers
           (fn [handlers]
             (if (contains? handlers channel)
               handlers
               (do (reset! claimed? true)
                   (assoc handlers channel {:future nil :metadata metadata :gen gen})))))
    (if-not @claimed?
      false
      (let [f (.submit ^ExecutorService @worker-pool
                       ^Callable (bound-fn []
                                   (try
                                     (deliver! channel messages batch-id backend)
                                     (finally
                                       ;; Only remove if this generation still owns the slot
                                       (swap! active-handlers
                                              (fn [handlers]
                                                (if (identical? gen (:gen (get handlers channel)))
                                                  (dissoc handlers channel)
                                                  handlers)))
                                       (mq.polling/notify-all!)))))]
        ;; Only set the future if this generation still owns the slot
        (swap! active-handlers
               (fn [handlers]
                 (if (identical? gen (:gen (get handlers channel)))
                   (assoc-in handlers [channel :future] f)
                   handlers)))
        true))))

(defn start-worker-pool!
  "Starts the shared worker pool for non-blocking message delivery. Idempotent."
  []
  (when-not @worker-pool
    (let [pool (Executors/newCachedThreadPool)]
      (when-not (compare-and-set! worker-pool nil pool)
        ;; Another thread won the race — shut down our pool
        (.shutdown ^ExecutorService pool)))))

(defn shutdown-worker-pool!
  "Cancels all active handler futures and shuts down the worker pool."
  []
  (doseq [[_ {:keys [^Future future]}] @active-handlers]
    (when future
      (.cancel future true)))
  (reset! active-handlers {})
  (when-let [^ExecutorService pool @worker-pool]
    (.shutdownNow pool)
    (reset! worker-pool nil)))

(defn start-transports
  "Starts the queue/topic backends."
  []
  (transport/start! :queue)
  (transport/start! :topic))

(defn shutdown-transports
  "Shuts down all queue/topic backends."
  []
  (transport/shutdown! :queue)
  (transport/shutdown! :topic))

(defn shutdown!
  "Shuts down all mq infrastructure: publish buffer, worker pool, backends, and listener state."
  []
  (publish-buffer/stop-publish-buffer-flush!)
  (shutdown-transports)
  (shutdown-worker-pool!)
  (reset! listener/*listeners* {}))
