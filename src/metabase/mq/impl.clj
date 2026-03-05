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
  {:arglists      '([channel-name opts listener])}
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

;;; ------------------------------------------- Listener registration -------------------------------------------

(defmulti def-listener*
  "Multimethod backing [[def-listener]]. Each implementation registers its listener
   by calling [[listen!]] or [[metabase.mq.queue.impl/batch-listen!]].
   Do not call or implement directly — use [[def-listener]] instead."
  {:arglists '([channel-name])}
  identity)

(defmacro def-listener
  "Defines a listener for a queue or topic, detected from the keyword namespace.

   **Topic listener** — receives a single message:

       (mq/def-listener :topic/settings-cache-invalidated [msg]
         (restore-cache!))

   **Queue listener** — receives a single message, with optional config:

       (mq/def-listener :queue/simple-task {:exclusive true} [msg]
         (process msg))

   **Queue batch listener** — receives a vec of messages (config must include :max-batch-messages):

       (mq/def-listener :queue/search-reindex
         {:max-batch-messages 50 :max-next-ms 100 :exclusive true}
         [messages]
         (process-batch messages))"
  {:arglists '([channel-name bindings & body]
               [channel-name config bindings & body])}
  [channel-name & args]
  (let [queue?          (= "queue" (namespace channel-name))
        [config & args] (if (map? (first args))
                          args
                          (cons nil args))
        [bindings & body] args
        batch?          (and queue? config (:max-batch-messages config))]
    (when (and config (not queue?))
      (throw (ex-info "Config map is only supported for queue listeners" {:channel channel-name})))
    (if batch?
      `(defmethod def-listener* ~channel-name [~'_]
         ((requiring-resolve 'metabase.mq.queue.impl/batch-listen!)
          ~channel-name
          (fn [~@bindings] ~@body)
          ~(merge {:max-batch-messages 1 :max-next-ms 0 :exclusive false} config)))
      `(defmethod def-listener* ~channel-name [~'_]
         (listen! ~channel-name ~(or config {}) (fn [~@bindings] ~@body))))))

(defn register-listeners!
  "Call all [[def-listener]] implementations to register their listeners.
   Called at startup and in test setup (from `with-sync-mq`)."
  []
  (doseq [[k f] (methods def-listener*)]
    (try
      (f k)
      (catch Throwable e
        (.println System/err (str "Error registering listener " k ": " e))))))

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
      (if-not listener
        (log/debugf "No listener registered for %s %s, skipping message" system-name (name channel-name))
        (do
          (invoke-fn listener)
          (when on-success (on-success))
          (analytics-inc! bundles-metric (assoc labels :status "success"))))
      (catch Exception e
        (log/error e (str "Error handling " system-name " message") labels)
        (when on-error (on-error e))
        (analytics-inc! bundles-metric (assoc labels :status "error")))
      (finally
        (analytics-observe! duration-metric labels
                            (/ (double (- (System/nanoTime) start)) 1e6))))))
