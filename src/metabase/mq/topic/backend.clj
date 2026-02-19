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
  "Atom containing a map of topic-name -> handler-fn."
  (atom {}))

(defmulti publish!
  "Publishes messages to the given topic. `messages` is a vector of values that will be JSON-encoded
  as an array and stored in a single row for batch efficiency."
  {:arglists '([backend topic-name messages])}
  (fn [backend _topic-name _messages]
    backend))

(defmulti subscribe!
  "Starts a polling loop for the given topic.
  `handler` is a function that takes a single message map with `:batch-id` and `:messages` keys.
  Returns nil."
  {:arglists '([backend topic-name handler])}
  (fn [backend _topic-name _handler]
    backend))

(defmulti unsubscribe!
  "Stops the polling loop for the given topic."
  {:arglists '([backend topic-name])}
  (fn [backend _topic-name]
    backend))

(defmulti shutdown!
  "Shuts down all topic resources for this backend: unsubscribes all subscribers and releases any background threads."
  {:arglists '([backend])}
  identity)

(defmethod shutdown! :default [_] nil)
