(ns metabase.notification.card
  (:require
   [metabase.events.core :as events]
   [metabase.notification.models :as models.notification]))

(defn card-notifications
  "The notifications of the alerts on `card`."
  [card]
  (models.notification/notifications-for-card (:id card)))

(defn notify-card-notifications-deleted!
  "Announces that the alerts of `card`, whose `notifications` were deleted, stopped, because the Card was archived when
  `reason` is `:card-archived` and because it was changed when it is `:card-changed`, which has their recipients
  emailed."
  [reason actor card notifications]
  (when (seq notifications)
    (events/publish-event! (case reason
                             :card-archived :event/card-update.notification-deleted.card-archived
                             :card-changed  :event/card-update.notification-deleted.card-changed)
                           {:card          card
                            :actor         actor
                            :notifications notifications})))
