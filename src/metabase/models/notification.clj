(ns metabase.models.notification
  "A notification have:
  - a payload
  - more than one subscriptions
  - more than one handlers where each handler has a channel, optionally a template, and more than one recpients."
  (:require
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Notification             [_model] :notification)
(methodical/defmethod t2/table-name :model/NotificationSubscription [_model] :notification_subscription)
(methodical/defmethod t2/table-name :model/NotificationHandler      [_model] :notification_handler)
(methodical/defmethod t2/table-name :model/NotificationRecipient    [_model] :notification_recipient)

(def notification-types
  "Set of valid notification types."
  #{:notification/system-event})

(def ^:private subscription-types
  #{:notification-subscription/system-event})

(def ^:private notification-recipient-types
  #{:notification-recipient/user
    :notification-recipient/group
    :notification-recipient/external-email})

(t2/deftransforms :model/Notification
  {:payload_type (mi/transform-validator mi/transform-keyword (partial mi/assert-enum notification-types))})

(t2/deftransforms :model/NotificationSubscription
  {:type       (mi/transform-validator mi/transform-keyword (partial mi/assert-enum subscription-types))
   :event_name (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "event"))})

(t2/deftransforms :model/NotificationHandler
  {:channel_type (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "channel"))})

(t2/deftransforms :model/NotificationRecipient
  {:type (mi/transform-validator mi/transform-keyword (partial mi/assert-enum notification-recipient-types))})

(doseq [model [:model/Notification
               :model/NotificationSubscription
               :model/NotificationHandler
               :model/NotificationRecipient]]
  (doto model
    (derive :metabase/model)
    (derive (if (= model :model/NotificationSubscription)
              :hook/created-at-timestamped?
              :hook/timestamped?))))

(methodical/defmethod t2/batched-hydrate [:model/Notification :subscriptions]
  "Batch hydration NotificationSubscriptions for a list of Notifications."
  [_model k notifications]
  (mi/instances-with-hydrated-data
   notifications k
   #(group-by :notification_id
              (t2/select :model/NotificationSubscription :notification_id [:in (map :id notifications)]))
   :id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/Notification :handlers]
  "Batch hydration NotificationHandlers for a list of Notifications"
  [_model k notifications]
  (mi/instances-with-hydrated-data
   notifications k
   #(group-by :notification_id
              (t2/select :model/NotificationHandler :notification_id [:in (map :id notifications)]))
   :id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationHandler :channel]
  "Batch hydration Channels for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers k
   #(t2/select-fn->fn :id identity :model/Channel
                      :id [:in (map :channel_id notification-handlers)]
                      :active true)
   :channel_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationHandler :template]
  "Batch hydration ChannelTemplates for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers k
   #(t2/select-fn->fn :id identity :model/ChannelTemplate
                      :id [:in (map :template_id notification-handlers)])
   :template_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationHandler :recipients]
  "Batch hydration NotificationRecipients for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers
   k
   #(group-by :notification_handler_id
              (t2/select :model/NotificationRecipient :notification_handler_id [:in (map :id notification-handlers)]))
   :id
   {:default []}))

(defn- cross-check-channel-type-and-template-type
  [notification-handler]
  (when-let [template-id (:template_id notification-handler)]
    (let [channel-type  (:channel_type notification-handler)
          template-type (t2/select-one-fn :channel_type [:model/ChannelTemplate :channel_type] template-id)]
      (when (not= channel-type template-type)
        (throw (ex-info "Channel type and template type mismatch"
                        {:status        400
                         :channel-type  channel-type
                         :template-type template-type}))))))

(t2/define-before-insert :model/NotificationHandler
  [instance]
  (cross-check-channel-type-and-template-type instance)
  instance)

(t2/define-before-update :model/NotificationHandler
  [instance]
  (when (or (contains? (t2/changes instance) :channel_id)
            (contains? (t2/changes instance) :template_id))
    (cross-check-channel-type-and-template-type instance)
    instance))

(defn notifications-for-event
  "Find all notifications for a given event."
  [event-name]
  (t2/select :model/Notification
             {:select    [:n.*]
              :from      [[:notification :n]]
              :left-join [[:notification_subscription :ns] [:= :n.id :ns.notification_id]]
              :where     [:and
                          [:= :n.active true]
                          [:= :ns.event_name (u/qualified-name event-name)]
                          [:= :ns.type (u/qualified-name :notification-subscription/system-event)]]}))

(mu/defn create-notification!
  "Create a new notification with `subsciptions`.
  Return the created notification."
  [notification subcriptions handlers+recipients]
  (t2/with-transaction [_conn]
    (let [noti (t2/insert-returning-instance! :model/Notification notification)
          noti-id      (:id noti)]
      (t2/insert! :model/NotificationSubscription (map #(assoc % :notification_id noti-id) subcriptions))
      (doseq [handler handlers+recipients]
        (let [recipients (:recipients handler)
              handler    (-> handler
                             (dissoc :recipients)
                             (assoc :notification_id noti-id))
              handler-id (t2/insert-returning-pk! :model/NotificationHandler handler)]
          (t2/insert! :model/NotificationRecipient (map #(assoc % :notification_handler_id handler-id) recipients))))
      noti)))
