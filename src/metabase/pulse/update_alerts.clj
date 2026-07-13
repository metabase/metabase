(ns metabase.pulse.update-alerts
  ;; TODO this should be moved to notification
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.notification.models :as models.notification]
   [metabase.util.cron :as u.cron]
   [metabase.util.malli :as mu]
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

(mu/defn- multiple-breakouts?
  "If there are multiple breakouts and a goal, we don't know which breakout to compare to the goal, so it invalidates
  the alert"
  [{:keys [display], query :dataset_query, :as new-card} :- :metabase.queries.schema/card]
  (and (get-in new-card [:visualization_settings :graph.goal_value])
       (or (line-area-bar? display)
           (progress? display))
       (< 1 (count (lib/breakouts query)))))

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

(defn notification->pulse
  "Convert a notification to the legacy pulse structure `GET /api/alert` and `GET /api/alert/:id` return."
  [notification]
  (let [subscription      (-> notification :subscriptions first)
        notification-card (-> notification :payload)
        card              (->> notification :payload :card_id (t2/select-one :model/Card))]
    (merge
     (select-keys notification [:id :creator_id :creator :created_at :updated_at])
     {:name                nil
      :alert_condition     (if (-> notification-card :send_condition (= :has_result)) "rows" "goal")
      :alert_above_goal    (if (-> notification-card :send_condition (= :goal_above)) true nil)
      :alert_first_only    (-> notification :payload :send_once)
      :archived            (not (:active notification))
      :collection_position nil
      :collection_id       nil
      :skip_if_empty       true
      :parameters          []
      :dashboard_id        nil
      :card                (merge
                            (select-keys card [:name :description :collection_id :display])
                            {:format_rows       true
                             :include_xls       false
                             :include_csv       true
                             :pivot_results     false
                             :dashboard_id      nil
                             :dashboard_card_id nil
                             :parameter_mappings nil})
      :channels            (map (fn [handler]
                                  (let [user-recipients  (->> handler
                                                              :recipients
                                                              (filter #(= :notification-recipient/user (:type %)))
                                                              (map :user)
                                                              (map #(select-keys % [:email :last_name :first_name :id :common_name])))
                                        ;; for external emails and slack channel
                                        value-recipients (->> handler
                                                              :recipients
                                                              (filter #(= :notification-recipient/raw-value (:type %)))
                                                              (map :details))]
                                    (merge
                                     (when subscription
                                       (select-keys (u.cron/cron-string->schedule-map (:cron_schedule subscription))
                                                    [:schedule_type :schedule_hour :schedule_day :schedule_frame]))
                                     {:id           (:id handler)
                                      :recipients   (if (= :channel/email (:channel_type handler))
                                                      (concat (map #(set/rename-keys % {:value :email}) value-recipients) user-recipients)
                                                      [])
                                      :channel_type (name (:channel_type handler))
                                      :channel_id   (:channel_id handler)
                                      :enabled      (:active handler)
                                      :details      (case (:channel_type handler)
                                                      :channel/slack
                                                      {:channel (-> value-recipients first :value)}
                                                      :channel/email
                                                      {:emails (map :value value-recipients)}
                                                      {})})))
                                (:handlers notification))})))

(defn get-alert
  "Fetch the alert (Notification) with `id`, read-checked, in the legacy Pulse-shaped structure returned by
  `GET /api/alert/:id`."
  [id]
  (-> (t2/select-one :model/Notification id)
      api/check-404
      models.notification/hydrate-notification
      api/read-check
      notification->pulse))
