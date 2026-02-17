(ns metabase.pubsub.core
  "Public API for the pub/sub system. Provides topic-based fan-out messaging
  where every active subscriber receives every published message."
  (:require
   [metabase.pubsub.appdb :as ps.appdb]
   [metabase.pubsub.backend :as ps.backend]
   [metabase.pubsub.listener :as ps.listener]
   [metabase.pubsub.memory :as ps.memory]))

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
