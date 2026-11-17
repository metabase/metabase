(ns metabase.pulse.update-alerts
  ;; TODO this should be moved to notification
  (:require
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.notification.models :as models.notification]
   [metabase.pulse.db :as pulse.db]
   [metabase.util.malli :as mu]))

(defn- card-archived? [old-card new-card]
  (and (not (:archived old-card))
       (:archived new-card)))

(defn- line-area-bar? [display]
  (contains? #{:line :area :bar} display))

(defn- progress? [display]
  (= :progress display))

(defn- allows-rows-alert? [display]
  (not (contains? #{:line :bar :area :progress} display)))

(defn- display-change-broke-alert?
  "Alerts no longer make sense when the kind of question being alerted on significantly changes. Setting up an alert
  when a time series query reaches 10 is no longer valid if the question switches from a line graph to a table. This
  function goes through various scenarios that render an alert no longer valid"
  [{old-display :display} {new-display :display}]
  (when-not (= old-display new-display)
    (or
     ;; Did the alert switch from a table type to a line/bar/area/progress graph type?
     (and (allows-rows-alert? old-display)
          (or (line-area-bar? new-display)
              (progress? new-display)))
     ;; Switching from a line/bar/area to another type that is not those three invalidates the alert
     (and (line-area-bar? old-display)
          (not (line-area-bar? new-display)))
     ;; Switching from a progress graph to anything else invalidates the alert
     (and (progress? old-display)
          (not (progress? new-display))))))

(defn- goal-missing?
  "If we had a goal before, and now it's gone, the alert is no longer valid"
  [old-card new-card]
  (and
   (get-in old-card [:visualization_settings :graph.goal_value])
   (not (get-in new-card [:visualization_settings :graph.goal_value]))))

(mu/defn- multiple-breakouts?
  "If there are multiple breakouts and a goal, we don't know which breakout to compare to the goal, so it invalidates
  the alert"
  [{:keys [display], query :dataset_query, :as new-card} :- :metabase.queries.schema/card]
  (and (get-in new-card [:visualization_settings :graph.goal_value])
       (or (line-area-bar? display)
           (progress? display))
       (< 1 (count (lib/breakouts query)))))

(defn alerts-of-card-being-archived
  "The notifications of the alerts of `card`, which `card-updates` archive and the Card hooks then delete, or nil when
  they don't archive it."
  [card card-updates]
  (when (and (not (:archived card)) (:archived card-updates))
    (seq (models.notification/notifications-for-card (:id card)))))

(defn delete-alert-and-notify!
  "Removes all of the alerts and notifies all of the email recipients of the alerts change."
  [topic actor card]
  (when-let [card-notifications (seq (models.notification/notifications-for-card (:id card)))]
    (pulse.db/delete-notifications! (map :id card-notifications))
    (events/publish-event! topic {:card          card
                                  :actor         actor
                                  :notifications card-notifications})))

(defn- card-change-broke-alert?
  "Whether the change from `old-card` to `new-card` invalidates the alerts on the card."
  [old-card new-card]
  (or (display-change-broke-alert? old-card new-card)
      (goal-missing? old-card new-card)
      (multiple-breakouts? new-card)))

;;; TODO -- consider whether this should be triggered indirectly by an event e.g. `:event/card-update`
(defn delete-alerts-if-needed!
  "Delete alerts if the card has been changed in a way that invalidates the alert. The Card hooks delete the alerts of an
  archived card, so `archived-notifications`, which [[alerts-of-card-being-archived]] read before the update, only tell
  their recipients."
  [& {:keys [old-card new-card actor archived-notifications]}]
  (cond
    (card-archived? old-card new-card)
    (when (seq archived-notifications)
      (events/publish-event! :event/card-update.notification-deleted.card-archived
                             {:card          new-card
                              :actor         actor
                              :notifications archived-notifications}))

    (card-change-broke-alert? old-card new-card)
    (delete-alert-and-notify! :event/card-update.notification-deleted.card-changed actor new-card)

    ;; The change doesn't invalidate the alert, do nothing
    :else
    nil))

(defn delete-alerts-if-card-changed!
  "Delete alerts if the card has been changed in a way that invalidates the alert, other than by archiving it, which
  [[delete-alerts-if-needed!]] handles."
  [& {:keys [old-card new-card actor]}]
  (when (and (not (card-archived? old-card new-card))
             (card-change-broke-alert? old-card new-card))
    (delete-alert-and-notify! :event/card-update.notification-deleted.card-changed actor new-card)))
