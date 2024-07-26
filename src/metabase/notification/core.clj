(ns metabase.notification.core
  "Notifications do:
  - execute notificatino based on its type
  - deliver the message to all of its channel"
  (:require
   [metabase.events :as events]
   [metabase.channel.core :as channel]
   [metabase.notification.execute :as noti.execute]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.ui-logic :as ui-logic]
   [metabase.util.retry :as retry]
   [toucan2.core :as t2]
   [metabase.notification.core :as noti]))

(def ^:private payload-types #{:notification/alert :notification/dashboard-subscription})

(def ^:private Notification
  "Saved notification"
  [:map
   [:notification_type (into [:enum ] payload-types)]
   [:notification_id   pos-int?]
   [:creator_id   pos-int?]])

(def ^:private HydratedNotification
  [:map
   [:notification_type             :keyword]
   [:pulse                         :map]
   [:creator_id                    pos-int?]
   [:notification_id   {:optional true} [:maybe pos-int?]]
   ;; alert only
   [:card_id      {:optional true} pos-int?]
   [:trigger      {:optional true} :map]
   ;; dashboard subscription only
   [:dashboard_id {:optional true} pos-int?]])

(def ^:private NotificationRecipients
  [:multi {:dispatch :channel_type}
   [:channel/email [:map [:recipients [:sequential [:multi {:dispatch :kind}
                                                     [:user           :map]
                                                     [:external-email ms/Email]]]]]]
   [:channel/slack [:map [:recipients [:sequential :string]]]]
   [:else :any]])

(mu/defn ^:private notification->channel+recipients :- [:sequential NotificationRecipients]
  [notification pc-ids]
  (let [pcs (if (some? pc-ids)
              (t2/select :model/PulseChannel :pulse_id (:notification_id notification)
                         :enabled true
                         :id [:in pc-ids])
              (t2/select :model/PulseChannel :pulse_id (:notification_id notification) :enabled true))]
    (for [pc pcs]
      (let [channel-type (keyword "channel" (name (:channel_type pc)))]
        {:channel_type  channel-type
         :recipients    (if (= :channel/email channel-type)
                          (concat (map (fn [user]
                                         {:kind :user
                                          :user user})
                                       ;; TODO: n+1 here
                                       (t2/select :model/User
                                                  {:left-join [[:pulse_channel_recipient :pcr] [:= :core_user.id :pcr.user_id]
                                                               [:pulse_channel :pc] [:= :pc.id :pcr.pulse_channel_id]
                                                               [:pulse :p] [:= :p.id :pc.pulse_id]]
                                                   :where     [:and
                                                               [:= :p.id (:notification_id notification)]
                                                               [:= :core_user.is_active true]]
                                                   :order-by [[:core_user.id :asc]]}))
                                  ;; non-user-email
                                  (map (fn [email] {:recipient email
                                                    :kind      :external-email}) (get-in pc [:recipients :emails])))
                          [(get-in pc [:details :channel])])}))))


;; ------------------------------------------------------------------------------------------------;;
;;                                        Multimethods                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti ^:private execute-notification
  :notification_type)

(defmulti ^:private should-send-notification?
  "Returns true if given the pulse type and resultset a new notification (pulse or alert) should be sent"
  :notification_type)

;; ------------------------------------------------------------------------------------------------;;
;;                                           Alerts                                                ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defn ^:private hydrate-notification :- HydratedNotification
  [notification :- [:or Notification HydratedNotification]]
  (let [pulse (or (:pulse notification) (t2/select-one :model/Pulse (:notification_id notification)))]
    (cond-> notification
      (not (contains? notification :pulse))
      (assoc :pulse pulse)

      (and (= :notification/alert (:notification_type notification))
           (not (contains? notification :card)))
      ;; there should be only one pulse card for alert
      (assoc :card_id (t2/select-one-fn :id :model/PulseCard :pulse_id (:id pulse)))

      (and (= :notification/dashboard-subscription (:notification_type notification))
           (not (contains? notification :dashboard)))
      (assoc :dashboard_id (:dashboard_id pulse))

      (and (= :notification/alert (:notification_type notification))
           (not (contains? notification :trigger)))
      (assoc :trigger (t2/select-one-fn
                       ;; we use these for alert email. see [[metabase.email.messages/alert-context]]
                       ;; currently notification's triggere is tied to pulseChannel, but should it'll be 2 different
                       ;; concept and these info will come directly from the trigger (scheduler) so we don't have to query
                       ;; it here
                       #(select-keys % [:schedule_type :schedule_hour :schedule_day :schedule_frame])
                       :model/PulseChannel :pulse_id  (:id pulse) :enabled true)))))

(def ^:private AlertPayload
  [:map {:closed true}
   [:notification_type [:= :notification/alert]]
   [:context           [:map
                        [:card    :map]
                        [:trigger :map]
                        [:pulse   :map]]]
   [:payload           [:map
                        [:type [:= :card]]
                        [:card :map]
                        [:result :map]]]])

(mu/defmethod execute-notification :notification/alert :- AlertPayload
  [{:keys [creator_id] :as hydated-noti} :- HydratedNotification]
  (let [card (t2/select-one :model/Card (:card_id hydated-noti))]
   {:notification_type :notification/alert
    :payload      (noti.execute/execute-card creator_id card)
    :context      {:pulse   (:pulse hydated-noti)
                   :trigger (:trigger hydated-noti)
                   :card    card}}))

(defn- is-card-empty?
  "Check if the part is empty"
  [part]
  (if-let [result (:result part)]
    (or (zero? (-> result :row_count))
        ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
        (= [[nil]]
           (-> result :data :rows)))
    ;; Text cards have no result; treat as empty
    true))

(defn- goal-met? [{:keys [alert_above_goal], :as pulse} [first-result]]
  (let [goal-comparison      (if alert_above_goal >= <)
        goal-val             (ui-logic/find-goal-value first-result)
        comparison-col-rowfn (ui-logic/make-goal-comparison-rowfn (:card first-result)
                                                            (get-in first-result [:result :data]))]

    (when-not (and goal-val comparison-col-rowfn)
      (throw (ex-info (tru "Unable to compare results to goal for alert.")
                      {:pulse  pulse
                       :result first-result})))
    (boolean
     (some (fn [row]
             (goal-comparison (comparison-col-rowfn row) goal-val))
           (get-in first-result [:result :data :rows])))))

(defmethod should-send-notification? :notification/alert
  [payload]
  (let [alert           (get-in payload [:context :pulse])
        alert-condition (:alert_condition alert)]
    (cond
      (= "rows" alert-condition)
      (not (is-card-empty? (:payload payload)))

      (= "goal" alert-condition)
      (goal-met? alert (:payload payload))

      :else
      (let [^String error-text (tru "Unrecognized alert with condition ''{0}''" alert-condition)]
        (throw (IllegalArgumentException. error-text))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private DashboardSubscriptionPayload
  [:map {:closed true}
   [:notification_type [:= :notification/dashboard-subscription]]
   [:context      [:map {:closed true}
                   [:pulse :map]
                   [:dashboard :map]]]
   [:payload      [:sequential :any]]])

(mu/defmethod execute-notification :notification/dashboard-subscription :- DashboardSubscriptionPayload
  [hydrated-noti :- HydratedNotification]
  (let [dashboard (t2/select-one :model/Dashboard (:dashboard_id hydrated-noti))
        payload   (noti.execute/execute-dashboard (:pulse hydrated-noti) dashboard)]
    {:notification_type :notification/dashboard-subscription
     :payload      payload
     :context      {:pulse     (:pulse hydrated-noti)
                    :dashboard dashboard}}))

(defn- are-all-parts-empty?
  "Do none of the cards have any results?"
  [results]
  (every? is-card-empty? results))

(defmethod should-send-notification? :notification/dashboard-subscription
  [payload]
  (cond
   (get-in payload [:context :dashboard :archived]) false
   (get-in payload [:context :pulse :skip_if_empty]) (not (are-all-parts-empty? (:payload payload)))
   :else true))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Public APIs                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private payload-type->event-type
  {:notification/alert                  :event/alert-send
   :notification/dashboard-subscription :event/subscription-send})

(defn- channel-send!
  [& args]
  (try
    (apply channel/send! args)
    (catch Exception e
      ;; Token errors have already been logged and we should not retry.
      (when-not (and (= :channel/slack (first args))
                     (contains? (:errors (ex-data e)) :slack-token))
        (throw e)))))

(defn- send-retrying!
  [& args]
  (try
    (apply (retry/decorate channel-send!) args)
    (catch Throwable e
      (log/error e "Error sending notification!"))))

(mu/defn send-notification!
  "Send the notification."
  ([notification         :- [:or Notification HydratedNotification]
    &
    pc-ids-or-recipients #_:- #_[:maybe [:sequential [:or pos-int? NotificationRecipients]]]]
   (let [notification           (hydrate-notification notification)
         channel+recipients     (if (and (seq pc-ids-or-recipients) (map? (first pc-ids-or-recipients)))
                                  pc-ids-or-recipients
                                  (notification->channel+recipients notification pc-ids-or-recipients))
         payload                (execute-notification notification)
         payload-type           (:notification_type payload)
         notification-info      (if (= :notification/alert payload-type)
                                  (get-in payload [:context :alert])
                                  (get-in payload [:context :dashboard-subscription]))]
     (if (should-send-notification? payload)
       (do
        (events/publish-event! (get payload-type->event-type payload-type)
                               {:id      (:notification_id notification)
                                :user-id (:creator_id notification)
                                :object  {:recipients (map :recipients channel+recipients)
                                          :filters    (:parameters notification-info)}})
        (doseq [channel channel+recipients]
          (try
            (log/infof "Sending notification %d to channel: %s" (:notification_id notification) channel)
            (doseq [message (channel/render-notification (:channel_type channel)
                                                         payload
                                                         (:recipients channel))]
              (send-retrying! (:channel_type channel) message))
            (catch Exception e
              (log/errorf e "Error sending %s %d to channel %s"
                          (:notification_type notification) (:notification_id notification) (:channel_type channel)))))
        (when (and (= :notification/alert payload-type)
                   (:alert_first_only notification-info))
          (t2/delete! :model/Pulse (:id notification-info))))
       (log/infof "Skipping notification %s" (select-keys notification [:notification_id :notification_type]))))))

(comment
 (ngoc/with-tc
   (send-notification! {:notification_type :notification/dashboard-subscription
                        :notification_id   2
                        :creator_id 2})))
