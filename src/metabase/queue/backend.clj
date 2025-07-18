(ns metabase.queue.backend)

(def ^:dynamic *backend*
  "Backend to use for the queue."
  :queue.backend/appdb)

(defmulti define-queue!
  "Defines a queue with the given name. This is a no-op if the queue already exists."
  {:arglists '([queue-type queue-name])}
  (fn [queue-type _queue-name]
    queue-type))

(defmulti publish!
  "Publishes the message to the queue given queue."
  {:arglists '([queue-type queue-name payload])}
  (fn [queue-type _queue-name _payload]
    queue-type))

(defmulti queue-length
  "The number of unprocessed messages waiting in the queue.
  Does not include messages currently being handled by a handler"
  {:arglists '([queue-type queue-name])}
  (fn [queue-type _queue-name]
    queue-type))

(defmulti listen!
  "Creates a queue with the given name. This is a no-op if the queue already exists. Returns queue name if created, nil if not created"
  {:arglists '([queue-type queue-name])}
  (fn [queue-type _queue-name]
    queue-type))

(defmulti clear-queue!
  "Deletes all persisted messages from the given queue. This is a destructive operation and should be used with caution."
  {:arglists '([queue-type queue-name])}
  (fn [queue-type _queue-name]
    queue-type))

(defmulti close-queue!
  "Closes the queue with the given name. This is a no-op if the queue does not exist."
  {:arglists '([queue-type queue-name])}
  (fn [queue-type _queue-name]
    queue-type))

(defmulti message-successful!
  "Mark a message as successfully processed"
  {:arglists '([queue-type queue-name message-id])}
  (fn [queue-type _queue-name _message-id]
    queue-type))

(defmulti message-failed!
  "Mark a message as failed and increment failure count"
  {:arglists '([queue-type queue-name message-id])}
  (fn [queue-type _queue-name _message-id]
    queue-type))
