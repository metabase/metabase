(ns metabase.mq.queue.impl
  "Publish-surface helpers for the queue messaging system.

  Queue declarations (the [[metabase.mq.queue.registry/def-queue!]] macro and `*queues*`
  registry) live in their own namespace so they can be referenced from `metabase.mq.listener`
  without forming a cycle through `metabase.mq.publish`."
  (:require
   [metabase.mq.publish :as publish]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def :metabase.mq.queue/queue-name
  [:and :keyword [:fn {:error/message "Queue name must be namespaced to 'queue'"}
                  #(= "queue" (namespace %))]])

(defmacro with-queue
  "Runs the body with the ability to add messages to the given queue.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown.

  When called inside a database transaction, messages are accumulated and published
  as a single batch after the transaction commits successfully. This prevents consumers
  from reading uncommitted data."
  [queue-name [queue-binding] & body]
  `(publish/with-buffer ~queue-name [~queue-binding] ~@body))
