(ns metabase.notification.core
  "Core functionality for notifications."
  (:require
   [metabase.notification.events.notification]
   [metabase.notification.models]
   [metabase.notification.payload.core]
   [metabase.notification.seed]
   [metabase.notification.send]
   [potemkin :as p]))

(comment
  metabase.notification.events.notification/keep-me
  metabase.notification.payload.core/keep-me
  metabase.notification.seed/keep-me
  metabase.notification.send/keep-me)

(p/import-vars
 [metabase.notification.models
  delete-card-notifications-and-notify!]
 [metabase.notification.payload.core
  notification-payload
  notification-payload-schema]
 [metabase.notification.seed
  seed-notification!]
 [metabase.notification.send
  send-notification!
  shutdown!
  *default-options*]
 [metabase.notification.events.notification
  *skip-sending-notification?*
  notification-filter-for-topic])

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
