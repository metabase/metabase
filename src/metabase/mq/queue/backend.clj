(ns metabase.mq.queue.backend
  "Backend abstraction for the message queue system.
  Each concrete backend (appdb, memory, sync) is a record implementing `QueueBackend`.")

(set! *warn-on-reflection* true)

(defprotocol QueueBackend
  "A queue backend handles durable storage, delivery, and retry semantics for queue messages."
  (publish!          [this queue-name messages]
    "Publishes messages to the given queue. `messages` is always a vector of messages.")
  (batch-successful! [this queue-name batch-id]
    "Marks a batch as successfully processed.")
  (batch-failed!     [this queue-name batch-id]
    "Marks a batch as failed and increments its failure count.")
  (start!            [this]
    "Starts the backend polling loop. Called once at init time.")
  (shutdown!         [this]
    "Shuts down all queue resources for this backend."))

(def ^:dynamic *backend*
  "The active `QueueBackend` instance. Set by `metabase.mq.init/start!`."
  nil)
