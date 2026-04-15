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

(defn listen!
  "Registers a listener for a queue or topic.
   `opts` is an optional map; pass nil or {} for defaults. Queues support `{:exclusive true}`."
  [channel opts listener]
  (let [defaults  (transport/on-listen! channel opts)
        listener' (transport/wrap-listener channel listener)]
    (register-listener! channel
                        (merge defaults opts {:listener listener' :max-batch-messages 1}))))

(defn batch-listen!
  "Registers a batch listener for a queue or topic.
   The listener will be called with a vec of messages, sized up to :max-batch-messages."
  [channel listener config]
  (let [defaults  (transport/on-listen! channel config)
        listener' (transport/wrap-listener channel listener)]
    (register-listener! channel
                        (merge defaults config {:listener listener'}))))

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
  "Multimethod backing [[def-listener!]]. Each implementation registers its listener
   by calling [[listen!]] or [[batch-listen!]].
   Do not call or implement directly — use [[def-listener!]] instead."
  {:arglists '([channel])}
  identity)

(defmacro def-listener!
  "Defines a listener for a queue or topic, detected from the keyword namespace.

   **Topic listener** — receives a single message:

       (mq/def-listener! :topic/settings-cache-invalidated [msg]
         (restore-cache!))

   **Queue listener** — receives a single message, with optional config:

       (mq/def-listener! :queue/simple-task {:exclusive true} [msg]
         (process msg))

   **Queue batch listener** — receives a vec of messages (config must include :max-batch-messages):

       (mq/def-listener! :queue/search-reindex
         {:max-batch-messages 50 :exclusive true}
         [messages]
         (process-batch messages))"
  {:arglists '([channel bindings & body]
               [channel config bindings & body])}
  [channel & args]
  (let [[config & args] (if (map? (first args))
                          args
                          (cons nil args))
        [bindings & body] args
        batch?          (and config (:max-batch-messages config))]
    (if batch?
      `(defmethod def-listener* ~channel [~'_]
         (batch-listen!
          ~channel
          (fn [~@bindings] ~@body)
          ~(select-keys config [:max-batch-messages :exclusive :dedup-fn])))
      `(defmethod def-listener* ~channel [~'_]
         (listen! ~channel ~(or config {}) (fn [~@bindings] ~@body))))))

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
