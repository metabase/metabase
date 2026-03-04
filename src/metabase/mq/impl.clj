(ns metabase.mq.impl
  "Shared protocol and helpers for buffering messages before publishing to queues or topics."
  (:require
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.util.concurrent Future)))

(set! *warn-on-reflection* true)

(defprotocol MessageBuffer
  "Protocol for buffering messages before publishing."
  (put [this msg]
    "Put a message on the buffer."))

(defn start-cleanup-loop!
  "Starts a background future that calls `cleanup-fn` every `interval-ms`.
  Loops while `future-atom` is non-nil. Returns the future."
  [future-atom interval-ms cleanup-fn label]
  (future
    (try
      (loop []
        (when @future-atom
          (try
            (cleanup-fn)
            (catch Exception e
              (log/error e (str "Error during " label " cleanup"))))
          (Thread/sleep (long interval-ms))
          (recur)))
      (catch InterruptedException _
        (log/info (str label " cleanup loop interrupted"))))))

(defn start-cleanup-loop-once!
  "Idempotently starts a cleanup loop with double-checked locking.
  Uses `future-atom` as both the guard and the storage for the future."
  [future-atom interval-ms cleanup-fn label]
  (when-not @future-atom
    (locking future-atom
      (when-not @future-atom
        (let [f (start-cleanup-loop! future-atom interval-ms cleanup-fn label)]
          (reset! future-atom f)
          (log/info (str label " cleanup loop started")))))))

(defn stop-cleanup-loop!
  "Stops a cleanup loop started by [[start-cleanup-loop-once!]]."
  [future-atom label]
  (when-let [^Future f @future-atom]
    (reset! future-atom nil)
    (.cancel f true)
    (log/info (str label " cleanup loop stopped"))))

(defmacro with-buffer
  "Runs body with a MessageBuffer bound to `buffer-binding`. On success calls
  `publish-fn` with the collected messages vector. On exception, discards and rethrows.
  `publish-fn` is a function of one argument (the messages vector)."
  [publish-fn error-label [buffer-binding] & body]
  `(let [buffer# (atom [])
         ~buffer-binding (reify MessageBuffer
                           (put [_ msg#] (swap! buffer# conj msg#)))]
     (try
       (let [result# (do ~@body)]
         (let [msgs# @buffer#]
           (when (seq msgs#)
             (~publish-fn msgs#)))
         result#)
       (catch Exception e#
         (log/error e# ~error-label)
         (throw e#)))))

(mr/def ::channel-name
  [:and :keyword [:fn {:error/message "Channel name must be namespaced to 'queue' or 'topic'"}
                  #(#{"queue" "topic"} (namespace %))]])

(mr/def ::listen-opts
  [:map [:exclusive {:optional true} :boolean]])

(defmulti listen!
  "Registers a listener for a queue or topic. Dispatches on (namespace channel-name).
   For :queue/* names, see metabase.mq.queue.impl.
   For :topic/* names, see metabase.mq.topic.impl.
   `opts` is an optional map; pass nil for defaults. Queues support `{:exclusive true}`."
  {:arglists      '([channel-name opts listener])
   :malli/schema  [:=> [:cat ::channel-name ::listen-opts fn?] :any]}
  (fn [channel-name _opts _listener] (namespace channel-name)))

(defmulti unlisten!
  "Removes the listener for a queue or topic and stops backend processing."
  {:arglists '([channel-name])}
  namespace)

(defn analytics-inc!
  "Version of `metabase.analytics.prometheus/inc!` that can be used without a direct dependency on the namespace, since directly using it introduces a cycle."
  [& args]
  (apply (requiring-resolve 'metabase.analytics.prometheus/inc!) args))

(defn- analytics-observe! [& args]
  (apply (requiring-resolve 'metabase.analytics.prometheus/observe!) args))

(defn invoke-listener!
  "Common listener invocation skeleton for both queues and topics.
  Looks up listener via `listener-fn`, times execution, logs errors,
  and records metrics. Calls `on-success` / `on-error` for system-specific
  side effects (e.g. queue ACK/NACK)."
  [{:keys [channel-name listener-fn invoke-fn on-success on-error]}]
  (let [system-name    (namespace channel-name)
        listener       (listener-fn)
        label-key      (keyword system-name)
        labels         {label-key (name channel-name)}
        bundles-metric (keyword "metabase-mq" (str system-name "-bundles-handled"))
        duration-metric (keyword "metabase-mq" (str system-name "-handle-duration-ms"))
        start          (System/nanoTime)]
    (try
      (when-not listener
        (throw (ex-info (str "No listener defined for " system-name)
                        {label-key channel-name})))
      (invoke-fn listener)
      (when on-success (on-success))
      (analytics-inc! bundles-metric (assoc labels :status "success"))
      (catch Exception e
        (log/error e (str "Error handling " system-name " message") labels)
        (when on-error (on-error e))
        (analytics-inc! bundles-metric (assoc labels :status "error")))
      (finally
        (analytics-observe! duration-metric labels
                            (/ (double (- (System/nanoTime) start)) 1e6))))))
