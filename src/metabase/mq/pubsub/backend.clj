(ns metabase.mq.pubsub.backend
  "Backend abstraction layer for the pub/sub system.
  Defines multimethods that different pub/sub implementations must provide.")

(set! *warn-on-reflection* true)

(def ^:dynamic *backend*
  "Dynamic var specifying which pub/sub backend to use.
  Default is `:mq.pubsub.backend/appdb` for production database-backed pub/sub.
  Can be bound to `:mq.pubsub.backend/memory` for testing."
  :mq.pubsub.backend/appdb)

(defmulti publish!
  "Publishes messages to the given topic. `messages` is a vector of values that will be JSON-encoded
  as an array and stored in a single row for batch efficiency."
  {:arglists '([backend topic-name messages])}
  (fn [backend _topic-name _messages]
    backend))

(defmulti subscribe!
  "Starts a polling loop for the given subscriber on the given topic.
  `handler` is a function that takes a single message map with `:id` and `:messages` keys.
  Returns nil."
  {:arglists '([backend topic-name subscriber-name handler])}
  (fn [backend _topic-name _subscriber-name _handler]
    backend))

(defmulti unsubscribe!
  "Stops the polling loop for the given subscriber on the given topic."
  {:arglists '([backend topic-name subscriber-name])}
  (fn [backend _topic-name _subscriber-name]
    backend))

(defmulti cleanup!
  "Deletes messages older than `max-age-ms` milliseconds from the given topic."
  {:arglists '([backend topic-name max-age-ms])}
  (fn [backend _topic-name _max-age-ms]
    backend))
