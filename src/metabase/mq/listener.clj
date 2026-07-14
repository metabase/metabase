(ns metabase.mq.listener
  "Listener registry: registration, lookup, and the `def-listener!` macro.

  A listener is the consumer-side wiring for a queue — just the handler fn. Everything else
  about a queue (its broker-side properties, batch size, dedup) is declared on the queue via
  [[metabase.mq.queue.registry/def-queue!]], which takes effect on every node regardless of
  whether a listener is registered locally. A listener for a queue requires that queue to be
  declared first."
  (:require
   [metabase.mq.queue.registry :as q.registry]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:dynamic *listeners*
  "channel → {:listener fn} for all channels."
  (atom {}))

(defn queue-names
  "Returns the seq of queue channel names currently registered in `*listeners*`."
  []
  (filter #(= "queue" (namespace %)) (keys @*listeners*)))

(defn get-listener
  "Returns the listener config map for `channel`, or nil if not registered."
  [channel]
  (get @*listeners* channel))

(defn- register-listener!
  "Atomically registers a listener for the given channel.

  Throws if the queue has not been declared via [[q.registry/def-queue!]] — catching missing-queue
  typos at startup rather than at first publish. Also throws if a listener is already
  registered for the channel."
  [channel listener-map]
  (when (and (= "queue" (namespace channel))
             (nil? (q.registry/get-queue channel)))
    (throw (ex-info (str "No queue declared for " channel
                         " — declare it with `def-queue!` before registering a listener.")
                    {:channel channel
                     :known-queues (set (keys @q.registry/*queues*))})))
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
   at the correct point in startup.

   Use this directly only when you need a runtime-dynamic registration (e.g. plugins, ad-hoc
   tests). The listener is invoked with a vec of messages, sized up to the queue's
   `:max-batch-messages`."
  [channel listener]
  (register-listener! channel {:listener listener}))

(defn unlisten!
  "Removes the listener for a channel."
  [channel]
  (swap! *listeners* dissoc channel))

(mr/def ::channel
  [:and :keyword [:fn {:error/message "Channel must be namespaced to 'queue'"}
                  #(= "queue" (namespace %))]])

(defmulti def-listener*
  "Multimethod backing [[def-listener!]]."
  {:arglists '([channel])}
  identity)

(defmacro def-listener!
  "Declares a listener for a queue.

   The queue itself must already be declared via `def-queue!` — that's where batch size,
   exclusivity, and dedup live. The listener body receives a vec of messages; for per-message
   handling write `(doseq [m messages] ...)` inside the body. Queue channels are namespaced
   `:queue/*`.

   Examples:

       (mq/def-queue! :queue/simple-task {:transactional :try})
       (mq/def-listener! :queue/simple-task [messages]
         (doseq [msg messages] (process msg)))

       (mq/def-queue! :queue/search-reindex {:transactional :require :exclusive true :max-batch-messages 50})
       (mq/def-listener! :queue/search-reindex [messages]
         (process-batch messages))"
  {:arglists '([channel bindings & body])}
  [channel bindings & body]
  `(defmethod def-listener* ~channel [~'_]
     (batch-listen! ~channel (fn [~@bindings] ~@body))))

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
