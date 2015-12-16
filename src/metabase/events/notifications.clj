(ns metabase.events.notifications
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.config :as config]
            [metabase.email.messages :as messages]
            [metabase.events :as events]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [dependency :refer [Dependency]]
                             [pulse :refer [Pulse]]
                             [pulse-card :refer [PulseCard]]
                             [user :as user])
            [metabase.util.urls :as urls]))


(def ^:const notifications-topics
  "The `Set` of event topics which are subscribed to for use in notifications tracking."
  #{:segment-update})

(def ^:private notifications-channel
  "Channel for receiving event notifications we want to subscribe to for notifications events."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn- send-user-segment-notification [segment updated-by user-id card-deps]
  (let [dash-deps  (when (seq card-deps)
                     (k/select Dashboard
                       (k/join DashboardCard (= :report_dashboardcard.dashboard_id :id))
                       (k/fields :id :name)
                       (k/where {:report_dashboardcard.card_id [in (mapv :id card-deps)]})))
        pulse-deps (when (seq card-deps)
                     (k/select Pulse
                       (k/join PulseCard (= :pulse_card.pulse_id :id))
                       (k/fields :id :name)
                       (k/where {:pulse_card.card_id [in (mapv :id card-deps)]})))
        send-to    (user/retrieve-user user-id)]
    (messages/send-notification-email
      (:email send-to)
      (:name segment)
      (:common_name updated-by)
      (:email updated-by)
      (mapv #(assoc % :url (urls/dashboard-url (:id %))) dash-deps)
      (mapv #(assoc % :url (urls/question-url (:id %))) card-deps)
      (mapv #(assoc % :url (urls/pulse-url (:id %))) pulse-deps)
      (:revision_message segment))))

(defn send-segment-notification [segment]
  ;; TODO: only if the definition changed??
  (let [card-deps  (k/select Card
                     (k/join Dependency (= :dependency.model_id :id))
                     (k/fields :id :name :creator_id)
                     (k/where {:dependency.model              "Card"
                               :dependency.dependent_on_model "Segment"
                               :dependency.dependent_on_id    (:id segment)}))]
    ;; if there aren't any dependent cards then no need to send out this notification
    (when (seq card-deps)
      (let [cards-by-user (group-by :creator_id card-deps)
            updated-by    (user/retrieve-user (events/object->user-id segment))]
        ;; send a separate email to each user containing just affected items they created
        (doseq [user-id (keys cards-by-user)]
          (send-user-segment-notification segment updated-by user-id (get cards-by-user user-id)))))))

(defn process-notifications-event
  "Handle processing for a single event notification received on the notifications-channel"
  [notification-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} notification-event]
      (case (events/topic->model topic)
        "segment" (send-segment-notification object)))
    (catch Throwable e
      (log/warn (format "Failed to process notifications event. %s" (:topic notification-event)) e))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


(defn events-init []
  (when-not (config/is-test?)
    (log/info "Starting notifications events listener")
    (events/start-event-listener notifications-topics notifications-channel process-notifications-event)))
