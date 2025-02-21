(ns metabase.notification.init
  "Load notification implementation namespaces for side effects on system launch. See
  https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.notification.payload.impl.card]
   [metabase.notification.payload.impl.dashboard]
   [metabase.notification.payload.impl.system-event]))
