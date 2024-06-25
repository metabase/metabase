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
   [toucan2.core :as t2]))

(def ^:private payload-types #{:notification/alert :notification/dashboard-subscription})

(def ^:private Notification
  [:map
   [:payload_type (into [:enum ] payload-types)]
   [:payload_id   pos-int?]
   [:creator_id   pos-int?]])

(defn- notification->channel+recipients
  [notification pc-ids]
  (let [pcs (if (some? pc-ids)
              (t2/select :model/PulseChannel :pulse_id (:payload_id notification)
                         :enabled true
                         :id [:in pc-ids])
              (t2/select :model/PulseChannel :pulse_id (:payload_id notification) :enabled true))]
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
                                                               [:= :p.id (:payload_id notification)]
                                                               [:= :core_user.is_active true]]
                                                   :order-by [[:core_user.id :asc]]}))
                                  ;; non-user-email
                                  (map (fn [email] {:recipient email
                                                    :kind      :external-email}) (get-in pc [:recipients :emails])))
                          [(get-in pc [:details :channel])])}))))


;; ------------------------------------------------------------------------------------------------;;
;;                                        Multimethods                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti ^:private notification->payload
  :payload_type)

(defmulti ^:private should-send-notification?
  "Returns true if given the pulse type and resultset a new notification (pulse or alert) should be sent"
  :payload_type)

;; ------------------------------------------------------------------------------------------------;;
;;                                           Alerts                                                ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private AlertPayload
  [:map {:closed true}
   [:payload_type [:= :notification/alert]]
   [:context      [:map
                   [:card    :map]
                   [:trigger :map]
                   [:alert   :map]]]
   [:payload      [:map
                   [:type [:= :card]]
                   [:card :map]
                   [:result :map]]]])

(mu/defmethod notification->payload :notification/alert :- AlertPayload
  [notification :- Notification]
  (let [alert (t2/select-one :model/Pulse (:payload_id notification))
        card  (t2/select-one :model/Card {:select [:c.*]
                                          :from   [[:report_card :c]]
                                          :left-join [[:pulse_card :pc] [:= :pc.card_id :c.id]]
                                          :where     [:and
                                                      [:= :pc.pulse_id (:payload_id notification)]]})]
    {:payload_type :notification/alert
     :payload      (noti.execute/execute-card (:creator_id notification) card)
     :context      {:alert   alert
                    :card    card
                    ;; we use these for alert email. see [[metabase.email.messages/alert-context]]
                    ;; though now we don't have a notion of trigger but we'll soon, and schedule_type belongs to
                    ;; trigger not notification's
                    :trigger (t2/select-one-fn
                              #(select-keys % [:schedule_type :schedule_hour :schedule_day :schedule_frame])
                              :model/PulseChannel :pulse_id (:payload_id notification) :enabled true)}}))

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
  (let [alert           (get-in payload [:context :alert])
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
   [:payload_type [:= :notification/dashboard-subscription]]
   [:context      [:map {:closed true}
                   [:dashboard-subscription :map]
                   [:dashboard :map]]]
   [:payload      [:sequential :any]]])

(mu/defmethod notification->payload :notification/dashboard-subscription :- DashboardSubscriptionPayload
  [notification :- Notification]
  (let [dashsub   (t2/select-one :model/Pulse (:payload_id notification))
        dashboard (t2/select-one :model/Dashboard (:dashboard_id dashsub))
        payload   (noti.execute/execute-dashboard dashsub dashboard)]
    {:payload_type :notification/dashboard-subscription
     :payload      payload
     :context      {:dashboard-subscription dashsub
                    :dashboard              dashboard}}))

(defn- are-all-parts-empty?
  "Do none of the cards have any results?"
  [results]
  (every? is-card-empty? results))

(defmethod should-send-notification? :notification/dashboard-subscription
  [payload]
  (if (:skip_if_empty (get-in payload [:context :dashboard-subscription]))
    (not (are-all-parts-empty? (:payload payload)))
    true))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Public APIs                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private payload-type->event-type
  {:notification/alert                  :event/alert-send
   :notification/dashboard-subscription :event/subscription-send})

(mu/defn send-notification!
  "Send the notification."
  ([notification :- Notification]
   (send-notification!
    notification
    (notification->channel+recipients notification nil)))
  ([notification channel+recipients]
   (let [payload                (notification->payload notification)
         payload-type           (:payload_type payload)
         notification-info      (if (= :notification/alert payload-type)
                                  (get-in payload [:context :alert])
                                  (get-in payload [:context :dashboard-subscription]))]
     (if (should-send-notification? payload)
       (do
        (events/publish-event! (get payload-type->event-type payload-type)
                               {:id      (:payload_id notification)
                                :user-id (:creator_id notification)
                                :object  {:recipients (map :recipients channel+recipients)
                                          :filters    (:parameters notification-info)}})
        (doseq [channel channel+recipients]
          (log/infof "Sending notification %d to channel: %s" (:payload_id notification) channel)
          (doseq [message (channel/render-notification (:channel_type channel)
                                                       payload
                                                       (:recipients channel))]
            (channel/send! (:channel_type channel) message)))
        (when (and (= :notification/alert payload-type)
                   (:alert_first_only notification-info))
          (t2/delete! :model/Pulse (:id notification-info))))
       (log/infof "Skipping notification %s" (select-keys notification [:payload_id :payload_type]))))))

(comment
 (ngoc/with-tc
   (send-notification! {:payload_type :notification/dashboard-subscription
                        :payload_id 3
                        :creator_id 2})))
