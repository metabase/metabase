(ns metabase-enterprise.workspaces.init
  "Eager-loads namespaces that need to register side-effecting multimethods on startup.
   Currently: the recurring `_mb_remappings` → app-db poller task."
  (:require
   [metabase-enterprise.workspaces.task.remapping-poll]))
