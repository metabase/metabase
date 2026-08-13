(ns metabase.mq.transport
  "Thin dispatcher that routes channel operations to the queue backend.
  Selection is based on the channel keyword's namespace (`:queue/*`)."
  (:require
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.polling :as q.polling]))

(set! *warn-on-reflection* true)

(defn transport-type
  "Returns :queue for a namespaced channel keyword."
  [channel]
  (keyword (namespace channel)))

(defn publish-encoded!
  "Publishes an already-encoded `payload` string to the backend for `channel`'s transport type,
  then wakes the backend's poll loop so it picks the work up promptly."
  [channel payload]
  (let [backend q.backend/*backend*]
    (case (transport-type channel)
      :queue (do
               (q.backend/publish! backend channel payload)
               (q.polling/notify-on-publish! (:poll-context backend) channel))
      (throw (ex-info (format "Unknown transport for channel %s: expected a :queue/* channel" channel)
                      {:channel channel :transport-type (transport-type channel)})))))

(defn publish!
  "Publishes messages to the appropriate backend for the channel's transport type, then wakes the
  backend's poll loop so it picks the work up promptly. Messages are encoded to an opaque string
  payload here — once, upstream of every backend — so backends only move bytes around and every
  backend delivers an identical message shape."
  [channel messages]
  (publish-encoded! channel (payload/encode messages)))
