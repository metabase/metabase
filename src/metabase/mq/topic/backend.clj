(ns metabase.mq.topic.backend
  "Backend abstraction for the pub/sub system.
  Each concrete backend (appdb, memory, sync) is a record implementing `TopicBackend`.

  Topics are fire-and-forget: there is no retry logic. If a listener throws, the error
  is logged and the batch is skipped. This matches the semantics of the LISTEN/NOTIFY
  backend where re-delivery is not possible.")

(set! *warn-on-reflection* true)

(defprotocol TopicBackend
  "A topic backend handles fire-and-forget pub/sub delivery.

  The lifecycle is two-phased:
   1. `start-receiving!` is called per topic, very early in startup. It pins the read
      position / registers the subscription with the broker. From this point forward,
      messages published to this topic are retained for this consumer.
   2. `start-handling!` is called once per backend, very late in startup. It begins
      polling / consuming and delivering retained messages to registered handlers."
  (publish!         [this topic-name messages]
    "Publishes messages to the given topic. Messages are a vector.")
  (start-receiving! [this topic-name]
    "Idempotent. Pin the read position / register the subscription with the broker for
     `topic-name`. After this call, messages published to the topic are retained for
     this consumer but are not yet delivered to handlers.")
  (start-handling!  [this]
    "Begins polling / consuming. Delivers retained messages — from the read position
     pinned by `start-receiving!` onward — to registered handlers. Called once at init
     time, after `start-receiving!` has been called for all topics that have listeners.")
  (unsubscribe!     [this topic-name]
    "Stops receiving for the given topic and tears down the handler-side state — releases
     resources, forgets the read position, and removes any associated subscription with the
     broker..")
  (shutdown!        [this]
    "Shuts down all topic resources for this backend."))

(def ^:dynamic *backend*
  "The active `TopicBackend` instance. Set by `metabase.mq.init/start!`."
  nil)
