(ns metabase.mq.transport
  "Thin dispatcher that routes channel operations to the queue backend.
  Selection is based on the channel keyword's namespace (`:queue/*`)."
  (:require
   [metabase.mq.queue.backend :as q.backend]))

(set! *warn-on-reflection* true)

(defn transport-type
  "Returns :queue for a namespaced channel keyword."
  [channel]
  (keyword (namespace channel)))

(defmulti on-listen!
  "Transport-specific hook invoked during listener registration. Returns a map of
  default opts for the transport and may perform side effects. Dispatched on `transport-type`."
  {:arglists '([channel opts])}
  (fn [channel _opts] (transport-type channel)))

(defn publish!
  "Publishes messages to the appropriate backend for the channel's transport type."
  [channel messages]
  (case (transport-type channel)
    :queue (q.backend/publish! q.backend/*backend* channel messages)))

(defn start!
  "Starts the backend for the given transport type (`:queue`)."
  [transport-type]
  (case transport-type
    :queue (q.backend/start! q.backend/*backend*)))

(defn shutdown!
  "Shuts down the backend for the given transport type (`:queue`)."
  [transport-type]
  (case transport-type
    :queue (q.backend/shutdown! q.backend/*backend*)))
