(ns metabase.mq.queue.impl
  "Internal implementation for the queue system: queue registry, validation,
  and message handling/listener logic."
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.util.log :as log]))

;; log is used by the with-queue macro expansion
(comment log/keep-me)

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Queue Registry -------------------------------------------

(defn define-queue!
  "Ensure the queue with the given name exists. Must be called before publishing or listening to the queue.
  The queue name must be namespaced to 'queue', e.g. :queue/test-queue."
  [queue-name]
  (when-not (= "queue" (namespace queue-name))
    (throw (ex-info "Queue name must be namespaced to 'queue', e.g. :queue/test-queue"
                    {:queue queue-name})))
  (when-not (contains? @q.backend/*defined-queues* queue-name)
    (swap! q.backend/*defined-queues* assoc queue-name {})))

(defn check-valid-queue
  "Throws an exception if the queue name is not valid or not defined."
  [queue-name]
  (when-not (= "queue" (namespace queue-name))
    (throw (ex-info "Queue name must be namespaced to 'queue'"
                    {:queue              queue-name
                     :expected-namespace "queue"})))
  (when-not (contains? @q.backend/*defined-queues* queue-name)
    (throw (ex-info "Queue not defined" {:queue queue-name}))))

(defn listen!
  "Registers a handler function for the given queue and starts listening.
  The handler will be called with a message map containing :queue, :batch-id, and :message keys.
  Throws if the queue is not defined or if a handler is already registered."
  [queue-name handler]
  (check-valid-queue queue-name)
  (when-not (nil? (get-in @q.backend/*defined-queues* [queue-name :handler]))
    (throw (ex-info "Queue handler already defined" {:queue queue-name})))
  (swap! q.backend/*defined-queues* update queue-name assoc :handler handler)
  (q.backend/listen! q.backend/*backend* queue-name))

(defn stop-listening!
  "Stops listening to the given queue and closes it."
  [queue-name]
  (check-valid-queue queue-name)
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
  `(do
     (check-valid-queue ~queue-name)
     (let [buffer# (atom [])
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
           (throw e#))))))

(defn clear-queue!
  "Deletes all persisted messages from the given queue.
  This is a destructive operation and should be used with caution. Mostly for testing."
  [queue-name]
  (check-valid-queue queue-name)
  (q.backend/clear-queue! q.backend/*backend* queue-name))

(defn queue-length
  "The number of messages in the queue."
  [queue-name]
  (check-valid-queue queue-name)
  (q.backend/queue-length q.backend/*backend* queue-name))
