(ns metabase.queue.core
  "The cluster-wide queue"
  (:require
   [metabase.queue.appdb :as q.appdb]
   [metabase.queue.backend :as q.backend]
   [metabase.queue.memory :as q.memory]
   [metabase.util.log :as log])
  (:import (clojure.lang Counted)))

(set! *warn-on-reflection* true)

(comment
  (q.memory/keep-me)
  (q.appdb/keep-me))

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

(def ^:dynamic *backend*
  "Backend to use for the queue."
  :queue.backend/appdb)

(defmacro with-queue
  "Runs the body with the ability to add messages to the given queue"
  [queue-name [queue-binding] & body]
  `(let [~queue-binding (->ListQueueBuffer (atom []))]
     (try
       (do ~@body)
       (q.backend/flush! *backend* ~queue-name @(.buffer ~queue-binding))
       (catch Exception e#
         (log/error e# "Error in queue processing, no messages will be persisted to the queue")))))

(defn clear-queue!
  "Deletes all persisted messages from the given queue.
  This is a destructive operation and should be used with caution. Mostly for testing."
  [queue-name]
  (q.backend/clear-queue! *backend* queue-name))

(defn queue-length
  "The number of messages in the queue."
  [queue-name]
  (q.backend/queue-length *backend* queue-name))

(defn- response-handler [{:keys [success error]} [status response]]
  (case status
    :success (success response {})
    :error (error response {})))

(defn listen!
  [queue-name batch-handler]
  (assert (= "queue" (namespace queue-name))
          (str "Queue name must be namespaced to 'queue', e.g. :queue/test-queue, but was " queue-name))
  (q.backend/listen! *backend* queue-name batch-handler))

(defn stop-listening!
  [queue-name]
  (q.backend/close-queue! *backend* queue-name))
