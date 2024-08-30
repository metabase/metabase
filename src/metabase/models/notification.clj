(ns metabase.models.notification
  (:require
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Notification             [_model] :notification)
(methodical/defmethod t2/table-name :model/NotificationSubscription [_model] :notification_subscription)
(methodical/defmethod t2/table-name :model/NotificationDestination  [_model] :notification_destination)
(methodical/defmethod t2/table-name :model/NotificationRecipient    [_model] :notification_recipient)

(t2/deftransforms :model/Notification
  {:payload_type mi/transform-keyword})

(t2/deftransforms :model/NotificationSubscription
  {:type       mi/transform-keyword
   :event_name mi/transform-keyword})

(t2/deftransforms :model/NotificationDestination
  {:channel_type mi/transform-keyword})

(t2/deftransforms :model/NotificationRecipient
  {:type mi/transform-keyword})

(doseq [model [:model/Notification
               :model/NotificationSubscription
               :model/NotificationDestination
               :model/NotificationRecipient]]
  (doto model
    (derive :metabase/model)
    (derive (if (= model :model/NotificationSubscription)
              :hook/created-at-timestamped?
              :hook/timestamped?))))

(methodical/defmethod t2/batched-hydrate [:model/NotificationDestination :channel]
  "Batch hydrate NotificationChannels for a list of Notification IDs."
  [_model k notification-destinations]
  (mi/instances-with-hydrated-data
   notification-destinations k
   #(t2/select-fn->fn :id identity :model/Channel
                      :id [:in (map :channel_id notification-destinations)]
                      :active true)
   :channel_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationDestination :channel_template]
  "Batch hydrate NotificationChannels for a list of Notification IDs."
  [_model k notification-destinations]
  (mi/instances-with-hydrated-data
   notification-destinations k
   #(t2/select-fn->fn :id identity :model/ChannelTemplate
                      :id [:in (map :channel_template_id notification-destinations)])
   :channel_template_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationDestination :recipients]
  [_model k notification-destinations]
  (mi/instances-with-hydrated-data
   notification-destinations
   k
   #(group-by :notification_destination_id
              (t2/select :model/NotificationRecipient :notification_destination_id  [:in (map :id notification-destinations)]))
   :id
   {:default []}))

(defn create-notification!
  "Create a new notification."
  [notification subcriptions destinations]
  (t2/with-transaction [_conn]
    (let [noti (t2/insert-returning-instance! :model/Notification notification)
          noti-id      (:id noti)]
      (doseq [subscription subcriptions]
        (t2/insert! :model/NotificationSubscription (assoc subscription :notification_id noti-id)))
      (doseq [dest destinations]
        (let [recipients (:recipients dest)
              dest       (-> dest
                             (dissoc :recipients)
                             (assoc :notification_id noti-id))
              dest-id    (t2/insert-returning-pk! :model/NotificationDestination dest)]
          (t2/insert! :model/NotificationRecipient (map #(assoc % :notification_destination_id dest-id) recipients))))
      noti)))

(defn notifications-for-event
  "Find all notifications for a given event."
  [event-name]
  (t2/select :model/Notification
             {:select [:n.*]
              :from   [[:notification :n]]
              :left-join [[:notification_subscription :ns] [:= :n.id :ns.notification_id]]
              :where  [:= :ns.event_name (u/qualified-name event-name)]}))
