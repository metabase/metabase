(ns metabase.mq.topic.core
  "Pub/sub for topic-based fan-out messaging.

  Use pub/sub when every active subscriber should receive every published message — for example,
  broadcasting cache-invalidation events or config changes to all nodes in a cluster.
  Messages are fire-and-forget from the publisher's perspective; each subscriber independently
  tracks its read offset.

  Typical flow:  (subscribe! :topic/my-events \"my-subscriber\" handler-fn)
                 (publish! :topic/my-events [payload1 payload2])

  Topics are auto-created on first publish or subscribe — no upfront registration is required.

  For single-consumer work distribution where each message is processed by exactly one handler,
  use [[metabase.mq.queue.core]] instead."
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.mq.topic.appdb :as tp.appdb]
   [metabase.mq.topic.backend :as tp.backend]
   [metabase.mq.topic.impl :as tp.impl]
   [metabase.mq.topic.memory :as tp.memory]
   [metabase.mq.topic.postgres :as tp.postgres]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment
  tp.appdb/keep-me
  tp.memory/keep-me
  tp.postgres/keep-me)

(p/import-vars
 [tp.impl
  publish!
  subscribe!
  unsubscribe!
  cleanup!])

(defn init!
  "Checks the application database type and switches to the postgres backend when Postgres is in use.
  For H2 and MySQL, the default appdb backend is retained."
  []
  (when (= (mdb.connection/db-type) :postgres)
    (alter-var-root #'tp.backend/*backend* (constantly :topic.backend/postgres))
    (log/info "Topic backend set to postgres (PostgreSQL LISTEN/NOTIFY)")))

(defn stop!
  "Stops the postgres listener if it is running."
  []
  (tp.postgres/stop-listener!))

(defmethod startup/def-startup-logic! ::TopicInit
  [_]
  (init!))
