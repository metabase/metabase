(ns metabase.mq.topic.impl
  "Topic-specific implementation: on-listen! hook and topic schemas."
  (:require
   [metabase.mq.publish :as publish]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def :metabase.mq.topic/topic-name
  [:and :keyword [:fn {:error/message "Topic name must be namespaced to 'topic'"}
                  #(= "topic" (namespace %))]])

(defmacro with-topic
  "Runs the body with the ability to add messages to the given topic.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown.

  Outside a transaction, publishing is best-effort and fire-and-forget — if the body
  succeeds but `publish!` throws, the body's side effects will have already occurred.

  Inside a database transaction, messages are deferred and published as a single batch
  after the transaction commits successfully. This prevents consumers from seeing
  uncommitted data. If the transaction rolls back, the messages are discarded."
  [topic-name [buffer-binding] & body]
  `(publish/with-buffer ~topic-name [~buffer-binding] ~@body))
