(ns metabase-enterprise.workspaces.init
  "Loader for the workspaces EE module, which requires the namespaces that register `defenterprise` overrides and
  model hooks so they are wired up before the QP middleware, transforms or model lifecycle hooks run; see
  `metabase-enterprise.core.init`."
  (:require
   [metabase-enterprise.workspaces.events]
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase-enterprise.workspaces.models.workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase-enterprise.workspaces.query-processor.middleware]
   [metabase-enterprise.workspaces.settings]
   [metabase-enterprise.workspaces.table-remapping]
   [metabase-enterprise.workspaces.transform-hooks]))
