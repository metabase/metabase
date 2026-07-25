(ns metabase.workspaces.core
  (:require
   [metabase.workspaces.clone]
   [metabase.workspaces.remapping]
   [metabase.workspaces.schema]
   [potemkin :as p]))

(comment
  metabase.workspaces.clone/keep-me
  metabase.workspaces.remapping/keep-me
  metabase.workspaces.schema/keep-me)

(p/import-vars
 [metabase.workspaces.clone
  clone-entity!
  clone-row!]
 [metabase.workspaces.remapping
  add-remapping!
  check-valid-workspace-id
  check-workspace-enabled
  current-workspace-id
  delete-remapping!
  ensure-workspace-copy!
  remapped-entity-id
  remapped-entity-ids
  source-entity-id
  with-source-entity-id]
 [metabase.workspaces.schema
  entity-types])
