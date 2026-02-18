(ns metabase.mq.topic.backend
  "Backend abstraction layer for the pub/sub system.
  Defines multimethods that different pub/sub implementations must provide."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::backend
  [:enum :topic.backend/appdb :topic.backend/memory :topic.backend/postgres :topic.backend/tracking])

(def ^:dynamic *backend*
  "Dynamic var specifying which pub/sub backend to use.
  Default is `:topic.backend/appdb` for production database-backed pub/sub.
  Can be bound to `:topic.backend/memory` for testing."
  :topic.backend/appdb)

(def ^:dynamic *handlers*
  "Atom containing a map of [topic-name subscriber-name] -> handler-fn."
  (atom {}))

(defn get-handler
  "Returns the handler function for the given topic and subscriber, or nil if not registered."
  [topic-name subscriber-name]
  (get @*handlers* [topic-name subscriber-name]))

(defn register-handler!
  "Registers a handler function for the given topic and subscriber.
  Throws if a handler is already registered for this combination."
  [topic-name subscriber-name handler]
  (when (get-handler topic-name subscriber-name)
    (throw (ex-info "Handler already registered for topic and subscriber"
                    {:topic topic-name :subscriber subscriber-name})))
  (swap! *handlers* assoc [topic-name subscriber-name] handler))

(defn unregister-handler!
  "Removes the handler function for the given topic and subscriber."
  [topic-name subscriber-name]
  (swap! *handlers* dissoc [topic-name subscriber-name]))

(defmulti publish!
  "Publishes messages to the given topic. `messages` is a vector of values that will be JSON-encoded
  as an array and stored in a single row for batch efficiency."
  {:arglists '([backend topic-name messages])}
  (fn [backend _topic-name _messages]
    backend))

(defmulti subscribe!
  "Starts a polling loop for the given subscriber on the given topic.
  `handler` is a function that takes a single message map with `:batch-id` and `:messages` keys.
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
