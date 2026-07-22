(ns metabase.mq.core
  "Unified public API for the Metabase messaging subsystem.

  **Queue** — single-consumer, at-least-once delivery. A queue has exactly one registered listener,
  which is handed each message and removed after successful processing. Failed messages are retried
  up to a configurable limit.

  \"Single-consumer\" is about *registration*, not delivery: it means one handler per queue, not that
  a message is handled exactly once. Delivery is at-least-once, so a listener must be idempotent —
  see the `Idempotency` section of `metabase/mq/README.md`.

  A queue is declared once with `def-queue!` — this is the source of truth for what queues
  exist and where all queue config lives (exclusivity, batch size, dedup). The consumer-side
  handler is added with `def-listener!`. Splitting the two means publishers can route to
  queues declared anywhere and listeners can live on any node, with queue config taking
  effect at publish time on every node regardless of where listeners are registered.

      (mq/def-queue! :queue/simple-task {:transactional :try})
      (mq/def-listener! :queue/simple-task [messages]
        (doseq [msg messages] (process msg)))

  Queue-level config:
       (mq/def-queue! :queue/search-reindex {:transactional :require :exclusive true :max-batch-messages 50})
       (mq/def-listener! :queue/search-reindex [messages]
         (process-batch messages))

  See [[metabase.mq.queue.registry/def-queue!]] for the full set of queue options.

  Publishing is done using `with-queue` which binds a queue you can put messages on.
  When the body finishes successfully, the message(s) in the bound queue actually publishes the messages.

      (with-queue :queue/simple-task [q]
        (put q message))"
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.init :as mq.init]
   [metabase.mq.listener :as mq.listener]
   [metabase.mq.publish :as mq.publish]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.registry :as q.registry]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  mq.impl/keep-me
  mq.init/keep-me
  mq.listener/keep-me
  mq.publish/keep-me
  q.impl/keep-me
  q.memory/keep-me
  q.registry/keep-me)

(p/import-vars
 [mq.listener
  def-listener!
  register-listeners!
  unlisten!]
 [mq.publish
  put
  with-queue]
 [mq.impl
  last-activity]
 [mq.init
  start!
  stop!]
 [q.registry
  def-queue!])
