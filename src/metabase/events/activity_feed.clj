(ns metabase.events.activity-feed
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [activity :refer [Activity], :as activity]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
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


(defn- process-card-activity! [topic object]
  (let [details-fn  #(select-keys % [:name :description])
        database-id (get-in object [:dataset_query :database])
        table-id    (get-in object [:dataset_query :query :source_table])]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(defn- process-dashboard-activity! [topic object]
  (let [create-delete-details #(select-keys % [:description :name])
        add-remove-card-details (fn [{:keys [dashcards] :as obj}]
                                  ;; we expect that the object has just a dashboard :id at the top level
                                  ;; plus a `:dashcards` attribute which is a vector of the cards added/removed
                                  (-> (db/select-one [Dashboard :description :name], :id (events/object->model-id topic obj))
                                      (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                                                          (-> (db/select-one [Card :name :description], :id card_id)
                                                              (assoc :id id)
                                                              (assoc :card_id card_id))))))]
    (activity/record-activity!
      :topic      topic
      :object     object
      :details-fn (case topic
                    :dashboard-create       create-delete-details
                    :dashboard-delete       create-delete-details
                    :dashboard-add-cards    add-remove-card-details
                    :dashboard-remove-cards add-remove-card-details))))

(defn- process-metric-activity! [topic object]
  (let [details-fn  #(select-keys % [:name :description :revision_message])
        table-id    (:table_id object)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(defn- process-pulse-activity! [topic object]
  (let [details-fn #(select-keys % [:name])]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn)))

(defn- process-segment-activity! [topic object]
  (let [details-fn  #(select-keys % [:name :description :revision_message])
        table-id    (:table_id object)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(defn- process-user-activity! [topic object]
  ;; we only care about login activity when its the users first session (a.k.a. new user!)
  (when (and (= :user-login topic)
             (:first_login object))
    (activity/record-activity!
      :topic    :user-joined
      :user-id  (:user_id object)
      :model-id (:user_id object))))

(defn- process-install-activity! [& _]
  (when-not (db/exists? Activity)
    (db/insert! Activity, :topic "install", :model "install")))

(def ^:private model->processing-fn
  {"card"      process-card-activity!
   "dashboard" process-dashboard-activity!
   "install"   process-install-activity!
   "metric"    process-metric-activity!
   "pulse"     process-pulse-activity!
   "segment"   process-segment-activity!
   "user"      process-user-activity!})

;; TODO - this should be renamed to `process-activity-event!`
(defn process-activity-event
  "Handle processing for a single event notification received on the activity-feed-channel"
  [activity-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic, object :item} activity-event]
      (if-let [f (model->processing-fn (events/topic->model topic))]
        (f topic object)
        (log/warn (format "Don't know how to process event with model '%s'."))))
    (catch Throwable e
      (log/warn (format "Failed to process activity event. %s" (:topic activity-event)) e))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


(defn events-init
  "Automatically called during startup; start the events listener for the activity feed."
  []
  (events/start-event-listener activity-feed-topics activity-feed-channel process-activity-event))
