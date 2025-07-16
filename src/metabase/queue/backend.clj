(ns metabase.queue.backend)

(defmulti publish!
  "Publishes the messages to the queue. This is a no-op if the message list is empty or nil."
  {:arglists '([queue-type queue-name messages])}
  (fn [queue-type _queue-name _messages]
    queue-type))

(defmulti queue-length
  "The number of unprocessed message _batches_ waiting in the queue.
  Since each batch can contain multiple messages, this is not the same as the number of messages in the queue.
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
