(ns metabase.mq.queue.core
  "Work queue for cluster-wide task distribution.

  Use the queue when you need single-consumer, at-least-once delivery — each message is
  processed by exactly one handler, and removed from the queue after successful processing.
  Failed messages are retried up to a configurable limit before being marked as permanently failed.

  Typical flow:  (define-queue! :queue/my-task)
                 (listen! :queue/my-task handler-fn)
                 (publish! :queue/my-task payload)

  For event broadcast where every subscriber should receive every message, use
  [[metabase.mq.pubsub.core]] instead."
  (:require
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.listener :as q.listener]
   [metabase.mq.queue.memory :as q.memory]

   [metabase.util.log :as log]
   [potemkin :as p])
  (:import (clojure.lang Counted)))

(set! *warn-on-reflection* true)

(comment
  (q.memory/keep-me)
  (q.appdb/keep-me)
  (q.listener/keep-me)
  (q.impl/keep-me))

(p/import-vars
 [q.listener
  listen!]

 [q.impl
  define-queue!])

(defprotocol QueueBuffer
  "Protocol for buffering queue messages before publishing."
  (put [this msg]
    "Put a message on the queue buffer."))

(deftype ListQueueBuffer
         [^{:doc "Atom containing a vector of buffered messages."} buffer]

  QueueBuffer
  (put [_this msg]
    (swap! buffer conj msg))

  Counted
  (count [_this]
    (count @buffer)))

(defn publish!
  "Publishes message to the given queue."
  [queue-name message]
  (q.impl/check-valid-queue queue-name)
  (q.backend/publish! q.backend/*backend* queue-name [message]))

(defmacro with-queue
  "Runs the body with the ability to add messages to the given queue.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown."
  [queue-name [queue-binding] & body]
  `(do
     (q.impl/check-valid-queue ~queue-name)
     (let [~queue-binding (->ListQueueBuffer (atom []))]
       (try
         (let [result# (do ~@body)]
           (let [msgs# @(.buffer ~queue-binding)]
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
  (q.impl/check-valid-queue queue-name)
  (q.backend/clear-queue! q.backend/*backend* queue-name))

(defn queue-length
  "The number of messages in the queue."
  [queue-name]
  (q.impl/check-valid-queue queue-name)
  (q.backend/queue-length q.backend/*backend* queue-name))

(defn stop-listening!
  "Stops listening to the given queue and closes it."
  [queue-name]
  (q.impl/check-valid-queue queue-name)
  (q.backend/close-queue! q.backend/*backend* queue-name))
