(ns metabase.events.activity-feed
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.db :as db]
            [metabase.config :as config]
            [metabase.events :as events]
            (metabase.models [activity :refer [Activity]]
                             [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [session :refer [Session first-session-for-user]])))


(def activity-feed-topics
  "The `Set` of event topics which are subscribed to for use in the Metabase activity feed."
  #{:card-create
    :card-update
    :card-delete
    :dashboard-create
    :dashboard-delete
    :dashboard-add-cards
    :dashboard-remove-cards
    :install
    :user-login})

(def ^:private activity-feed-channel
  "Channel for receiving event notifications we want to subscribe to for the activity feed."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn- record-activity
  "Simple base function for recording activity using defaults.
  Allows caller to specify a custom serialization function to apply to `object` to generate the activity `:details`."
  ([topic object details-fn database-table-fn]
   (let [{:keys [table-id database-id]} (when (fn? database-table-fn)
                                          (database-table-fn object))]
     (db/ins Activity
          :topic topic
          :user_id (events/object->user-id object)
          :model (events/topic->model topic)
          :model_id (events/object->model-id topic object)
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
                                  (-> (db/sel :one Dashboard :id (events/object->model-id topic obj))
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

(defn- process-user-activity [topic object]
  ;; we only care about login activity when its the users first session (a.k.a. new user!)
  (when (and (= :user-login topic)
             (= (:session_id object) (first-session-for-user (:user_id object))))
    (db/ins Activity
      :topic    :user-joined
      :user_id  (:user_id object)
      :model    (events/topic->model topic)
      :model_id (:user_id object))))

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
        "user"      (process-user-activity topic object)))
    (catch Throwable e
      (log/warn (format "Failed to process activity event. %s" (:topic activity-event)) e))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


(defn events-init []
  (when-not (config/is-test?)
    (log/info "Starting activity-feed events listener")
    (events/start-event-listener activity-feed-topics activity-feed-channel process-activity-event)))
