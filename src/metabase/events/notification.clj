(ns metabase.events.notification
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.events.schema :as events.schema]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.public-settings :as public-settings]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events.schema/topic->schema :event/user-invited)

(derive :metabase/event ::notification)

(def ^:private supported-topics #{:event/user-invited})

(defn maybe-send-notification-for-topic!
  [topic event]
  (when-let [notifications (seq (and (supported-topics topic)
                                     (models.notification/notifications-for-event topic)))]
    (let [context (assoc event
                         :settings {:application-name (public-settings/application-name)
                                    :company          (public-settings/site-name)
                                    :today            (t/format "MMM'&nbsp;'dd,'&nbsp;'yyyy" (t/zoned-date-time))}
                         :current_user @api/*current-user*)]
      (log/infof "Found %d notifications for event: %s" (count notifications) topic)
      #_(doseq [notification notifications]
          (notification/*send-notification!* notification context)))))


(methodical/defmethod events/publish-event! ::notification
  [topic event]
  (maybe-send-notification-for-topic! topic event))
