(ns metabase.events.notification
  (:require
   [metabase.events :as events]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [methodical.core :as methodical]))

(derive :metabase/event ::notification)

(def ^:prviate
  supported-topics
  #{:event/user-invited})

(defn hydrate-event-info
  [schema])

(defn maybe-send-notification-for-topic!
  [topic event]
  (when-let [notifications (seq (and (supported-topics topic)
                                     (models.notification/notifications-for-event topic)))]
    (doseq [notification notifications]
      (notification/send-notification-async! notification event))))

(methodical/defmethod events/publish-event! ::notification
  [topic event]
  (maybe-send-notification-for-topic! topic event))
