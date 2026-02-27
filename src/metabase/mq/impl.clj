(ns metabase.mq.impl
  "Shared protocol for buffering messages before publishing to queues or topics."
  (:require
   [metabase.analytics.prometheus :as analytics]
   [metabase.util.log :as log]))

(defprotocol MessageBuffer
  "Protocol for buffering messages before publishing."
  (put [this msg]
    "Put a message on the buffer."))

(defn invoke-handler!
  "Common handler invocation skeleton for both queues and topics.
  Looks up handler via `handler-fn`, times execution, logs errors,
  and records metrics. Calls `on-success` / `on-error` for system-specific
  side effects (e.g. queue ACK/NACK)."
  [{:keys [channel-name handler-fn invoke-fn on-success on-error]}]
  (let [system-name    (namespace channel-name)
        handler        (handler-fn)
        label-key      (keyword system-name)
        labels         {label-key (name channel-name)}
        bundles-metric (keyword "metabase-mq" (str system-name "-bundles-handled"))
        duration-metric (keyword "metabase-mq" (str system-name "-handle-duration-ms"))
        start          (System/nanoTime)]
    (try
      (when-not handler
        (throw (ex-info (str "No handler defined for " system-name)
                        {label-key channel-name})))
      (invoke-fn handler)
      (when on-success (on-success))
      (analytics/inc! bundles-metric (assoc labels :status "success"))
      (catch Exception e
        (log/error e (str "Error handling " system-name " message") labels)
        (when on-error (on-error e))
        (analytics/inc! bundles-metric (assoc labels :status "error")))
      (finally
        (analytics/observe! duration-metric labels
                            (/ (double (- (System/nanoTime) start)) 1e6))))))
