(ns metabase.notification.core
  "Core functionality for notifications."
  (:require
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.seed :as notification.seed]
   [metabase.notification.send :as notification.send]
   [metabase.notification.task.send :as notification.task.send]
   [potemkin :as p]))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Public APIs                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(p/import-vars
 [notification.payload
  notification-payload]
 [notification.task.send
  update-send-notification-triggers-timezone!]
 [notification.seed
  seed-notification!]
 [notification.send
  send-notification!])
