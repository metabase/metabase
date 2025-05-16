(ns metabase.notification.card
  (:require
   [metabase.events.core :as events]
   [metabase.notification.models :as models.notification]
   [toucan2.core :as t2]))

(defn delete-card-notifications-and-notify!
  "Removes all of the alerts and notifies all of the email recipients of the alerts change."
  [topic actor card]
  (when-let [card-notifications (seq (models.notification/notifications-for-card (:id card)))]
    (t2/delete! :model/Notification :id [:in (map :id card-notifications)])
    (events/publish-event! topic {:card          card
                                  :actor         actor
                                  :notifications card-notifications})))
