(ns metabase.events.notification
  (:require
   [metabase.events :as events]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(derive :metabase/event ::notification)

(def ^:private supported-topics #{:event/user-invited})

(defn- notifications-for-topic
  "Returns notifications for a given topic if it is supported and has notifications."
  [topic]
  (when (supported-topics topic)
    (models.notification/notifications-for-event topic)))

(defn- maybe-send-notification-for-topic!
  [topic event-info]
  (when-let [notifications (notifications-for-topic topic)]
    (log/infof "Found %d notifications for event: %s" (count notifications) topic)
    (doseq [notification notifications]
      (notification/send-notification! (assoc notification :event-info event-info)))))

(methodical/defmethod events/publish-event! ::notification
  [topic event-info]
  (maybe-send-notification-for-topic! topic event-info))
