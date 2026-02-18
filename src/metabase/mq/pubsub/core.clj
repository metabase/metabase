(ns metabase.mq.pubsub.core
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
   [metabase.mq.pubsub.appdb :as ps.appdb]
   [metabase.mq.pubsub.backend :as ps.backend]
   [metabase.mq.pubsub.listener :as ps.listener]
   [metabase.mq.pubsub.memory :as ps.memory]))

(set! *warn-on-reflection* true)

(comment
  ps.appdb/keep-me
  ps.memory/keep-me
  ps.listener/keep-me)

(defn publish!
  "Publishes messages to the given topic. All active subscribers will receive them.
  `messages` is a vector of values stored as a JSON array in a single row."
  [topic-name messages]
  (ps.backend/publish! ps.backend/*backend* topic-name messages))

(defn subscribe!
  "Subscribes to a topic with the given subscriber name and handler function.
  The handler receives a map with `:id` and `:messages` keys for each row.
  Each node that subscribes receives every message published after subscribing."
  [topic-name subscriber-name handler]
  (ps.backend/subscribe! ps.backend/*backend* topic-name subscriber-name handler))

(defn unsubscribe!
  "Unsubscribes from a topic, stopping the polling loop for this subscriber."
  [topic-name subscriber-name]
  (ps.backend/unsubscribe! ps.backend/*backend* topic-name subscriber-name))

(defn cleanup!
  "Removes messages older than `max-age-ms` milliseconds from the given topic."
  [topic-name max-age-ms]
  (ps.backend/cleanup! ps.backend/*backend* topic-name max-age-ms))
