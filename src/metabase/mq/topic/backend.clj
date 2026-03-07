(ns metabase.mq.topic.backend
  "Backend abstraction layer for the pub/sub system.
  Defines multimethods that different pub/sub implementations must provide.

  Topics are fire-and-forget: there is no retry logic. If a listener throws,
  the error is logged and the batch is skipped. This matches the semantics of
  the postgres LISTEN/NOTIFY backend where re-delivery is not possible."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::backend
  [:enum :topic.backend/appdb :topic.backend/memory :topic.backend/sync])

(def ^:dynamic *backend*
  "Dynamic var specifying which pub/sub backend to use.
  Default is `:topic.backend/appdb` for production database-backed pub/sub.
  Can be bound to `:topic.backend/memory` for testing."
  :topic.backend/appdb)

(defmulti publish!
  "Publishes messages to the given topic. `messages` is a vector of values that will be JSON-encoded
  as an array and stored in a single row for batch efficiency.
  Return the batch id of the messages published to avoid re-publishing locally."
  {:arglists '([backend topic-name messages])}
  (fn [backend _topic-name _messages]
    backend))

(defmulti start!
  "Starts the backend polling loop. Called once at init time.
  The backend polls `topic.impl/*listeners*` dynamically to discover registered topics."
  {:arglists '([backend])}
  identity)

(defmethod start! :default [_] nil)

(defmulti subscribe!
  "Internal operation: initializes backend state (offsets, channels) for a specific topic.
  Called by the polling loop when it discovers a new topic in `*listeners*`, not by `listen!`."
  {:arglists '([backend topic-name])}
  (fn [backend _topic-name]
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
