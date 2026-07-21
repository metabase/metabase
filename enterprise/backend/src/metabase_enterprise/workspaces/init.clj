(ns metabase-enterprise.workspaces.init
  "Loader for the workspaces EE module. Requires namespaces that register
   models, settings, and `defenterprise` overrides so the EE behavior is wired
   up before the QP middleware or model lifecycle hooks run."
  (:require
   [metabase-enterprise.workspaces.models.workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase-enterprise.workspaces.models.workspace-remapping]
   [metabase-enterprise.workspaces.query-processor]
   [metabase-enterprise.workspaces.settings]))
