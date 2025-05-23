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
 [metabase.notification.payload.core
  notification-payload]
 [metabase.notification.seed
  seed-notification!]
 [metabase.notification.send
  send-notification!]
 [metabase.notification.task.send
  update-send-notification-triggers-timezone!])

(defmacro with-skip-sending-notification
  "Execute `body` with [[metabase.notification.events.notification/*skip-sending-notification?*]] bound to `skip?`."
  [skip? & body]
  `(binding [metabase.notification.events.notification/*skip-sending-notification?* ~skip?]
     ~@body))

(defmacro with-default-options
  "Execute `body` with [[metabase.notification.send/*default-options*]] bound to `options`."
  [options & body]
  `(binding [metabase.notification.send/*default-options* ~options]
     ~@body))
