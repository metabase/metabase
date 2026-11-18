(ns metabase.pulse.update-alerts
  ;; TODO this should be moved to notification
  (:require
   [metabase.lib.core :as lib]
   [metabase.notification.card :as notification.card]
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

(defn- card-change-broke-alert?
  "Whether the change from `old-card` to `new-card` invalidates the alerts on the card."
  [old-card new-card]
  (or (display-change-broke-alert? old-card new-card)
      (goal-missing? old-card new-card)
      (multiple-breakouts? new-card)))

(def ^:private alert-affecting-columns
  "The columns of a Card an update of which can delete the alerts of the Card."
  [:archived :display :visualization_settings :dataset_query])

(defn alerts-of-card-being-changed
  "The notifications of the alerts of `card`, which `card-updates` may delete through the Card hooks, read before the
  update so that their recipients can be told after it, or nil when the updates leave the alerts alone."
  [card card-updates]
  (when (some #(contains? card-updates %) alert-affecting-columns)
    (seq (models.notification/notifications-for-card (:id card)))))

(defn notify-alerts-deleted!
  "Tells the recipients of `notifications`, which [[alerts-of-card-being-changed]] read before the update, that the alerts
  were deleted when the change from `old-card` to `new-card` archives the Card or invalidates its alerts, as the Card
  hooks have then deleted them."
  [& {:keys [old-card new-card actor notifications]}]
  (when (seq notifications)
    (cond
      (card-archived? old-card new-card)
      (notification.card/notify-card-notifications-deleted! :card-archived actor new-card notifications)

      (card-change-broke-alert? old-card new-card)
      (notification.card/notify-card-notifications-deleted! :card-changed actor new-card notifications))))

(defn delete-alerts-if-card-changed!
  "Deletes the alerts of `new-card` if the change from `old-card`, other than archiving it, invalidates them."
  [& {:keys [old-card new-card]}]
  (when (and (not (card-archived? old-card new-card))
             (card-change-broke-alert? old-card new-card))
    (when-let [notification-ids (seq (map :id (models.notification/notifications-for-card (:id new-card))))]
      (pulse.db/delete-notifications! notification-ids))))
