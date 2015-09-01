(ns metabase.models.activity
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [korma.core :refer :all, :exclude [defentity update]]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.db :refer :all]
            [metabase.events :as events]
            (metabase.models [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [interface :refer :all]
                             [session :refer [Session]]
                             [table :refer [Table]]
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

           (post-select [_ {:keys [user_id database_id table_id] :as activity}]
                        (-> (map->ActivityFeedItemInstance activity)
                            (assoc :user (delay (User user_id)))
                            (assoc :database (delay (-> (Database database_id)
                                                        (select-keys [:id :name :description]))))
                            (assoc :table (delay (-> (Table table_id)
                                                     (select-keys [:id :name :description])))))))

(extend-ICanReadWrite ActivityEntity :read :public-perms, :write :public-perms)


;;; ## ---------------------------------------- ACTIVITY FEED ----------------------------------------


(def activity-feed-topics
  "The `Set` of event topics which are subscribed to for use in the Metabase activity feed."
  #{:card-create
    :card-update
    :card-delete
    :dashboard-create
    :dashboard-delete
    :dashboard-add-cards
    :dashboard-remove-cards
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


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


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

(defn- object->user-id
  "Determine the appropriate `user_id` (if possible) for a given `object`."
  [object]
  (or (:actor_id object) (:user_id object) (:creator_id object)))

(defn- record-activity
  "Simple base function for recording activity using defaults.
  Allows caller to specify a custom serialization function to apply to `object` to generate the activity `:details`."
  ([topic object details-fn database-table-fn]
   (let [{:keys [table-id database-id]} (when (fn? database-table-fn)
                                          (database-table-fn object))]
     (ins Activity
       :topic topic
       :user_id (object->user-id object)
       :model (topic->model topic)
       :model_id (object->model-id topic object)
       :database_id database-id
       :table_id table-id
       :custom_id (:custom_id object)
       :details (if (fn? details-fn)
                  (details-fn object)
                  object))))
  ([topic object details-fn]
   (record-activity topic object details-fn nil))
  ([topic object]
   (record-activity topic object nil)))

(defn- process-card-activity [topic object]
  (let [details-fn #(select-keys % [:name :description :public_perms])
        database-table-fn (fn [obj]
                            {:database-id (get-in obj [:dataset_query :database])
                             :table-id    (get-in obj [:dataset_query :query :source_table])})]
    (record-activity topic object details-fn database-table-fn)))

(defn- process-dashboard-activity [topic object]
  (let [create-delete-details #(select-keys % [:description :name :public_perms])
        add-remove-card-details (fn [{:keys [dashcards] :as obj}]
                                  ;; we expect that the object has just a dashboard :id at the top level
                                  ;; plus a `:dashcards` attribute which is a vector of the cards added/removed
                                  (-> (sel :one Dashboard :id (object->model-id topic obj))
                                      (select-keys [:description :name :public_perms])
                                      (assoc :dashcards (for [{:keys [id card_id card]} dashcards]
                                                          (-> @card
                                                              (select-keys [:name :description :public_perms])
                                                              (assoc :id id)
                                                              (assoc :card_id card_id))))))]
    (case topic
      :dashboard-create       (record-activity topic object create-delete-details)
      :dashboard-delete       (record-activity topic object create-delete-details)
      :dashboard-add-cards    (record-activity topic object add-remove-card-details)
      :dashboard-remove-cards (record-activity topic object add-remove-card-details))))

(defn- process-database-activity [topic object]
  (case topic
    :database-sync-begin (record-activity :database-sync object (fn [obj] (-> obj
                                                                              (assoc :status "started")
                                                                              (dissoc :database_id :custom_id))))
    :database-sync-end   (let [{activity-id :id} (sel :one Activity :custom_id (:custom_id object))]
                           (upd Activity activity-id
                             :details (-> object
                                          (assoc :status "completed")
                                          (dissoc :database_id :custom_id))))))

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
      (case (topic->model topic)
        "card"      (process-card-activity topic object)
        "dashboard" (process-dashboard-activity topic object)
        "database"  (process-database-activity topic object)
        "install"   (when-not (sel :one :fields [Activity :id])
                      (ins Activity :topic :install))
        "user"      (process-user-activity topic object)))
    (catch Exception e
      (log/warn (format "Failed to process activity event. %s" (:topic activity-event)) e))))
