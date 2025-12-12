(ns metabase-enterprise.workspaces.core
  (:require
   [metabase-enterprise.workspaces.dependencies]
   [metabase-enterprise.workspaces.isolation]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.workspaces.dependencies
  analyze-entity
  write-dependencies!]

 [metabase-enterprise.workspaces.isolation
  with-workspace-isolation])
