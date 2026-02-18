(ns metabase.mq.topic.impl
  "Internal implementation for the pub/sub system: public API functions
  with schema validation that delegate to the backend multimethods."
  (:require
   [metabase.mq.topic.backend :as tp.backend]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def :metabase.mq.topic/topic-name
  [:and :keyword [:fn {:error/message "Topic name must be namespaced to 'topic'"}
                  #(= "topic" (namespace %))]])

(mu/defn publish!
  "Publishes messages to the given topic. All active subscribers will receive them.
  `messages` is a vector of values stored as a JSON array in a single row."
  [topic-name :- :metabase.mq.topic/topic-name
   messages :- [:sequential :any]]
  (tp.backend/publish! tp.backend/*backend* topic-name messages))

(mu/defn subscribe!
  "Subscribes to a topic with the given subscriber name and handler function.
  The handler receives a map with `:id` and `:messages` keys for each row.
  Each node that subscribes receives every message published after subscribing."
  [topic-name :- :metabase.mq.topic/topic-name
   subscriber-name :- :string
   handler :- fn?]
  (tp.backend/subscribe! tp.backend/*backend* topic-name subscriber-name handler))

(mu/defn unsubscribe!
  "Unsubscribes from a topic, stopping the polling loop for this subscriber."
  [topic-name :- :metabase.mq.topic/topic-name
   subscriber-name :- :string]
  (tp.backend/unsubscribe! tp.backend/*backend* topic-name subscriber-name))

(mu/defn cleanup!
  "Removes messages older than `max-age-ms` milliseconds from the given topic."
  [topic-name :- :metabase.mq.topic/topic-name
   max-age-ms :- :int]
  (tp.backend/cleanup! tp.backend/*backend* topic-name max-age-ms))
