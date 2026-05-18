(ns metabase.mq.listener
  "Listener registry: registration, lookup, and the `def-listener!` macro."
  (:require
   [metabase.mq.queue.transport-impl :as q.transport-impl]
   [metabase.mq.topic.transport-impl :as topic.transport-impl]
   [metabase.mq.transport :as transport]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(comment
  q.transport-impl/keep-me
  topic.transport-impl/keep-me)

(set! *warn-on-reflection* true)

(def default-max-batch-messages
  "Default `:max-batch-messages` when the listener doesn't specify one.
   Bounds both DB-row size at publish time and the consumer slice size at handle time."
  100)

(def ^:dynamic *listeners*
  "channel → {:listener fn :max-batch-messages int ...} for all channels."
  (atom {}))

(defn queue-names
  "Returns the seq of queue channel names currently registered in `*listeners*`."
  []
  (filter #(= "queue" (namespace %)) (keys @*listeners*)))

(defn topic-names
  "Returns the seq of topic channel names currently registered in `*listeners*`."
  []
  (filter #(= "topic" (namespace %)) (keys @*listeners*)))

(defn get-listener
  "Returns the listener config map for `channel`, or nil if not registered."
  [channel]
  (get @*listeners* channel))

(defn register-listener!
  "Atomically registers a listener for the given channel, throwing if one already exists."
  [channel listener-map]
  (let [[old _] (swap-vals! *listeners*
                            (fn [m]
                              (if (contains? m channel)
                                m
                                (assoc m channel listener-map))))]
    (when (contains? old channel)
      (throw (ex-info (str "Listener already registered for " (namespace channel) " " (name channel))
                      {:channel channel})))))

(defn batch-listen!
  "Low-level listener registration. Prefer [[def-listener!]] for production code — the macro
   is the supported way to wire a handler so it gets activated through `register-listeners!`
   at the correct point in startup, and discovered early by `mq/start-receiving!`.

   Use this directly only when you need a runtime-dynamic registration (e.g. plugins, ad-hoc
   tests). The listener is invoked with a vec of messages, sized up to `:max-batch-messages`
   (defaults to `default-max-batch-messages`). Queues support `{:exclusive true}`."
  [channel listener config]
  (let [defaults (transport/on-listen! channel config)
        config   (merge {:max-batch-messages default-max-batch-messages} config)]
    (register-listener! channel
                        (merge defaults config {:listener listener}))))

(defn unlisten!
  "Removes the listener for a channel."
  [channel]
  (swap! *listeners* dissoc channel))

(mr/def ::channel
  [:and :keyword [:fn {:error/message "Channel must be namespaced to 'queue' or 'topic'"}
                  #(#{"queue" "topic"} (namespace %))]])

(mr/def ::listen-opts
  [:map [:exclusive {:optional true} :boolean]])

(defmulti def-listener*
  "Multimethod backing [[def-listener!]]."
  {:arglists '([channel])}
  identity)

(defmacro def-listener!
  "Declares a listener for a queue or topic.

   The listener body receives a vec of messages; for per-message handling write
   `(doseq [m messages] ...)` inside the body. The keyword's namespace decides the transport:
   `:queue/*` for at-least-once queues, `:topic/*` for fire-and-forget pub/sub.

   Optional config keys:
   - `:max-batch-messages` — slice size (defaults to [[default-max-batch-messages]]).
   - `:exclusive` (queues only) — when true, at most one batch is in-flight cluster-wide.
   - `:dedup-fn` — function that filters duplicates from a batch before delivery.

   Examples:

       (mq/def-listener! :topic/settings-cache-invalidated [messages]
         (doseq [_ messages] (restore-cache!)))

       (mq/def-listener! :queue/simple-task {:exclusive true} [messages]
         (doseq [msg messages] (process msg)))

       (mq/def-listener! :queue/search-reindex
         {:max-batch-messages 50 :exclusive true}
         [messages]
         (process-batch messages))"
  {:arglists '([channel bindings & body]
               [channel config bindings & body])}
  [channel & args]
  (let [[config & args]  (if (map? (first args)) args (cons nil args))
        [bindings & body] args]
    `(defmethod def-listener* ~channel [~'_]
       (batch-listen!
        ~channel
        (fn [~@bindings] ~@body)
        ~(or (select-keys config [:max-batch-messages :exclusive :dedup-fn]) {})))))

(defn register-listeners!
  "Call all [[def-listener!]] implementations to register their listeners.
   Called at startup and in test setup (from `with-test-mq`).
   Throws on the first registration failure so broken listeners are caught early."
  []
  (doseq [[k f] (methods def-listener*)]
    (try
      (f k)
      (catch Throwable e
        (log/errorf e "Failed to register listener %s" k)
        (throw (ex-info (str "Failed to register listener " k)
                        {:channel k}
                        e))))))
