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

      (subscribe! :topic/my-events \"my-subscriber\" handler-fn)
      (with-topic :topic/my-events [t]
        (put t payload))

  Topics are auto-created on first publish or subscribe — no upfront registration is required."
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.topic.appdb :as topic.appdb]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.mq.topic.memory :as topic.memory]
   [metabase.mq.topic.postgres :as topic.postgres]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  q.appdb/keep-me
  q.memory/keep-me
  topic.appdb/keep-me
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
  cleanup!
  with-topic])

(defn init!
  "Checks the application database type and switches to the postgres backend when Postgres is in use.
  For H2 and MySQL, the default appdb backend is retained."
  []
  (when (= (mdb.connection/db-type) :postgres)
    (alter-var-root #'topic.backend/*backend* (constantly :topic.backend/postgres))
    (log/info "Topic backend set to postgres (PostgreSQL LISTEN/NOTIFY)")))

(defn stop!
  "Stops the postgres listener if it is running."
  []
  (topic.postgres/stop-listener!))

(defmethod startup/def-startup-logic! ::TopicInit
  [_]
  (init!))
