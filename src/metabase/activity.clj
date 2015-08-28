(ns metabase.activity
  (:require [clojure.core.async :as async]))

;;; ## ---------------------------------------- PUBLICATION ----------------------------------------


(def ^:private activity-channel
  "Channel to host activity publications."
  (async/chan))

(def ^:private activity-publication
  "Publication for general activity.
   Expects a map as input and the map must have a `:topic` key."
  (async/pub activity-channel #(:topic %)))

(defn publish-activity
  "Publish an item into the activity stream.  Returns the published item."
  [topic activity-item]
  {:pre [(keyword topic)]}
  (async/go (async/>! activity-channel {:topic (keyword topic) :item activity-item}))
  activity-item)


;;; ## ---------------------------------------- SUBSCRIPTION ----------------------------------------


(defn subscribe-to-activity
  "Subscribe to a given topic of the general activity stream.
   Expects a topic to subscribe to and a `core.async` channel."
  [topic channel]
  {:pre [(keyword topic)]}
  (async/sub activity-publication (keyword topic) channel))


;;; ## ---------------------------------------- ACTIVITY FEED ----------------------------------------


(def activity-feed-topics
  "The `Set` of topics which are subscribed to and included in the Metabase published activity feed."
  #{:card-create
    :card-update
    :dashboard-create
    :dashboard-update
    :dashboard-add-cards
    :dashboard-remove-cards
    :dashboard-reposition-cards})

(def ^:private activity-feed
  "channel for activity feed subscription."
  (async/chan))

;; create the core.async subscription for each of our activity-feed-topics
(loop [[topic & rest] (vec activity-feed-topics)]
  (subscribe-to-activity topic activity-feed)
  (when rest (recur rest)))

;; this is a placeholder for now
(defn take-and-print [channel prefix]
  (async/go-loop []
    (let [activity-item (async/<! channel)]
      (println "Activity:" (:topic activity-item))
      (clojure.pprint/pprint (:item activity-item))
      (recur))))

(take-and-print activity-feed "activity-feed")
