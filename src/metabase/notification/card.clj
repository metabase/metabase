(ns metabase.notification.card
  (:require
   [metabase.events.core :as events]
   [metabase.notification.models :as models.notification]))

(defn card-notifications
  "The notifications of the alerts on `cards`, by the id of their Card."
  [cards]
  (models.notification/notifications-for-cards (mapv :id cards)))

(defn notify-card-notifications-deleted!
  "Announces in one event that the alerts of the Cards of `stopped`, each a `[card notifications]` pair of Cards and
  their deleted notifications, stopped, because the Cards were archived when `reason` is `:card-archived` and because
  they were changed when it is `:card-changed`, which has their recipients emailed."
  [reason actor stopped]
  (when-let [objects (not-empty (into [] (keep (fn [[card notifications]]
                                                 (when (seq notifications)
                                                   {:card card :notifications notifications})))
                                      stopped))]
    (events/publish-event! (case reason
                             :card-archived :event/card-update.notification-deleted.card-archived
                             :card-changed  :event/card-update.notification-deleted.card-changed)
                           {:objects objects
                            :actor   actor})))
