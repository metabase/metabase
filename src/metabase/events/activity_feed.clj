(ns metabase.events.activity-feed
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.events :as events]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.activity :as activity :refer [Activity]]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.table :as table]
            [metabase.query-processor :as qp]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [toucan.db :as db]))

(def ^:private activity-feed-topics
  "The set of event topics which are subscribed to for use in the Metabase activity feed."
  #{:alert-create
    :alert-delete
    :card-create
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
    :user-login}) ; this is only used these days the first time someone logs in to record 'user-joined' events

(defonce ^:private ^{:doc "Channel for receiving event notifications we want to subscribe to for the activity feed."}
  activity-feed-channel
  (async/chan))

;;; ------------------------------------------------ EVENT PROCESSING ------------------------------------------------

(defmulti ^:private process-activity!
  {:arglists '([model-name topic object])}
  (fn [model-name _ _]
    (keyword model-name)))

(defmethod process-activity! :default
  [model-name _ _]
  (log/warn (trs "Don''t know how to process event with model {0}" model-name)))

(defmethod process-activity! :card
  [_ topic {query :dataset_query, :as object}]
  (let [details-fn  #(select-keys % [:name :description])
        query       (when (seq query)
                      (try (qp/query->preprocessed query)
                           (catch Throwable e
                             (log/error e (tru "Error preprocessing query:")))))
        database-id (some-> query :database u/the-id)
        table-id    (mbql.u/query->source-table-id query)]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(defmethod process-activity! :dashboard
  [_ topic object]
  (let [create-delete-details
        #(select-keys % [:description :name])

        add-remove-card-details
        (fn [{:keys [dashcards] :as obj}]
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

(defmethod process-activity! :metric
  [_ topic object]
  (let [details-fn  #(select-keys % [:name :description :revision_message])
        table-id    (:table_id object)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(defmethod process-activity! :pulse
  [_ topic object]
  (let [details-fn #(select-keys % [:name])]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn)))

(defmethod process-activity! :alert
  [_ topic {:keys [card] :as alert}]
  (let [details-fn #(select-keys (:card %) [:name])]
    (activity/record-activity!
      ;; Alerts are centered around a card/question. Users always interact with the alert via the question
      :model       "card"
      :model-id    (:id card)
      :topic       topic
      :object      alert
      :details-fn  details-fn)))

(defmethod process-activity! :segment
  [_ topic object]
  (let [details-fn  #(select-keys % [:name :description :revision_message])
        table-id    (:table_id object)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(defmethod process-activity! :user
  [_ topic object]
  ;; we only care about login activity when its the users first session (a.k.a. new user!)
  (when (and (= :user-login topic)
             (:first_login object))
    (activity/record-activity!
      :topic    :user-joined
      :user-id  (:user_id object)
      :model-id (:user_id object))))

(defmethod process-activity! :install
  [& _]
  (when-not (db/exists? Activity :topic "install")
    (db/insert! Activity, :topic "install", :model "install")))

(defn process-activity-event!
  "Handle processing for a single event notification received on the activity-feed-channel"
  [activity-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic, object :item} activity-event]
      (process-activity! (keyword (events/topic->model topic)) topic object))
    (catch Throwable e
      (log/warn e (trs "Failed to process activity event {0}" (pr-str (:topic activity-event)))))))


;;; ---------------------------------------------------- LIFECYLE ----------------------------------------------------

(defmethod events/init! ::ActivityFeed
  [_]
  (events/start-event-listener! activity-feed-topics activity-feed-channel process-activity-event!))
