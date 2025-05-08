(ns metabase.notification.core
  "Core functionality for notifications."
  (:require
   [metabase.notification.events.notification :as events.notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.impl.system-event :as notification.payload.system-event]
   [metabase.notification.seed :as notification.seed]
   [metabase.notification.send :as notification.send]
   [metabase.notification.task.send :as notification.task.send]
   [potemkin :as p]))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Public APIs                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(p/import-vars
 [notification.payload
  notification-payload
  notification-payload-schema]
 [notification.payload.system-event
  sample-payload]
 [notification.task.send
  update-send-notification-triggers-timezone!]
 [notification.seed
  seed-notification!]
 [notification.send
  send-notification!
  *default-options*]
 [events.notification
  *skip-sending-notification?*
  notification-filter-for-topic])
