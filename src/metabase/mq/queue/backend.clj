(ns metabase.mq.queue.backend
  "Backend abstraction layer for the message queue system.
  Defines multimethods that different queue implementations must provide."
  (:require
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *backend*
  "Dynamic var specifying which queue backend to use.
  Default is `:queue.backend/appdb` for production database-backed queues.
  Can be bound to `:queue.backend/memory` for testing."
  :queue.backend/appdb)

(def ^:dynamic *handlers*
  "Atom containing a map of queue-name → handler fn. Backend-agnostic."
  (atom {}))

(defmulti publish!
  "Publishes messages to the given queue. `messages` is always a vector of messages."
  {:arglists '([backend queue-name messages])}
  (fn [backend _queue-name _messages]
    backend))

(defmulti queue-length
  "The number of unprocessed *batches* waiting in the queue.
  Does not include batches currently being handled by a handler"
  {:arglists '([backend queue-name])}
  (fn [backend _queue-name]
    backend))

(defmulti listen!
  "Ensures the queue exists and starts listening for messages on it.
  Creates the queue if it doesn't already exist, then begins processing."
  {:arglists '([backend queue-name])}
  (fn [backend _queue-name]
    backend))

(defmulti clear-queue!
  "Deletes all persisted messages from the given queue. This is a destructive operation and should be used with caution."
  {:arglists '([backend queue-name])}
  (fn [backend _queue-name]
    backend))

(defmulti stop-listening!
  "Stops listening on the queue with the given name. This is a no-op if the queue does not exist."
  {:arglists '([backend queue-name])}
  (fn [backend _queue-name]
    backend))

(defmulti batch-successful!
  "Mark a batch as successfully processed"
  {:arglists '([backend queue-name batch-id])}
  (fn [backend _queue-name _batch-id]
    backend))

(defmulti batch-failed!
  "Mark a batch as failed and increment failure count"
  {:arglists '([backend queue-name batch-id])}
  (fn [backend _queue-name _batch-id]
    backend))

(defn handle!
  "Handles a batch of messages from the queue by invoking the registered handler for each.
  On success, marks the batch as successful. On failure, marks it as failed
  and logs the error."
  [backend queue-name batch-id messages]
  (let [handler (get @*handlers* queue-name)]
    (try
      (when-not handler
        (throw (ex-info "No handler defined for queue" {:queue queue-name :backend backend})))
      (doseq [message messages]
        (handler {:batch-id batch-id :queue queue-name :message message}))
      (log/info "Handled queue message" {:queue queue-name :batch-id batch-id})
      (batch-successful! backend queue-name batch-id)
      (catch Exception e
        (log/error e "Error handling queue message" {:queue queue-name :batch-id batch-id :backend backend})
        (batch-failed! backend queue-name batch-id)))))
