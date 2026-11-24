(ns metabase.pulse.update-alerts
  ;; TODO this should be moved to notification
  (:require
   [metabase.lib.core :as lib]
   [metabase.notification.card :as notification.card]
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

(defn- alerts-deleted-reason
  "Why the change from `old-card` to `new-card` deletes the alerts of the Card, nil when it does not."
  [old-card new-card]
  (cond
    (card-archived? old-card new-card)     :card-archived
    (card-change-broke-alert? old-card new-card) :card-changed))

(defn notify-alerts-deleted!
  "Tells the recipients of the notifications of each `[old-card new-card notifications]` triple of `changes`, read
  before the update, that the alerts were deleted when the change archives the Card or invalidates its alerts, with
  one event for each reason."
  [actor changes]
  (doseq [[reason triples] (group-by (fn [[old-card new-card]] (alerts-deleted-reason old-card new-card))
                                     (filter (comp seq #(nth % 2)) changes))
          :when            reason]
    (notification.card/notify-card-notifications-deleted! reason actor
                                                          (map (fn [[_old new-card notifications]] [new-card notifications])
                                                               triples))))

(defn card-change-invalidates-alerts?
  "Whether the change from `old-card` to `new-card`, other than archiving it, invalidates the alerts of the Card."
  [old-card new-card]
  (boolean (and (not (card-archived? old-card new-card))
                (card-change-broke-alert? old-card new-card))))
