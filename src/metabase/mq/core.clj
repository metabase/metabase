(ns metabase.mq.core
  "Unified public API for the Metabase messaging subsystem.

  Two patterns are supported:

  **Queue** — single-consumer, at-least-once delivery.  Each message is processed by exactly
  one listener and removed after successful processing.  Failed messages are retried up to a
  configurable limit.

  **Topic** — single-consumer pub/sub.  Each active node receives every published message.
  There can be up to one listener per node for each topic. Failed messages are never retried.

  Listeners for both types are declared with `def-listener!`. The macro adds the listener
  to a registry; `mq.init/start!` later activates everything in that registry at the right
  point in startup. The listener body always receives a vec of messages — use
  `(doseq [m messages] ...)` for per-message processing.

      (mq/def-listener! :queue/simple-task [messages]
        (doseq [msg messages] (process msg)))

      (mq/def-listener! :topic/my-events [messages]
        (doseq [msg messages] (handle-event msg)))

  Optional config controls batch size, exclusivity, and dedup:
       (mq/def-listener! :queue/my-task
         {:max-batch-messages 10 :exclusive true}
         [messages]
         (process-batch messages))

  See [[metabase.mq.listener/def-listener!]] for the full set of options and the rationale
  behind the deferred-registration design.

  Publishing is done using `with-queue` or `with-topic` which binds a queue you can put messages on.
  When the body finishes successfully, the message(s) in the bound queue actually publishes the messages.

      (with-queue :queue/simple-task [q]
        (put q message))

      (with-topic :topic/my-events [t]
        (put t payload))"
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.init :as mq.init]
   [metabase.mq.listener :as mq.listener]
   [metabase.mq.publish :as mq.publish]
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.transport-impl :as q.transport-impl]
   [metabase.mq.topic.appdb :as topic.appdb]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.mq.topic.memory :as topic.memory]
   [metabase.mq.topic.transport-impl :as topic.transport-impl]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  mq.impl/keep-me
  mq.init/keep-me
  mq.listener/keep-me
  mq.publish/keep-me
  q.appdb/keep-me
  q.impl/keep-me
  q.memory/keep-me
  q.transport-impl/keep-me
  topic.appdb/keep-me
  topic.impl/keep-me
  topic.memory/keep-me
  topic.transport-impl/keep-me)

(p/import-vars
 [mq.listener
  def-listener!
  register-listeners!
  unlisten!]

 [mq.publish
  put]

 [mq.impl
  last-activity]

 [mq.init
  start!
  start-receiving!
  stop!]

 [q.impl
  with-queue]

 [topic.impl
  with-topic])
