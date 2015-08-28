(ns metabase.models.activity
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [korma.core :refer :all, :exclude [defentity update]]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.db :refer :all]
            [metabase.events :as events]
            (metabase.models [interface :refer :all]
                             [user :refer [User]])))


;;; ## ---------------------------------------- ACTIVITY ENTITY ----------------------------------------


(defrecord ActivityFeedItemInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite ActivityFeedItemInstance :read :public-perms, :write :public-perms)


(defentity ActivityFeedItem
           [(table :activity_feed)
            timestamped]

           (post-select [_ {:keys [user_id] :as feed-item}]
                        (map->ActivityFeedItemInstance (assoc feed-item :user (delay (User user_id))))))

(extend-ICanReadWrite ActivityFeedItemEntity :read :public-perms, :write :public-perms)


;;; ## ---------------------------------------- ACTIVITY FEED ----------------------------------------


(def activity-feed-topics
  "The `Set` of topics which are subscribed to and included in the Metabase published activity feed."
  #{:card-create
    :card-update
    :card-delete
    :dashboard-create
    :dashboard-update
    :dashboard-delete
    :dashboard-add-cards
    :dashboard-remove-cards
    :dashboard-reposition-cards})

(def ^:private activity-feed-channel
  "Channel for receiving event notifications we want to subscribe to for the activity feed."
  (async/chan))

(declare process-activity-event)

(defn start-activity-feed
  "Initialize the Activity Feed.  This handles and setup required to bootstrap the activity feed system."
  []
  (log/info "Starting up Metabase activity feed and listening for things of interest!")
  ;; create the core.async subscription for each of our activity-feed-topics
  (events/subscribe-to-topics activity-feed-topics activity-feed-channel)
  ;; start listening for events we care about and does something with them
  (async/go-loop []
    ;; try/catch here to get possible exceptions thrown by core.async trying to read from the channel
    (try
      (process-activity-event (async/<! activity-feed-channel))
      (catch Exception e
        (log/error "Unexpected error listening on activity-feed-channel" e)))
    (recur)))

(defn- process-activity-event
  "Handle processing for a single event notification received on the activity-feed-channel"
  [activity-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} activity-event]
      ;; TODO - real work will include inserting new Activity entries based on the object
      (log/info "Activity:" topic)
      (clojure.pprint/pprint object))
    (catch Exception e
      (log/warn (format "Failed to process activity event. %s" (:topic activity-event)) e))))
