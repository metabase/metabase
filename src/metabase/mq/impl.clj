(ns metabase.mq.impl
  "Backend coordination: message delivery, analytics helpers, and lifecycle management."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.listener :as listener]
   [metabase.mq.payload :as payload]
   [metabase.mq.polling :as mq.polling]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
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
  "Common listener invocation skeleton.
  Looks up listener via `listener-fn`, times execution, logs errors,
  and records metrics. Calls `on-success` / `on-error` for queue ACK/NACK."
  [{:keys [channel listener-fn invoke-fn on-success on-error]}]
  (let [transport (namespace channel)
        listener  (listener-fn)
        labels    {:transport transport :channel (name channel)}
        start     (System/nanoTime)]
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

(defn handle-batch-failure-policy!
  "Shared retry-vs-drop policy for a just-failed batch. `failures` is the number of attempts that have
  already failed, so the just-failed attempt makes `(inc failures)` total. When that reaches
  `queue-max-retries` the batch is dropped (warn-logged + `:queue-batch-permanent-failures` metric)
  by calling `on-drop`; otherwise `:queue-batch-retries` is emitted and `on-retry` re-enqueues it.
  `labels` is the metric label map."
  [channel labels failures on-retry on-drop]
  (if (>= (inc failures) (mq.settings/queue-max-retries))
    (do
      (log/warnf "Batch for %s exhausted retries (%d), dropping" channel (mq.settings/queue-max-retries))
      (analytics/inc! :metabase-mq/queue-batch-permanent-failures labels)
      (on-drop))
    (do
      (analytics/inc! :metabase-mq/queue-batch-retries labels)
      (on-retry))))

(defn- handle-batch-failure!
  "Poll-backend failure handler: decides retry vs. permanent failure for a just-failed batch based on
  its prior failure count, then tells the backend to re-enqueue or drop it. No-ops if the backend no
  longer owns/knows the batch (`failure-count` returns nil)."
  [backend channel batch-id]
  (when-let [failures (q.backend/failure-count backend channel batch-id)]
    (let [labels {:backend (name (q.backend/backend-id backend)) :channel (name channel)}]
      (handle-batch-failure-policy! channel labels failures
                                    #(q.backend/retry-batch! backend channel batch-id)
                                    #(q.backend/fail-batch! backend channel batch-id)))))

(defn- sliced-invoke-fn
  "Builds the `invoke-fn` that slices `messages` into `:max-batch-messages` chunks and feeds each to
  the listener `h` with per-chunk error isolation — one failing chunk doesn't block the others, but
  the whole batch is reported failed (the listener throws) so it can be nacked/redelivered. Shared
  by the poll path ([[handle!]]) and the push path ([[deliver-reporting!]]) so both slice and
  isolate identically."
  [channel messages]
  (let [batch-size (q.registry/max-batch-messages channel)
        transport  (namespace channel)
        labels     {:transport transport :channel (name channel)}]
    (fn [h]
      (let [error (atom nil)]
        (doseq [batch (partition-all batch-size messages)]
          (try (h (vec batch))
               (catch Exception e
                 (analytics/inc! :metabase-mq/handler-errors labels)
                 (reset! error e)
                 (log/errorf e "Error handling %s message for %s, continuing"
                             transport (name channel)))))
        (when-let [e @error]
          (throw (ex-info "One or more messages failed" {} e)))))))

(defn handle!
  "Handles accumulated messages for a channel by invoking the registered listener.
   Processes each message/batch with error isolation — one failure doesn't block others.
   For queues, batches use all-or-nothing ACK semantics: if ANY message in the batch
   fails, the ENTIRE batch is nacked and will be retried. This means successfully
   processed messages may be re-delivered. Queue listeners MUST be idempotent.
   The queue's :dedup-fn helps mitigate duplicate processing on retry."
  [channel message-batches messages]
  (swap! last-activity* assoc channel (System/nanoTime))
  (let [labels {:transport (namespace channel) :channel (name channel)}]
    (analytics/inc! :metabase-mq/messages-received labels (count messages))
    (invoke-listener!
     {:channel      channel
      :listener-fn  #(:listener (listener/get-listener channel))
      :invoke-fn    (sliced-invoke-fn channel messages)
      :on-success   #(doseq [[bid backend] message-batches]
                       (q.backend/batch-successful! backend channel bid))
      :on-error     (fn [_e]
                      (doseq [[bid backend] message-batches]
                        (handle-batch-failure! backend channel bid)))})))

(defn deliver-reporting!
  "Push-backend delivery entry point. Decodes the opaque `payload` string and runs the registered
  listener for `channel` with the same batch-slicing, error-isolation, and metrics as the poll path
  ([[handle!]]), but instead of driving backend ACK/NACK it returns `true` on success and `false`
  if the listener errored. Used by push backends (e.g. Quartz) that own their own
  retry/redelivery — they decide what to do with the boolean. A channel with no registered
  listener counts as success (the message is dropped), matching the poll path."
  [channel payload]
  (swap! last-activity* assoc channel (System/nanoTime))
  (let [messages (payload/decode payload)
        labels   {:transport (namespace channel) :channel (name channel)}
        ok       (atom true)]
    (analytics/inc! :metabase-mq/messages-received labels (count messages))
    (invoke-listener!
     {:channel     channel
      :listener-fn #(:listener (listener/get-listener channel))
      :invoke-fn   (sliced-invoke-fn channel messages)
      :on-error    (fn [_e] (reset! ok false))})
    @ok))

(defn deliver!
  "Called by backends when a payload is ready for delivery. Decodes the opaque payload
   string (the single point where messages re-enter the typed world) and hands the messages
   to handle! for processing."
  [channel payload batch-id backend]
  (handle! channel (if batch-id {batch-id backend} {}) (payload/decode payload)))

(defn submit-delivery!
  "Submits a delivery to the shared worker pool for non-blocking processing.
   Returns true if submitted, false if the channel already has an active handler.
   `metadata` is an opaque map stored alongside the future — backends can use it for
   backend-specific tracking (e.g. queues store {:batch-id id} for heartbeat updates).
   Uses bound-fn to convey dynamic bindings to the worker thread.
   The busy-check and registration are atomic via a single swap!.
   A generation counter prevents a completed future's cleanup from clobbering a
   re-submission that won the slot between the finally and the dissoc."
  [channel payload batch-id backend metadata]
  (let [gen     (Object.)
        [old _] (swap-vals! active-handlers
                            (fn [handlers]
                              (if (contains? handlers channel)
                                handlers
                                (assoc handlers channel {:future nil :metadata metadata :gen gen}))))]
    (if (contains? old channel)
      false
      (let [^Callable task (bound-fn []
                             (try
                               (deliver! channel payload batch-id backend)
                               (finally
                                 ;; Only remove if this generation still owns the slot
                                 (swap! active-handlers
                                        (fn [handlers]
                                          (if (identical? gen (:gen (get handlers channel)))
                                            (dissoc handlers channel)
                                            handlers)))
                                 (mq.polling/notify-all!))))
            f    (try
                   (.submit ^ExecutorService @worker-pool task)
                   (catch Throwable t
                     ;; The slot was already claimed above. If the submit itself fails (e.g. the
                     ;; worker pool isn't running / was shut down, so the deref or .submit throws),
                     ;; release the slot we claimed before propagating — otherwise the channel stays
                     ;; marked busy forever and the queue silently stops delivering.
                     (swap! active-handlers
                            (fn [handlers]
                              (if (identical? gen (:gen (get handlers channel)))
                                (dissoc handlers channel)
                                handlers)))
                     (throw t)))]
        ;; Only set the future if this generation still owns the slot
        (swap! active-handlers
               (fn [handlers]
                 (if (identical? gen (:gen (get handlers channel)))
                   (assoc-in handlers [channel :future] f)
                   handlers)))
        true))))

(defn start-worker-pool!
  "Starts the shared worker pool for non-blocking message delivery. Idempotent.
  Returns `true` if THIS call created the pool, `false` if one was already running."
  []
  (let [pool (Executors/newCachedThreadPool)]
    (if (compare-and-set! worker-pool nil pool)
      true
      (do (.shutdown ^ExecutorService pool) false))))

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
