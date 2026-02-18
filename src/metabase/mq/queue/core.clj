(ns metabase.mq.queue.core
  "Work queue for cluster-wide task distribution.

  Use the queue when you need single-consumer, at-least-once delivery — each message is
  processed by exactly one handler, and removed from the queue after successful processing.
  Failed messages are retried up to a configurable limit before being marked as permanently failed.

  Typical flow:  (listen! :queue/my-task handler-fn)
                 (with-queue :queue/my-task [q]
                   (put q message))

  For event broadcast where every subscriber should receive every message, use
  [[metabase.mq.topic.core]] instead."
  (:require
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.memory :as q.memory]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  q.impl/keep-me
  q.memory/keep-me
  q.appdb/keep-me)

(p/import-vars
 [q.impl
  listen!
  put
  with-queue
  clear-queue!
  queue-length
  stop-listening!])
