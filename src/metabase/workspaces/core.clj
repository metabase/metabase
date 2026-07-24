(ns metabase.workspaces.core
  (:require
   [metabase.workspaces.remapping]
   [metabase.workspaces.schema]
   [potemkin :as p]))

(comment
  metabase.workspaces.remapping/keep-me
  metabase.workspaces.schema/keep-me)

(p/import-vars
 [metabase.workspaces.remapping
  check-valid-workspace-id
  check-workspace-enabled
  current-workspace-id
  remapped-entity-id
  source-entity-id]
 [metabase.workspaces.schema
  entity-types])
