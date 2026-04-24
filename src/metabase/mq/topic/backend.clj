(ns metabase.mq.topic.backend
  "Backend abstraction for the pub/sub system.
  Each concrete backend (appdb, memory, sync) is a record implementing `TopicBackend`.

  Topics are fire-and-forget: there is no retry logic. If a listener throws, the error
  is logged and the batch is skipped. This matches the semantics of the LISTEN/NOTIFY
  backend where re-delivery is not possible.")

(set! *warn-on-reflection* true)

(defprotocol TopicBackend
  "A topic backend handles fire-and-forget pub/sub delivery."
  (publish!     [this topic-name messages]
    "Publishes messages to the given topic. Messages are a vector.")
  (subscribe!   [this topic-name]
    "Initializes backend state for a specific topic (offsets, channels, etc.).")
  (unsubscribe! [this topic-name]
    "Stops the polling loop / releases resources for the given topic.")
  (start!       [this]
    "Starts the backend polling loop. Called once at init time.")
  (shutdown!    [this]
    "Shuts down all topic resources for this backend."))

(def ^:dynamic *backend*
  "The active `TopicBackend` instance. Set by `metabase.mq.init/start!`."
  nil)
