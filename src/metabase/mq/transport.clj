(ns metabase.mq.transport
  "Thin dispatcher that routes channel operations to the queue or topic backend.
  Selection is based on the channel keyword's namespace (`:queue/*` or `:topic/*`)."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.topic.backend :as topic.backend]))

(set! *warn-on-reflection* true)

(defn transport-type
  "Returns :queue or :topic for a namespaced channel keyword."
  [channel]
  (keyword (namespace channel)))

(defmulti on-listen!
  "Transport-specific hook invoked during listener registration. Returns a map of
  default opts for the transport and may perform side effects (e.g. subscribing to
  a topic backend). Dispatched on `transport-type`."
  {:arglists '([channel opts])}
  (fn [channel _opts] (transport-type channel)))

(defmulti wrap-listener
  "Transport-specific wrapper applied to a listener fn during registration.
  Dispatched on `transport-type`."
  {:arglists '([channel listener])}
  (fn [channel _listener] (transport-type channel)))

(defn publish!
  "Publishes messages to the appropriate backend for the channel's transport type."
  [channel messages]
  (case (transport-type channel)
    :queue (q.backend/publish!     q.backend/*backend*     channel messages)
    :topic (topic.backend/publish! topic.backend/*backend* channel messages)))

(defn start!
  "Starts the backend for the given transport type (`:queue` or `:topic`)."
  [transport-type]
  (case transport-type
    :queue (q.backend/start!     q.backend/*backend*)
    :topic (topic.backend/start! topic.backend/*backend*)))

(defn shutdown!
  "Shuts down the backend for the given transport type (`:queue` or `:topic`)."
  [transport-type]
  (case transport-type
    :queue (q.backend/shutdown!     q.backend/*backend*)
    :topic (topic.backend/shutdown! topic.backend/*backend*)))
