(ns metabase.mq.transport
  "Thin dispatcher that routes channel operations to the queue backend.
  Selection is based on the channel keyword's namespace (`:queue/*`)."
  (:require
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.backend :as q.backend]))

(set! *warn-on-reflection* true)

(defn transport-type
  "Returns :queue for a namespaced channel keyword."
  [channel]
  (keyword (namespace channel)))

(defn publish!
  "Publishes messages to the appropriate backend for the channel's transport type.
  Messages are encoded to an opaque string payload here — once, upstream of every backend —
  so backends only move bytes around and every backend delivers an identical message shape."
  [channel messages]
  (let [encoded (payload/encode messages)]
    (case (transport-type channel)
      :queue (q.backend/publish! q.backend/*backend* channel encoded))))

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
