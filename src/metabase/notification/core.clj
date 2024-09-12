(ns metabase.notification.core
  (:require
   [metabase.channel.core :as channel]
   [metabase.models.notification :as models.notification]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private Notification
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:active       :boolean]
   [:payload_type (into [:enum] models.notification/notification-types)]
   [:created_at   :any]
   [:updated_at   :any]])

(def ^:private NotificationInfo
  [:multi {:dispatch :payload_type}
   [:notification/system-event [:merge
                                Notification
                                [:map {:closed true}
                                 ;; TODO: event-info schema
                                 [:event-info [:maybe :map]]
                                 [:settings   :map]]]]])

(mu/defn send-notification!
  "Send the notification to all handlers synchronously."
  [notification :- NotificationInfo]
  (let [noti-handlers (t2/hydrate (t2/select :model/NotificationHandler :notification_id (:id notification))
                                  :channel
                                  :template
                                  :recipients)]
    (log/infof "[Notification %d] Found %d destinations" (:id notification) (count noti-handlers))
    (doseq [handler noti-handlers]
      (let [channel-type (:channel_type handler)
            messages     (channel/render-notification
                          channel-type
                          notification
                          (:template handler)
                          (:recipients handler))]
        (log/infof "[Notification %d] Got %d messages for channel %s" (:id notification) (count messages) (:channel_type handler))
        (doseq [message messages]
          (channel/send! (or (:channel handler)
                             {:type channel-type}) message))))))
