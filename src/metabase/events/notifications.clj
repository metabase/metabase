(ns metabase.events.notifications
  (:require [clojure.core.async :as async]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase.email.messages :as messages]
            [metabase.events :as events]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dependency :refer [Dependency]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [segment :refer [Segment]]
             [user :refer [User]]]
            [toucan.db :as db]))

(def ^:const notifications-topics
  "The `Set` of event topics which are subscribed to for use in notifications tracking."
  #{:metric-update
    :segment-update})

(def ^:private notifications-channel
  "Channel for receiving event notifications we want to subscribe to for notifications events."
  (async/chan))


;;; ------------------------------------------------ Event Processing ------------------------------------------------

(def ^:private model->entity
  {:Card      Card
   :Dashboard Dashboard
   :Metric    Metric
   :Pulse     Pulse
   :Segment   Segment})

(defn- add-objects-dependent-on-cards [deps-by-model]
  (if-not (contains? (set (keys deps-by-model)) "Card")
    ;; if we have no dependencies on cards then do nothing
    deps-by-model
    ;; otherwise pull out dependent card ids and add dashboard/pulse dependencies
    (let [card-ids (map :model_id (get deps-by-model "Card"))]
      (assoc deps-by-model
        "Dashboard" (when (seq card-ids)
                      (for [dashcard (db/select [DashboardCard :dashboard_id], :card_id [:in card-ids])]
                        (set/rename-keys dashcard {:dashboard_id :model_id})))
        "Pulse"     (when (seq card-ids)
                      (for [pulsecard (db/select [PulseCard :pulse_id], :card_id [:in card-ids])]
                        (set/rename-keys pulsecard {:pulse_id :model_id})))))))

(defn- pull-dependencies [model model-id]
  (when-let [deps (db/select [Dependency :model :model_id]
                    :dependent_on_model model
                    :dependent_on_id    model-id)]
    (let [deps-by-model     (add-objects-dependent-on-cards (group-by :model deps))
          deps-with-details (for [model (keys deps-by-model)
                                  :let  [ids (mapv :model_id (get deps-by-model model))]]
                              ;; TODO: this is slightly dangerous because we assume :name and :creator_id are available
                              (for [object (when (seq ids)
                                             (db/select [(model->entity (keyword model)) :id :name :creator_id]
                                               :id [:in ids]))]
                                (assoc object :model model)))]
      ;; we end up with a list of lists, so flatten before returning
      (flatten deps-with-details))))

(defn- send-notification-message! [user-id object updated-by deps]
  (let [recipient     (:email (User user-id))
        deps-by-model (group-by :model deps)]
    (messages/send-notification-email! recipient {:object       object
                                                   :updated-by   updated-by
                                                   :dependencies deps-by-model})))

(defn- send-notification! [model object]
  (when-let [deps (pull-dependencies model (:id object))]
    (let [deps-by-user (group-by :creator_id deps)
          updated-by   (User (events/object->user-id object))]
      ;; send a separate email to each user containing just affected items they created
      (doseq [user-id (keys deps-by-user)]
        (send-notification-message! user-id object updated-by (get deps-by-user user-id))))))

(defn- process-notifications-event!
  "Handle processing for a single event notification received on the notifications-channel"
  [notification-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} notification-event]
      ;; TODO: only if the definition changed??
      (case (events/topic->model topic)
        "metric"  (send-notification! "Metric" object)
        "segment" (send-notification! "Segment" object)))
    (catch Throwable e
      (log/warn (format "Failed to process notifications event. %s" (:topic notification-event)) e))))


;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(defn events-init
  "Automatically called during startup; start event listener for notifications events."
  []
  (events/start-event-listener! notifications-topics notifications-channel process-notifications-event!))
