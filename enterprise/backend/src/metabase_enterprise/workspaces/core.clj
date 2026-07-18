(ns metabase-enterprise.workspaces.core
  "API namespace for the `workspaces` module. Re-exports the module's public
   surface — require this, not the internal namespaces, from outside the module."
  (:require
   [metabase-enterprise.workspaces.provisioning]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 [metabase-enterprise.workspaces.provisioning
  clear-instance-workspace!
  create-workspace!
  db-workspace-namespace
  delete-workspace!
  get-workspace
  instance-workspace
  list-remappings
  list-workspaces
  set-instance-workspace!
  workspace-mode?])
