(ns metabase.mq.impl
  "Backend coordination: message delivery, analytics helpers, and lifecycle management."
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn analytics-inc!
  "Version of `metabase.analytics.prometheus/inc!` that can be used without a direct dependency on the namespace, since directly using it introduces a cycle."
  [& args]
  (apply (requiring-resolve 'metabase.analytics.prometheus/inc!) args))

(defn analytics-set!
  "Version of `metabase.analytics.prometheus/set!` that can be used without a direct dependency on the namespace, since directly using it introduces a cycle."
  [& args]
  (apply (requiring-resolve 'metabase.analytics.prometheus/set!) args))

(defn- analytics-observe! [& args]
  (apply (requiring-resolve 'metabase.analytics.prometheus/observe!) args))

(defn invoke-listener!
  "Common listener invocation skeleton for both queues and topics.
  Looks up listener via `listener-fn`, times execution, logs errors,
  and records metrics. Calls `on-success` / `on-error` for system-specific
  side effects (e.g. queue ACK/NACK)."
  [{:keys [channel listener-fn invoke-fn on-success on-error]}]
  (let [system-name (namespace channel)
        listener    (listener-fn)
        labels      {:type system-name :channel (name channel)}
        start       (System/nanoTime)]
    (try
      (if-not listener
        (log/debugf "No listener registered for %s %s, skipping message" system-name (name channel))
        (do
          (invoke-fn listener)
          (when on-success (on-success))
          (analytics-inc! :metabase-mq/batches-handled (assoc labels :status "success"))))
      (catch Exception e
        (log/error e (str "Error handling " system-name " message") labels)
        (when on-error (on-error e))
        (analytics-inc! :metabase-mq/batches-handled (assoc labels :status "error")))
      (finally
        (analytics-observe! :metabase-mq/handle-duration-ms labels
                            (/ (double (- (System/nanoTime) start)) 1e6))))))

(defn handle!
  "Handles accumulated messages for a channel by invoking the registered listener.
   Processes each message/batch with error isolation — one failure doesn't block others.
   For queues, bundles are acked on full success or nacked if any message fails."
  [channel message-bundles messages]
  (analytics-inc! :metabase-mq/messages-received
                  {:type (namespace channel) :channel (name channel)}
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
      :on-success   #(doseq [[bid backend] message-bundles]
                       (q.backend/bundle-successful! backend channel bid))
      :on-error     (fn [_e]
                      (doseq [[bid backend] message-bundles]
                        (q.backend/bundle-failed! backend channel bid)))})))

(defn deliver!
  "Called by backends when messages are ready for delivery.
   Passes messages directly to handle! for processing.
   `bundle-id` and `backend` are optional — queues pass them for ACK/NACK, topics pass nil."
  [channel messages bundle-id backend]
  (handle! channel (if bundle-id {bundle-id backend} {}) messages))

(defn start-all-backends!
  "Starts all queue/topic backends."
  []
  (doseq [be [:queue.backend/appdb :queue.backend/memory]]
    (q.backend/start! be))
  (doseq [be [:topic.backend/appdb :topic.backend/memory]]
    (topic.backend/start! be)))

(defn shutdown-all-backends!
  "Shuts down all queue/topic backends."
  []
  (doseq [be [:queue.backend/appdb :queue.backend/memory]]
    (q.backend/shutdown! be))
  (doseq [be [:topic.backend/appdb :topic.backend/memory]]
    (topic.backend/shutdown! be)))

(defn shutdown!
  "Shuts down all mq infrastructure: publish buffer, backends, and listener state."
  []
  (publish-buffer/stop-publish-buffer-flush!)
  (shutdown-all-backends!)
  (reset! listener/*listeners* {}))
