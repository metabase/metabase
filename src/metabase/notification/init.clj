(ns metabase.notification.init
  "Load notification implementation namespaces for side effects on system launch."
  (:require
   [metabase.notification.events.notification]
   [metabase.notification.events.report-timezone-updated]
   [metabase.notification.payload.impl.card]
   [metabase.notification.payload.impl.dashboard]
   [metabase.notification.payload.impl.system-event]
   [metabase.notification.settings]
   [metabase.notification.task.send]))
