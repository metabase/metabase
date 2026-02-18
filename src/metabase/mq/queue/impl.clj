(ns metabase.mq.queue.impl
  "Internal implementation for the queue system: listener registration
  and message handling logic."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.util.log :as log]))

;; log is used by the with-queue macro expansion
(comment log/keep-me)

(set! *warn-on-reflection* true)

(defn listen!
  "Registers a handler function for the given queue and starts listening.
  The handler will be called with a message map containing :queue, :batch-id, and :message keys.
  Throws if the queue name is invalid or if a handler is already registered."
  [queue-name handler]
  (when-not (= "queue" (namespace queue-name))
    (throw (ex-info "Queue name must be namespaced to 'queue', e.g. :queue/test-queue"
                    {:queue queue-name})))
  (when (get @q.backend/*handlers* queue-name)
    (throw (ex-info "Queue handler already defined" {:queue queue-name})))
  (swap! q.backend/*handlers* assoc queue-name handler)
  (q.backend/listen! q.backend/*backend* queue-name))

(defn stop-listening!
  "Stops listening to the given queue and closes it."
  [queue-name]
  (q.backend/stop-listening! q.backend/*backend* queue-name))

(defprotocol QueueBuffer
  "Protocol for buffering queue messages before publishing."
  (put [this msg]
    "Put a message on the queue buffer."))

;;; ------------------------------------------- Public API -------------------------------------------

(defmacro with-queue
  "Runs the body with the ability to add messages to the given queue.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown."
  [queue-name [queue-binding] & body]
  `(let [buffer# (atom [])
         ~queue-binding (reify QueueBuffer
                          (put [_ msg#] (swap! buffer# conj msg#)))]
     (try
       (let [result# (do ~@body)]
         (let [msgs# @buffer#]
           (when (seq msgs#)
             (q.backend/publish! q.backend/*backend* ~queue-name msgs#)))
         result#)
       (catch Exception e#
         (log/error e# "Error in queue processing, no messages will be persisted to the queue")
         (throw e#)))))

(defn clear-queue!
  "Deletes all persisted messages from the given queue.
  This is a destructive operation and should be used with caution. Mostly for testing."
  [queue-name]
  (q.backend/clear-queue! q.backend/*backend* queue-name))

(defn queue-length
  "The number of message *batches* in the queue."
  [queue-name]
  (q.backend/queue-length q.backend/*backend* queue-name))
