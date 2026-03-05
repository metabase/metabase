(ns metabase.mq.core
  "Unified public API for the Metabase messaging subsystem.

  Two patterns are supported:

  **Queue** — single-consumer, at-least-once delivery.  Each message is processed by exactly
  one listener and removed after successful processing.  Failed messages are retried up to a
  configurable limit.

  **Topic** — single-consumer pub/sub.  Each active node receives every published message.
  There can be up to one listener per node for each topic. Failed messages are never retried.

  Listeners for both types are registered with `def-listener`

      (mq/def-listener :queue/simple-task [msg]
        (process msg))

      (mq/def-listener :topic/my-events [msg]
        (handle-event msg))

  For queues, a config map enables batching:
       (mq/def-listener :queue/my-task
         {:max-batch-messages 10 :max-next-ms 100}
         [messages]
         (process messages))

  Publishing is done using `with-queue` or `with-topic` which binds a queue you can put messages on.
  When the body finishes successfully, the message(s) in the bound queue actually publishes the messages.

      (with-queue :queue/simple-task [q]
        (put q message))

      (with-topic :topic/my-events [t]
        (put t payload))"
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.sync :as q.sync]
   [metabase.mq.topic.appdb :as topic.appdb]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.mq.topic.memory :as topic.memory]
   [metabase.mq.topic.sync :as topic.sync]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  q.appdb/keep-me
  q.memory/keep-me
  q.sync/keep-me
  topic.appdb/keep-me
  topic.memory/keep-me
  topic.sync/keep-me)

(p/import-vars
 [mq.impl
  put
  def-listener
  listen!
  register-listeners!
  unlisten!]

 [q.impl
  batch-listen!
  queue-length
  with-queue]

 [topic.impl
  with-topic])

(defn shutdown!
  "Shuts down all mq resources: clears listener registries, then delegates to
  backends for infrastructure cleanup."
  []
  ;; Clear listener registries
  (reset! q.impl/*listeners* {})
  (reset! topic.impl/*listeners* {})
  ;; Stop the background message manager
  (q.impl/stop-message-manager!)
  ;; Backend-specific infrastructure cleanup
  (q.backend/shutdown! q.backend/*backend*)
  (topic.backend/shutdown! topic.backend/*backend*))

