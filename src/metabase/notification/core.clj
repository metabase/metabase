(ns metabase.notification.core
  "Notifications do:
  - execute notificatino based on its type
  - deliver the message to all of its channel"
  (:require
   [metabase.channel.core :as channel]
   [metabase.notification.execute :as noti.execute]
   [toucan2.core :as t2]))

(defmulti notification->payload
  "Turn a notification into a payload that can be sent to a channel"
  :kind)

(defmethod notification->payload :alert #_:- #_[:map
                                                [:card :map]
                                                [:result :map]]
  [noti]
  (noti.execute/execute-card (:creator_id noti) (:card_id noti)))

(defmulti send-notification!
  (fn [notification _channels]
    (:kind notification)))

(defmethod send-notification! :alert
  [notification channels]
  (let [payload (notification->payload notification)]
    (doseq [channel channels]
      (channel/send-notification! channel
                                            :alert
                                            (:recipients channel)
                                            payload))))

(comment
 (def pulse-id 15)
 (def alert (assoc (t2/select-one :model/Pulse pulse-id)
                   :kind :alert
                   :card_id (t2/select-one-fn :card_id :model/PulseCard :pulse_id pulse-id)))

 (notification->payload alert)

 (def payload (notification->payload alert))

 (channel.interface/send-notification!
  {:kind :slack}
  :alert
  ["test-pulse"]
  payload)

 (send-notification! alert
                    [{:kind :slack
                      :recipients ["test-pulse"]}]))

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
