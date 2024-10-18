(ns metabase.notification.core
  "Core functionality for notifications."
  (:require
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.send :as notification.send]
   [potemkin :as p]))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Public APIs                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(p/import-vars
 [notification.payload
  notification-payload
  NotificationInfo
  NotificationPayload])

(def ^:dynamic *send-notification!*
  "The function to send a notification. Defaults to `notification.send/send-notification-async!`."
  notification.send/send-notification-async!)
