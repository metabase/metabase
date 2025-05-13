(ns metabase.notification.core
  "Core functionality for notifications."
  (:require
   [metabase.notification.card]
   [metabase.notification.events.notification]
   [metabase.notification.payload.core]
   [metabase.notification.seed]
   [metabase.notification.send]
   [metabase.notification.task.send]
   [potemkin :as p]))

(comment
  metabase.notification.card/keep-me
  metabase.notification.events.notification/keep-me
  metabase.notification.payload.core/keep-me
  metabase.notification.seed/keep-me
  metabase.notification.send/keep-me
  metabase.notification.task.send/keep-me)

(p/import-vars
 [metabase.notification.card
  delete-card-notifications-and-notify!]
 #_[metabase.notification.events.notification
    *skip-sending-notification?*]
 [metabase.notification.payload.core
  notification-payload]
 [metabase.notification.seed
  seed-notification!]
 [metabase.notification.send
  send-notification!]
 [metabase.notification.task.send
  #_*default-options*
  update-send-notification-triggers-timezone!])
