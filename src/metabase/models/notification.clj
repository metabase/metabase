(ns metabase.models.notification
  (:require
   [clojure.string :as str]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Notification             [_model] :notification)
(methodical/defmethod t2/table-name :model/NotificationSubscription [_model] :notification_subscription)
(methodical/defmethod t2/table-name :model/NotificationDestination  [_model] :notification_destination)
(methodical/defmethod t2/table-name :model/NotificationRecipient    [_model] :notification_recipient)

(defn- assert-enum
  [enum value]
  (assert (set? enum) "enum but be a set")
  (when-not (contains? enum value)
    (throw (ex-info (format "Invalid value %s. Must be one of %s" value (str/join ", " enum)) {:status-code 400
                                                                                               :value       value}))))

(defn- assert-namespaced
  [qualified-ns value]
  (assert (string? qualified-ns) "namespace must be a string")
  (when-not (= qualified-ns (-> value keyword namespace))
    (throw (ex-info (format "Value %s must be a namespaced keyword under :%s" value qualified-ns) {:status-code 400
                                                                                                   :value       value}))))

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
  {:payload_type (mi/transform-validator mi/transform-keyword (partial assert-enum notification-types))})

(t2/deftransforms :model/NotificationSubscription
  {:type       (mi/transform-validator mi/transform-keyword (partial assert-enum subscription-types))
   :event_name (mi/transform-validator mi/transform-keyword (partial assert-namespaced "event"))})

(t2/deftransforms :model/NotificationDestination
  {:channel_type (mi/transform-validator mi/transform-keyword (partial assert-namespaced "channel"))})

(t2/deftransforms :model/NotificationRecipient
  {:type (mi/transform-validator mi/transform-keyword (partial assert-enum notification-recipient-types))})

(doseq [model [:model/Notification
               :model/NotificationSubscription
               :model/NotificationDestination
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

(methodical/defmethod t2/batched-hydrate [:model/Notification :destinations]
  "Batch hydration NotificationDestinations for a list of Notifications"
  [_model k notifications]
  (mi/instances-with-hydrated-data
   notifications k
   #(group-by :notification_id
              (t2/select :model/NotificationDestination :notification_id [:in (map :id notifications)]))
   :id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationDestination :channel]
  "Batch hydration Channels for a list of NotificationDestinations."
  [_model k notification-destinations]
  (mi/instances-with-hydrated-data
   notification-destinations k
   #(t2/select-fn->fn :id identity :model/Channel
                      :id [:in (map :channel_id notification-destinations)]
                      :active true)
   :channel_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationDestination :recipients]
  "Batch hydration NotificationRecipients for a list of NotificationDestinations."
  [_model k notification-destinations]
  (mi/instances-with-hydrated-data
   notification-destinations
   k
   #(group-by :notification_destination_id
              (t2/select :model/NotificationRecipient :notification_destination_id [:in (map :id notification-destinations)]))
   :id
   {:default []}))

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
                          [:= :ns.type (u/qualified-name :notification-subscription/event)]]}))

(mu/defn create-notification!
  "Create a new notification with `subsciptions`.
  Return the created notification."
  [notification subcriptions destinations+recipients]
  (t2/with-transaction [_conn]
    (let [noti (t2/insert-returning-instance! :model/Notification notification)
          noti-id      (:id noti)]
      (t2/insert! :model/NotificationSubscription (map #(assoc % :notification_id noti-id) subcriptions))
      (doseq [dest destinations+recipients]
        (let [recipients (:recipients dest)
              dest       (-> dest
                             (dissoc :recipients)
                             (assoc :notification_id noti-id))
              dest-id    (t2/insert-returning-pk! :model/NotificationDestination dest)]
          (t2/insert! :model/NotificationRecipient (map #(assoc % :notification_destination_id dest-id) recipients))))
      noti)))
