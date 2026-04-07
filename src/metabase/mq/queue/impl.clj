(ns metabase.mq.queue.impl
  "Internal implementation for the queue messaging system"
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.publish :as publish]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def :metabase.mq.queue/queue-name
  [:and :keyword [:fn {:error/message "Queue name must be namespaced to 'queue'"}
                  #(= "queue" (namespace %))]])

(defn exclusive?
  "Returns true if the given queue name is registered with `:exclusive true`."
  [queue-name]
  (:exclusive (listener/get-listener queue-name)))

(defn exclusive-queue-names
  "Returns the set of queue names (as strings) that are registered with `:exclusive true`."
  []
  (into #{}
        (comp (filter (fn [[_k v]] (:exclusive v)))
              (map (fn [[k _v]] (name k))))
        @listener/*listeners*))

(defmacro with-queue
  "Runs the body with the ability to add messages to the given queue.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown.

  When called inside a database transaction, messages are accumulated and published
  as a single batch after the transaction commits successfully. This prevents consumers
  from reading uncommitted data."
  [queue-name [queue-binding] & body]
  `(publish/with-buffer ~queue-name [~queue-binding] ~@body))
