(ns metabase.events.activity-feed
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [activity :refer [Activity], :as activity]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [interface :as models]
                             [session :refer [Session first-session-for-user]]
                             [table :as table])))


(def ^:const activity-feed-topics
  "The `Set` of event topics which are subscribed to for use in the Metabase activity feed."
  #{:card-create
    :card-update
    :card-delete
    :dashboard-create
    :dashboard-delete
    :dashboard-add-cards
    :dashboard-remove-cards
    :install
    :metric-create
    :metric-update
    :metric-delete
    :pulse-create
    :pulse-delete
    :segment-create
    :segment-update
    :segment-delete
    :user-login})

(def ^:private activity-feed-channel
  "Channel for receiving event notifications we want to subscribe to for the activity feed."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn- process-card-activity [topic object]
  (let [details-fn  #(select-keys % [:name :description :public_perms])
        database-id (get-in object [:dataset_query :database])
        table-id    (get-in object [:dataset_query :query :source_table])]
    (activity/record-activity
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(defn- process-dashboard-activity [topic object]
  (let [create-delete-details #(select-keys % [:description :name :public_perms])
        add-remove-card-details (fn [{:keys [dashcards] :as obj}]
                                  ;; we expect that the object has just a dashboard :id at the top level
                                  ;; plus a `:dashcards` attribute which is a vector of the cards added/removed
                                  (-> (db/sel :one [Dashboard :description :name :public_perms], :id (events/object->model-id topic obj))
                                      (assoc :dashcards (for [{:keys [id card_id], :as dashcard} dashcards]
                                                          (-> (db/sel :one [Card :name :description :public_perms], :id card_id)
                                                              (assoc :id id)
                                                              (assoc :card_id card_id))))))]
    (activity/record-activity
      :topic      topic
      :object     object
      :details-fn (case topic
                    :dashboard-create       create-delete-details
                    :dashboard-delete       create-delete-details
                    :dashboard-add-cards    add-remove-card-details
                    :dashboard-remove-cards add-remove-card-details))))

;; disabled for now as it's overly verbose in the feed
;(defn- process-database-activity [topic object]
;  (let [database            (db/sel :one Database :id (events/object->model-id topic object))
;        object              (merge object (select-keys database [:name :description :engine]))
;        database-details-fn (fn [obj] (-> obj
;                                          (assoc :status "started")
;                                          (dissoc :database_id :custom_id)))
;        database-table-fn   (fn [obj] {:database-id (events/object->model-id topic obj)})]
;    ;; NOTE: we are skipping any handling of activity for sample databases
;    (when (= false (:is_sample database))
;      (case topic
;        :database-sync-begin (record-activity :database-sync object database-details-fn database-table-fn)
;        :database-sync-end   (let [{activity-id :id} (db/sel :one Activity :custom_id (:custom_id object))]
;                               (db/upd Activity activity-id
;                                 :details (-> object
;                                              (assoc :status "completed")
;                                              (dissoc :database_id :custom_id))))))))

(defn- process-metric-activity [topic object]
  (let [details-fn  #(select-keys % [:name :description :revision_message])
        table-id    (:table_id object)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(defn- process-pulse-activity [topic object]
  (let [details-fn #(select-keys % [:name :public_perms])]
    (activity/record-activity
      :topic       topic
      :object      object
      :details-fn  details-fn)))

(defn- process-segment-activity [topic object]
  (let [details-fn  #(select-keys % [:name :description :revision_message])
        table-id    (:table_id object)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(defn- process-user-activity [topic object]
  ;; we only care about login activity when its the users first session (a.k.a. new user!)
  (when (and (= :user-login topic)
             (= (:session_id object) (first-session-for-user (:user_id object))))
    (activity/record-activity
      :topic    :user-joined
      :user-id  (:user_id object)
      :model-id (:user_id object))))

(defn process-activity-event
  "Handle processing for a single event notification received on the activity-feed-channel"
  [activity-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} activity-event]
      (case (events/topic->model topic)
        "card"      (process-card-activity topic object)
        "dashboard" (process-dashboard-activity topic object)
        "install"   (when-not (db/sel :one :fields [Activity :id])
                      (db/ins Activity :topic "install" :model "install"))
        "metric"    (process-metric-activity topic object)
        "pulse"     (process-pulse-activity topic object)
        "segment"   (process-segment-activity topic object)
        "user"      (process-user-activity topic object)))
    (catch Throwable e
      (log/warn (format "Failed to process activity event. %s" (:topic activity-event)) e))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


(defn events-init
  "Automatically called during startup; start the events listener for the activity feed."
  []
  (events/start-event-listener activity-feed-topics activity-feed-channel process-activity-event))
