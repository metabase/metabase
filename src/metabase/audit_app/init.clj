(ns metabase.audit-app.init
  (:require
   [metabase.audit-app.events.audit-log]
   [metabase.audit-app.settings]
   [metabase.audit-app.task.truncate-audit-tables]))
