(ns metabase.app-db.custom-migrations.pulse-subscription-to-notification
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.custom-migrations.util :as custom-migrations.util]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

;; ------------------------------------------------------------------------------------------------
;; Cron string conversion (copied from pulse_to_notification.clj to avoid depending on app code)
;; ------------------------------------------------------------------------------------------------

(defn- cron-string
  "Build a cron string from key-value pair parts."
  [{:keys [seconds minutes hours day-of-month month day-of-week year]}]
  (str/join " " [(or seconds      "0")
                 (or minutes      "0")
                 (or hours        "*")
                 (or day-of-month "*")
                 (or month        "*")
                 (or day-of-week  "?")
                 (or year         "*")]))

(def ^:private day-of-week->cron
  {"sun"  1
   "mon"  2
   "tue"  3
   "wed"  4
   "thu"  5
   "fri"  6
   "sat"  7})

(defn- frame->cron [frame day-of-week]
  (if day-of-week
    ;; specific days of week like Mon or Fri
    (assoc {:day-of-month "?"}
           :day-of-week (case frame
                          "first" (str (day-of-week->cron day-of-week) "#1")
                          "last"  (str (day-of-week->cron day-of-week) "L")))
    ;; specific CALENDAR DAYS like 1st or 15th
    (assoc {:day-of-week "?"}
           :day-of-month (case frame
                           "first" "1"
                           "mid"   "15"
                           "last"  "L"))))

(defn- schedule-map->cron-string
  "Convert the frontend schedule map into a cron string."
  [{day-of-week :schedule_day, hour :schedule_hour, minute :schedule_minute,
    frame :schedule_frame,  schedule-type :schedule_type}]
  (cron-string (case (keyword schedule-type)
                 :hourly  {:minutes minute}
                 :daily   {:hours (or hour 0)}
                 :weekly  {:hours       hour
                           :day-of-week  (day-of-week->cron day-of-week)
                           :day-of-month "?"}
                 :monthly (assoc (frame->cron frame day-of-week)
                                 :hours hour))))

;; ------------------------------------------------------------------------------------------------
;; Migration logic
;; ------------------------------------------------------------------------------------------------

(defn- hydrate-recipients
  [pcs]
  (when (seq pcs)
    (let [pc-id->recipients (group-by :pulse_channel_id
                                      (t2/select :pulse_channel_recipient :pulse_channel_id [:in (map :id pcs)]))]
      (map (fn [pc]
             (assoc pc :recipients (get pc-id->recipients (:id pc))))
           pcs))))

(defn- send-pulse-trigger-key
  [pulse-id schedule-map]
  (triggers/key (format "metabase.task.send-pulse.trigger.%d.%s"
                        pulse-id (-> schedule-map
                                     schedule-map->cron-string
                                     (str/replace " " "_")))))

(defn- create-notification!
  "Create a new notification with `subscriptions`.
  Return the created notification."
  [notification subscriptions handlers+recipients]
  (let [notification-dashboard-id (t2/insert-returning-pk! :notification_dashboard (:payload notification))
        instance                  (t2/insert-returning-instance! :notification (-> notification
                                                                                   (dissoc :payload)
                                                                                   (assoc :payload_id notification-dashboard-id)))
        notification-id           (:id instance)]
    (when (seq subscriptions)
      (t2/insert! :notification_subscription (map #(assoc % :notification_id notification-id) subscriptions)))
    (doseq [handler handlers+recipients]
      (let [recipients (:recipients handler)
            handler    (-> handler
                           (dissoc :recipients)
                           (assoc :notification_id notification-id))
            handler-id (t2/insert-returning-pk! :notification_handler handler)]
        (when (seq recipients)
          (t2/insert! :notification_recipient (map #(assoc % :notification_handler_id handler-id) recipients)))))
    instance))

(defn- pulse-cards->dashcards
  "Convert pulse_card records to dashboard_subscription_dashcards JSON."
  [pulse-cards]
  (json/encode
   (mapv (fn [pc]
           {:card_id       (:card_id pc)
            :include_csv   (boolean (:include_csv pc))
            :include_xls   (boolean (:include_xls pc))
            :format_rows   (boolean (if (some? (:format_rows pc)) (:format_rows pc) true))
            :pivot_results (boolean (:pivot_results pc))})
         pulse-cards)))

(defn- subscription->notification!
  "Create a new notification from a dashboard subscription pulse.
  Return the created notifications."
  [scheduler pulse]
  (let [pulse-id    (:id pulse)
        pcs         (hydrate-recipients (t2/select :pulse_channel :pulse_id pulse-id :enabled true))
        pulse-cards (t2/select :pulse_card :pulse_id pulse-id {:order-by [[:position :asc]]})]
    ;; Group pulse_channels by schedule and create a notification for each group
    (doall
     (for [pcs (vals (group-by (juxt :schedule_type :schedule_hour :schedule_day :schedule_frame) pcs))]
       (let [notification  {:payload_type "notification/dashboard"
                            :payload      {:dashboard_id                     (:dashboard_id pulse)
                                           :parameters                       (or (:parameters pulse) "[]")
                                           :skip_if_empty                    (boolean (:skip_if_empty pulse))
                                           :disable_links                    (boolean (:disable_links pulse))
                                           :dashboard_subscription_dashcards (pulse-cards->dashcards pulse-cards)
                                           :created_at                       (:created_at pulse)
                                           :updated_at                       (:updated_at pulse)}
                            :active       (not (:archived pulse))
                            :creator_id   (:creator_id pulse)
                            :created_at   (:created_at pulse)
                            :updated_at   (:updated_at pulse)}
             pc            (first pcs)
             subscriptions [{:type          "notification-subscription/cron"
                             :cron_schedule (schedule-map->cron-string pc)
                             :created_at    (:created_at pc)}]
             handlers      (map (fn [pc]
                                  (merge
                                   {:active (:enabled pc)}
                                   (case (:channel_type pc)
                                     "email"
                                     {:channel_type "channel/email"
                                      :template_id  nil
                                      :recipients   (concat
                                                     (map (fn [recipient]
                                                            {:type    "notification-recipient/user"
                                                             :user_id (:user_id recipient)})
                                                          (:recipients pc))
                                                     (map (fn [email]
                                                            {:type    "notification-recipient/raw-value"
                                                             :details (json/encode {:value email})})
                                                          (some-> pc :details json/decode (get "emails"))))}
                                     "slack"
                                     {:channel_type "channel/slack"
                                      :template_id  nil
                                      :recipients   [{:type    "notification-recipient/raw-value"
                                                      :details (json/encode {:value (-> pc :details json/decode (get "channel"))})}]}
                                     "http"
                                     {:channel_type "channel/http"
                                      :channel_id   (:channel_id pc)})))
                                pcs)]
         (qs/delete-trigger scheduler (send-pulse-trigger-key pulse-id pc))
         (create-notification! notification subscriptions handlers))))))

(defn migrate-subscriptions!
  "Migrate dashboard subscriptions from `pulse` to `notification`."
  []
  #_{:clj-kondo/ignore [:unresolved-symbol]}
  (custom-migrations.util/with-temp-schedule! [scheduler]
    (run! #(subscription->notification! scheduler %)
          (t2/reducible-query {:select [:*]
                               :from   [:pulse]
                               :where  [:and [:not= :dashboard_id nil] [:not :archived]]}))))
