(ns metabase.notification.card
  (:require
   [metabase.events.core :as events]
   [metabase.notification.db :as notification.db]
   [metabase.notification.models :as models.notification]))

(defn delete-card-notifications-and-notify!
  "Removes all of the alerts and notifies all of the email recipients of the alerts change."
  [topic actor card]
  (when-let [card-notifications (seq (models.notification/notifications-for-card (:id card)))]
    (notification.db/delete-notifications! (map :id card-notifications))
    (events/publish-event! topic {:card          card
                                  :actor         actor
                                  :notifications card-notifications})))
