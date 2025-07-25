(ns metabase.notification.events.report-timezone-updated
  (:require
   [metabase.events.core :as events]
   [metabase.notification.task.send :as send]
   [methodical.core :as methodical]))

(derive ::event :metabase/event)
(derive :event/report-timezone-updated ::event)

(methodical/defmethod events/publish-event! ::event
  "When the report-timezone Setting is updated, update the timezone of all SendNotification triggers."
  [_topic _event]
  (send/update-send-notification-triggers-timezone!))
