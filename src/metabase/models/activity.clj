(ns metabase.models.activity
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [korma.core :refer :all, :exclude [defentity update]]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.db :refer :all]
            [metabase.events :as events]
            (metabase.models [interface :refer :all]
                             [session :refer [Session]]
                             [user :refer [User]])
            [metabase.util :as u]))


;;; ## ---------------------------------------- ACTIVITY ENTITY ----------------------------------------


(defrecord ActivityFeedItemInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite ActivityFeedItemInstance :read :public-perms, :write :public-perms)


(defentity Activity
           [(table :activity)
            (types :details :json, :topic :keyword)]

           (pre-insert [_ {:keys [details] :as activity}]
                       (let [defaults {:timestamp (u/new-sql-timestamp)
                                       :details {}}]
                         (merge defaults activity)))

           (post-select [_ {:keys [user_id] :as activity}]
                        (map->ActivityFeedItemInstance (assoc activity :user (delay (User user_id))))))

(extend-ICanReadWrite ActivityEntity :read :public-perms, :write :public-perms)


;;; ## ---------------------------------------- ACTIVITY FEED ----------------------------------------


(def activity-feed-topics
  "The `Set` of event topics which are subscribed to for use in the Metabase activity feed."
  #{:card-create
    :card-update
    :card-delete
    :dashboard-create
    :dashboard-update
    :dashboard-delete
    :dashboard-add-cards
    :dashboard-remove-cards
    :dashboard-reposition-cards
    :database-sync-begin
    :database-sync-end
    :install
    :user-login})

(defn valid-activity-topic?
  "Predicate function that checks if a topic is in `activity-feed-topics`. true if included, false otherwise."
  [topic]
  (contains? activity-feed-topics (keyword topic)))

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
  ;; start listening for events we care about and do something with them
  (async/go-loop []
    ;; try/catch here to get possible exceptions thrown by core.async trying to read from the channel
    (try
      (process-activity-event (async/<! activity-feed-channel))
      (catch Exception e
        (log/error "Unexpected error listening on activity-feed-channel" e)))
    (recur)))

(defn- topic->model
  "Determine a valid `model` identifier for the given `topic`."
  [topic]
  {:pre [(valid-activity-topic? topic)]}
  ;; just take the first part of the topic name after splitting on dashes.
  (first (clojure.string/split (name topic) #"-")))

(defn- object->model-id
  "Determine the appropriate `model_id` (if possible) for a given `object`."
  [topic object]
  (if (contains? (set (keys object)) :id)
    (:id object)
    (let [model (topic->model topic)]
      (get object (keyword (format "%s_id" model))))))

(defn- process-card-activity
  ""
  [])

(defn- process-dashboard-activity
  ""
  [])

(defn- process-database-activity [topic object]
  (case topic
    :database-sync-begin (ins Activity
                           :topic :database-sync
                           :model (topic->model topic)
                           :model_id (object->model-id topic object)
                           :custom_id (:tracking-hash object)
                           :details (-> object
                                        (assoc :status "started")
                                        (dissoc :database_id :tracking-hash)))
    :database-sync-end (let [{activity-id :id} (sel :one Activity :custom_id (:tracking-hash object))]
                         (upd Activity activity-id
                           :details (-> object
                                        (assoc :status "completed")
                                        (dissoc :database_id :tracking-hash))))))

(defn- process-user-activity [topic object]
  ;; we only care about login activity when its the users first session (a.k.a. new user!)
  (when (and (= :user-login topic)
             (= (:session_id object) (sel :one :field [Session :id] :user_id (:user_id object))))
    (ins Activity
      :topic :user-joined
      :user_id (:user_id object)
      :model (topic->model topic))))

(defn- process-activity-event
  "Handle processing for a single event notification received on the activity-feed-channel"
  [activity-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} activity-event]
      (log/info "Activity:" topic)
      (clojure.pprint/pprint object)
      ;; TODO - we need a protocol on our Entities for providing relevant details
      (case (topic->model topic)
        "card"      (process-card-activity)
        "dashboard" (process-dashboard-activity)
        "database"  (process-database-activity topic object)
        "install"   (when-not (sel :one :fields [Activity :id])
                      (ins Activity :topic :install))
        "user"      (process-user-activity topic object)))
    (catch Exception e
      (log/warn (format "Failed to process activity event. %s" (:topic activity-event)) e))))
