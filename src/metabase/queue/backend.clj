(ns metabase.queue.backend)

(defmulti flush!
  "Flushes the queue to the database. This is a no-op if the queue is empty."
  {:arglists '([queue-type queue-name buffer])}
  (fn [queue-type _queue-name _buffer]
    queue-type))

(defmulti queue-length
  "The number of unprocessed messages waiting in the queue.
  Does not include messages waiting to be persisted or messages currently being handled by a handler"
  {:arglists '([queue-type queue-name])}
  (fn [queue-type _queue-name]
    queue-type))

(defmulti listen!
  "Creates a queue with the given name. This is a no-op if the queue already exists. Returns queue name if created, nil if not created"
  {:arglists '([queue-type queue-name batch-handler])}
  (fn [queue-type _queue-name _batch-handler]
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
