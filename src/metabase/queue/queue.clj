(ns metabase.queue.queue
  "The cluster-wise persistent queue"
  (:require
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (clojure.lang Counted)
           (metabase.util.queue BatchedQueue)))

(set! *warn-on-reflection* true)

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

(defn clear-queue!
  "Deletes all persisted messages from the given queue. This is a destructive operation and should be used with caution."
  [queue-name]
  (t2/delete! :model/QueuePayload :queue_name (name queue-name)))

(defn queue-length
  "Returns the number of persisted messages (not rows of payload) which are waiting to be handled.

  NOTE: Does not include messages waiting to be persisted or messages currently being handled by a handler"
  [queue]
  (or
   (t2/select-one-fn :num [:model/QueuePayload [[:sum :num_messages] :num]] :queue_name (name queue))
   0))

(defn flush!
  "Flushes the thread-local buffer to the database.
   This should not normally be called, and should just be relied on to be called automatically."
  [queue messages]
  (t2/insert! :model/QueuePayload
              {:queue_name   (name queue)
               :num_messages (count messages)
               :payload      messages}))

(deftype BatchedPersistentQueue
         [queue-name]
  BatchedQueue
  (process-batch! [_this handler]
    (t2/with-transaction []
      (log/debugf "Checking for messages in queue %s" (name queue-name))
      (if-let [message (t2/query-one
                        [(str "select * from " (name (t2/table-name :model/QueuePayload))
                              " where queue_name = '" (name queue-name) "' order by id asc limit 1 for update skip locked")])]
        (let [payload (-> message :payload mi/json-out-with-keywordization)]
          (log/debugf "Processing batch of %d messages in queue %s" (count payload) (name queue-name))
          [(u/prog1 (handler payload)
             (let [del_count (t2/delete! :model/QueuePayload (:id message))]
               (when (= 0 del_count) (log/warnf "Message %d was already deleted from the queue. Likely error in concurrency handling" (:id message))))) (count payload)])
        (u/prog1 [nil 0]
          (log/debugf "No waiting messages in queue %s" (name queue-name))
          (Thread/sleep 1000))))))

(defmacro with-queue
  "Runs the body with the ability to add messages to the given queue"
  [queue-name [queue-binding] & body]
  `(let [~queue-binding (->ListQueueBuffer (atom []))]
     (try
       (do ~@body)
       (flush! ~queue-name @(.buffer ~queue-binding))
       (catch Exception e#
         (log/error e# "Error in queue processing, no messages will be persisted to the queue")))))
