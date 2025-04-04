(ns metabase.pulse.update-alerts
  ;; TODO this should be moved to notification
  (:require
   [metabase.events :as events]
   [metabase.notification.models :as models.notification]
   [toucan2.core :as t2]))

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

(defn- multiple-breakouts?
  "If there are multiple breakouts and a goal, we don't know which breakout to compare to the goal, so it invalidates
  the alert"
  [{:keys [display] :as new-card}]
  (and (get-in new-card [:visualization_settings :graph.goal_value])
       (or (line-area-bar? display)
           (progress? display))
       (< 1 (count (get-in new-card [:dataset_query :query :breakout])))))

(defn delete-alert-and-notify!
  "Removes all of the alerts and notifies all of the email recipients of the alerts change."
  [topic actor card]
  (when-let [card-notifications (seq (models.notification/notifications-for-card (:id card)))]
    (t2/delete! :model/Notification :id [:in (map :id card-notifications)])
    (events/publish-event! topic {:card          card
                                  :actor         actor
                                  :notifications card-notifications})))

;;; TODO -- consider whether this should be triggered indirectly by an event e.g. `:event/card-update`
(defn delete-alerts-if-needed!
  "Delete alerts if the card has been changed in a way that invalidates the alert"
  [& {:keys [old-card new-card actor]}]
  (cond
    (card-archived? old-card new-card)
    (delete-alert-and-notify! :event/card-update.notification-deleted.card-archived actor new-card)

    (or (display-change-broke-alert? old-card new-card)
        (goal-missing? old-card new-card)
        (multiple-breakouts? new-card))
    (delete-alert-and-notify! :event/card-update.notification-deleted.card-changed actor new-card)

    ;; The change doesn't invalidate the alert, do nothing
    :else
    nil))
