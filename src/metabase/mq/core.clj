(ns metabase.mq.core
  "Unified public API for the Metabase messaging subsystem.

  Two patterns are supported:

  **Queue** — single-consumer, at-least-once delivery.  Each message is processed by exactly
  one handler and removed after successful processing.  Failed messages are retried up to a
  configurable limit.

      (listen! :queue/my-task handler-fn)
      (with-queue :queue/my-task [q]
        (put q message))

  **Topic** — fan-out pub/sub.  Every active subscriber receives every published message.
  Messages are fire-and-forget from the publisher's perspective.

      (subscribe! :topic/my-events handler-fn)
      (with-topic :topic/my-events [t]
        (put t payload))

  Topics are auto-created on first publish or subscribe — no upfront registration is required."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.mq.topic.memory :as topic.memory]
   [metabase.mq.topic.postgres :as topic.postgres]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  q.appdb/keep-me
  q.memory/keep-me
  topic.memory/keep-me
  topic.postgres/keep-me)

(p/import-vars
 [mq.impl
  put]

 [q.impl
  listen!
  with-queue
  clear-queue!
  queue-length
  stop-listening!]

 [topic.impl
  publish!
  subscribe!
  unsubscribe!
  with-topic])

(defn shutdown!
  "Shuts down all mq resources: stops all queue listeners and topic subscribers,
  clears handler registries, then delegates to backends for infrastructure cleanup."
  []
  ;; Stop all queue listeners and clear handlers
  (doseq [queue-name (keys @q.backend/*handlers*)]
    (q.backend/stop-listening! q.backend/*backend* queue-name))
  (reset! q.backend/*handlers* {})
  ;; Unsubscribe all topic subscribers and clear handlers
  (doseq [topic-name (keys @topic.backend/*handlers*)]
    (topic.backend/unsubscribe! topic.backend/*backend* topic-name))
  (reset! topic.backend/*handlers* {})
  ;; Backend-specific infrastructure cleanup
  (q.backend/shutdown! q.backend/*backend*)
  (topic.backend/shutdown! topic.backend/*backend*))

