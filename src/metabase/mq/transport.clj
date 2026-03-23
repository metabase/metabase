(ns metabase.mq.transport
  "Multimethods dispatched by transport type (:queue or :topic).
   Sits at the bottom of the mq dependency tree — no mq requires.")

(defn transport-type
  "Returns :queue or :topic for a namespaced channel keyword."
  [channel]
  (keyword (namespace channel)))

(defmulti publish!
  "Publishes messages to the appropriate backend for the transport type."
  {:arglists '([channel messages])}
  (fn [channel _messages] (transport-type channel)))

(defmulti on-listen!
  "Transport-type-specific hook called during listener registration.
   Returns a map of default opts for the transport type.
   Implementations may also perform side effects (e.g. subscribing to a topic backend)."
  {:arglists '([channel opts])}
  (fn [channel _opts] (transport-type channel)))

(defmulti wrap-listener
  "Wraps a listener function with transport-type-specific behavior.
   Queues return the listener as-is; topics add instrumentation."
  {:arglists '([channel listener])}
  (fn [channel _listener] (transport-type channel)))
