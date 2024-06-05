(ns metabase.notification.core
  "Notifications do:
  - execute notificatino based on its type
  - deliver the message to all of its channel"
  (:require
   [metabase.channel.core :as channel]
   [metabase.notification.execute :as noti.execute]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defmulti ^:private execute-payload
  "Turn a notification into a payload that can be sent to a channel"
  :payload_type)

(defmulti ^:private notification->payload-info
  :payload_type)

(def ^:private Notification
  [:map
   [:payload_type [:enum :alert :dashboard-subscription]]
   [:payload_id   pos-int?]
   [:creator_id   pos-int?]])

(def ^:private PayloadInfo
  [:merge
   Notification
   [:multi {:dispatch :payload_type}
    [:alert                  [:map
                              ;; should be model/Alert in the future
                              [:alert [:and (ms/InstanceOf :model/Pulse)
                                       [:map [:card_id pos-int?]]]]]]
    [:dashboard-subscription [:map
                              ;; should be model/DashboardSubscription in the future
                              [:dashboard-subscription (ms/InstanceOf :model/Pulse)]]]]])

(def ^:private Payload
  [:multi {:dispatch :payload-type}
   [:alert [:map
            [:payload-type [:= :alert]]
            [:card         :map]
            [:result       :map]]]
   [:dashboard-subscription [:map
                             [:payload-type [:= :dashboard-subscription]]
                             [:dashboard    :map]
                             [:result       [:sequential :map]]]]])


(mu/defmethod notification->payload-info :alert :- PayloadInfo
  [notification :- Notification]
  (let [alert (assoc (t2/select-one :model/Pulse (:payload_id notification))
                     :card_id
                     (t2/select-one-fn :card_id :model/PulseCard :pulse_id (:payload_id notification)))]
    (assoc notification :alert alert)))

(mu/defmethod notification->payload-info :dashboard-subscription :- PayloadInfo
  [notification :- Notification]
  (let [dashboard-subscription (t2/hydrate (t2/select-one :model/Pulse (:payload_id notification)) :cards)]
    (assoc notification :dashboard-subscription dashboard-subscription)))

(mu/defmethod execute-payload :alert :- Payload
  [payload-info :- PayloadInfo]
  (let [card (t2/select-one :model/Card :id (get-in payload-info [:alert :card_id]) :archived false)]
    {:payload-type :alert
     :card         card
     :result       (noti.execute/execute-card (:creator_id payload-info) card)}))

(mu/defmethod execute-payload :dashboard-subscription :- Payload
  [{:keys [dashboard-subscription creator_id]} :- PayloadInfo]
  {:payload-type           :dashboard-subscription
   :dashboard-subscription dashboard-subscription
   :dashboard              (t2/select-one :model/Dashboard (:dashboard_id dashboard-subscription))
   :result                 (noti.execute/execute-dashboard creator_id dashboard-subscription)})

(defn- notification->channel+recipients
  [notification]
  (let [pcs (t2/select :model/PulseChannel :pulse_id (:payload_id notification) :enabled true)]
    (for [pc pcs]
      (let [channel-type (:channel_type pc)]
        {:channel_type channel-type
         :recipients   (if (= :email channel-type)
                         (concat (map (fn [user]
                                        {:kind :user
                                         :user user})
                                      ;; TODO: n+1 here
                                      (t2/select :model/User
                                                 {:left-join [[:pulse_channel_recipient :pcr] [:= :core_user.id :pcr.user_id]]
                                                  :where     [:and
                                                              [:= :pcr.pulse_channel_id (:payload_id notification)]
                                                              [:= :core_user.is_active true]]
                                                  :order-by [[:core_user.id :asc]]}))
                                 ;; non-user-email
                                 (map (fn [email] {:recipient email
                                                   :kind      :external-email}) (get-in pc [:recipients :emails])))
                         [{:kind :slack-channel
                           :recipient (get-in pc [:details :channel])}])}))))

(mu/defn send-notification!
  "Send the notification."
  ([notification :- Notification]
   (send-notification!
    (notification->payload-info notification)
    (notification->channel+recipients notification)))
  ([payload-info :- PayloadInfo
    channel+recipients]
   (let [payload (execute-payload payload-info)]
     (doseq [channel channel+recipients]
       (channel/deliver! {:channel_type (:channel_type channel)}
                         payload
                         (:recipients channel)
                         nil)))))

(comment
 (def alert-id 13)
 (def crowberto-id (t2/select-one-pk :model/User :email "crowberto@metabase.com"))

 (execute-payload {:payload_type :alert
                   :payload_id   alert-id
                   :creator_id   crowberto-id})

 (def payload (execute-payload alert))


 (ngoc/with-tc
   (send-notification! {:payload_type :alert
                        :payload_id   alert-id
                        :creator_id   crowberto-id})))


(comment
 (def dash-sub-id 12)

 (def payload (execute-payload (notification->payload-info {:payload_type :dashboard-subscription
                                                            :payload_id   dash-sub-id
                                                            :creator_id   crowberto-id})))

 (ngoc/with-tc
   (channel/deliver! {:channel_type :slack} payload [{:kind :slack-channel
                                                      :recipient "#test-pulse"}] nil))
 (ngoc/with-tc
   (send-notification! {:payload_type :dashboard-subscription
                        :payload_id   dash-sub-id
                        :creator_id   crowberto-id})))


;; call stack for alert
;; pulse/send-pulse! -> pulse/pulse->notifications -> pulse.util/execute-card -> parts->notifications
;; -> notificaiton(dispatch by channel type) : at this point we have the paylaods
;; - :email : messages/render-alert-email -> email/send-message-or-throw!
;; - :slack : create-slack-attachment-data -> slack/post-chat-message!

;; call stack for dashbord subscription
;; pulse/send-pulse! -> pulse/pulse->notifications -> pulse/execute-dashboard -> parts->notifications
;; -> notificaiton(dispatch by channel type) : at this point we have the payloads
;; - :email: messages/render-pulse-email -> email/send-message-or-throw!
;; - :slack : create-slack-attachment-data -> slack/post-chat-message!
