(ns metabase.notification.card
  (:require
   [metabase.events.core :as events]
   [metabase.notification.models :as models.notification]))

(defn card-notifications
  "The notifications of the alerts on `card`."
  [card]
  (models.notification/notifications-for-card (:id card)))

(defn notify-card-notifications-deleted!
  "Publishes `topic` so that the email recipients of `notifications`, the alerts of `card` that were deleted, hear of it."
  [topic actor card notifications]
  (when (seq notifications)
    (events/publish-event! topic {:card          card
                                  :actor         actor
                                  :notifications notifications})))
