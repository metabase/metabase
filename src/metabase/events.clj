(ns metabase.events
  "Provides a very simply event bus using `core.async` to allow publishing and subscribing to intersting
   topics happening throughout the Metabase system in a decoupled way."
  (:require [clojure.core.async :as async]))


;;; ## ---------------------------------------- PUBLICATION ----------------------------------------


(def ^:private events-channel
  "Channel to host events publications."
  (async/chan))

(def ^:private events-publication
  "Publication for general events channel.
   Expects a map as input and the map must have a `:topic` key."
  (async/pub events-channel #(:topic %)))

(defn publish-event
  "Publish an item into the events stream.
  Returns the published item to allow for chaining."
  [topic event-item]
  {:pre [(keyword topic)]}
  (async/go (async/>! events-channel {:topic (keyword topic) :item event-item}))
  event-item)


;;; ## ---------------------------------------- SUBSCRIPTION ----------------------------------------


(defn subscribe-to-topic
  "Subscribe to a given topic of the general events stream.
   Expects a topic to subscribe to and a `core.async` channel.
   Returns the channel to allow for chaining."
  [topic channel]
  {:pre [(keyword topic)]}
  (async/sub events-publication (keyword topic) channel)
  channel)

(defn subscribe-to-topics
  "Convenience method for subscribing to series of topics against a single channel."
  [topics channel]
  {:pre [(coll? topics)]}
  (loop [[topic & rest] (vec topics)]
    (subscribe-to-topic topic channel)
    (when rest (recur rest))))
