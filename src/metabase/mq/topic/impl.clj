(ns metabase.mq.topic.impl
  "Internal implementation for the pub/sub system"
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;; log is used by the with-topic macro expansion
(comment log/keep-me)

(set! *warn-on-reflection* true)

(mr/def :metabase.mq.topic/topic-name
  [:and :keyword [:fn {:error/message "Topic name must be namespaced to 'topic'"}
                  #(= "topic" (namespace %))]])

(mu/defn publish!
  "Publishes messages to the given topic. All active subscribers will receive them.
  `messages` is a vector of values stored as a JSON array in a single row."
  [topic-name :- :metabase.mq.topic/topic-name
   messages :- [:sequential :any]]
  (topic.backend/publish! topic.backend/*backend* topic-name messages))

(mu/defn subscribe!
  "Subscribes to a topic with the given subscriber name and handler function.
  The handler receives a map with `:batch-id` and `:messages` keys for each row.
  Each node that subscribes receives every message published after subscribing."
  [topic-name :- :metabase.mq.topic/topic-name
   subscriber-name :- :string
   handler :- fn?]
  (topic.backend/subscribe! topic.backend/*backend* topic-name subscriber-name handler))

(mu/defn unsubscribe!
  "Unsubscribes from a topic, stopping the polling loop for this subscriber."
  [topic-name :- :metabase.mq.topic/topic-name
   subscriber-name :- :string]
  (topic.backend/unsubscribe! topic.backend/*backend* topic-name subscriber-name))

(mu/defn cleanup!
  "Removes messages older than `max-age-ms` milliseconds from the given topic."
  [topic-name :- :metabase.mq.topic/topic-name
   max-age-ms :- :int]
  (topic.backend/cleanup! topic.backend/*backend* topic-name max-age-ms))

(defmacro with-topic
  "Runs the body with the ability to add messages to the given topic.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown."
  [topic-name [buffer-binding] & body]
  `(let [buffer# (atom [])
         ~buffer-binding (reify mq.impl/MessageBuffer
                           (put [_ msg#] (swap! buffer# conj msg#)))]
     (try
       (let [result# (do ~@body)]
         (let [msgs# @buffer#]
           (when (seq msgs#)
             (topic.backend/publish! topic.backend/*backend* ~topic-name msgs#)))
         result#)
       (catch Exception e#
         (log/error e# "Error in topic processing, no messages will be published to the topic")
         (throw e#)))))
