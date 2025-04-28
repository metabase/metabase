(ns metabase.queue.core
  "The cluster-wise persistent queue"
  (:require
   [metabase.queue.backend :as q.backend]
   [metabase.queue.memory :as q.memory]
   [metabase.queue.persistent :as q.persistent]
   [metabase.util.log :as log])
  (:import (clojure.lang Counted)))

(set! *warn-on-reflection* true)

(comment
  (q.memory/keep-me)
  (q.persistent/keep-me))

(def ^:private queues (atom {}))

(defprotocol QueueBuffer
  (put [this msg]
    "Put a message on the queue"))

(deftype ListQueueBuffer [buffer]
  QueueBuffer
  (put [_this msg]
    (swap! buffer conj msg))

  Counted
  (count [_this]
    (count @buffer)))

(defn- valid-queue
  "Returns the queue in the system and throws an exception if it doesn't."
  [queue-name]
  (let [queue (get @queues queue-name)]
    (if queue
      queue
      (throw (ex-info (str "Unknown queue: " queue-name) {:name queue-name})))))

(defn is-valid-queue? [queue-name]
  "Returns true if the queue is valid and false otherwise."
  (boolean (get @queues queue-name)))

(defn flush!
  "Flushes the queue to the database. This is a no-op if the queue is empty."
  [queue-name buffer]
  (let [{:keys [queue-type]} (valid-queue queue-name)]
    (q.backend/flush! queue-type queue-name buffer)))

(defmacro with-queue
  "Runs the body with the ability to add messages to the given queue"
  [queue-name [queue-binding] & body]
  `(let [~queue-binding (->ListQueueBuffer (atom []))]
     (when (is-valid-queue? ~queue-name)
       (try
         (do ~@body)
         (flush! ~queue-name @(.buffer ~queue-binding))
         (catch Exception e#
           (log/error e# "Error in queue processing, no messages will be persisted to the queue"))))))

(defn clear-queue!
  "Deletes all persisted messages from the given queue. This is a destructive operation and should be used with caution."
  [queue-name]
  (let [{:keys [queue-type]} (valid-queue queue-name)]
    (q.backend/clear-queue! queue-type queue-name)))

(defn queue-length
  [queue-name]
  (when-let [{:keys [queue-type]} (valid-queue queue-name)]
    (q.backend/queue-length queue-type queue-name)))

(defn- response-handler [{:keys [success error]} [status response]]
  "Handles the response from the queue. This is called by the queue backend when a batch is processed.
  If the queue is not defined, this is a no-op."
  (case status
    :success (success response {})
    :error (error response {})))

(defn create-queue!
  [queue-type queue-name batch-handler response-handlers]
  (assert (= "queue" (namespace queue-name)))
  (str "Queue name must be namespaced to 'queue', e.g. :queue/test-queue, but was " queue-name)
  (q.backend/create-queue! queue-type queue-name batch-handler (partial response-handler response-handlers))
  (swap! queues assoc queue-name {:queue-type      queue-type
                                  :queue-name      queue-name}))

(defn close-queue!
  [queue-name]
  (when-let [{:keys [queue-type]} (valid-queue queue-name)]
    (q.backend/close-queue! queue-type queue-name)))
