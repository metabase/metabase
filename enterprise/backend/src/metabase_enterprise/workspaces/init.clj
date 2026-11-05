(ns metabase-enterprise.workspaces.init
  "Loads the namespaces that implement the workspace hooks, so the first query or sync after boot already sees them."
  (:require
   [metabase-enterprise.workspaces.config-file]
   [metabase-enterprise.workspaces.core]
   [metabase-enterprise.workspaces.settings]))
