(ns metabase-enterprise.workspaces.init
  "Eager-loads namespaces that need to register side-effecting multimethods on startup."
  (:require
   [metabase-enterprise.workspaces.task.remapping-poll]
   [metabase-enterprise.workspaces.transform-hooks]))
