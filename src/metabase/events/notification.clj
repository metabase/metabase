(ns metabase.events.notification
  (:require
   [metabase.events :as events]
   [metabase.models.notification :as models.notification]
   [metabase.models.task-history :as task-history]
   [metabase.notification.core :as notification]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(derive :metabase/event ::notification)

(def ^:private supported-topics #{:event/user-invited
                                  :event/alert-create
                                  :event/slack-token-invalid})

(defn- notifications-for-topic
  "Returns notifications for a given topic if it is supported and has notifications."
  [topic]
  (when (supported-topics topic)
    (models.notification/notifications-for-event topic)))

(def ^:dynamic *skip-sending-notification?*
  "Used as a hack for when we need to skip sending notifications for certain events.

  It's an escape hatch until we implement conditional notifications."
  false)

(defn- maybe-send-notification-for-topic!
  [topic event-info]
  (when-not *skip-sending-notification?*
    (when-let [notifications (notifications-for-topic topic)]
      (task-history/with-task-history {:task         "notification-trigger"
                                       :task_details {:trigger_type     :notification-subscription/system-event
                                                      :event_name       topic
                                                      :notification_ids (map :id notifications)}}
        (log/infof "Found %d notifications for event: %s" (count notifications) topic)
        (doseq [notification notifications]
          (notification/*send-notification!* (assoc notification :payload {:event-info event-info
                                                                           :event-topic topic})))))))

(methodical/defmethod events/publish-event! ::notification
  [topic event-info]
  (maybe-send-notification-for-topic! topic event-info))
