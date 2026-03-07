(ns metabase.mq.queue.backend
  "Backend abstraction layer for the message queue system.
  Defines multimethods that different queue implementations must provide."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::backend
  [:enum :queue.backend/appdb :queue.backend/memory :queue.backend/sync])

(def ^:dynamic *backend*
  "Dynamic var specifying which queue backend to use.
  Default is `:queue.backend/appdb` for production database-backed queues.
  Can be bound to `:queue.backend/memory` for testing."
  :queue.backend/appdb)

(defmulti publish!
  "Publishes messages to the given queue. `messages` is always a vector of messages."
  {:arglists '([backend queue-name messages])}
  (fn [backend _queue-name _messages]
    backend))

(defmulti queue-length
  "The number of unprocessed *bundles* waiting in the queue.
  Does not include bundles currently being handled by a listener"
  {:arglists '([backend queue-name])}
  (fn [backend _queue-name]
    backend))

(defmulti bundle-successful!
  "Mark a bundle as successfully processed"
  {:arglists '([backend queue-name bundle-id])}
  (fn [backend _queue-name _bundle-id]
    backend))

(defmulti bundle-failed!
  "Mark a bundle as failed and increment failure count"
  {:arglists '([backend queue-name bundle-id])}
  (fn [backend _queue-name _bundle-id]
    backend))

(defmulti start!
  "Starts the backend polling loop. Called once at init time.
  The backend polls `q.impl/*listeners*` dynamically to discover registered queues."
  {:arglists '([backend])}
  identity)

(defmethod start! :default [_] nil)

(defmulti shutdown!
  "Shuts down all queue resources for this backend: stops all listeners and releases any background threads."
  {:arglists '([backend])}
  identity)

(defmethod shutdown! :default [_] nil)
