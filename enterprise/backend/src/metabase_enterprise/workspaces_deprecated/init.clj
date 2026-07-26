(ns metabase-enterprise.workspaces-deprecated.init
  "Loader for the workspaces EE module. Requires namespaces that register
   `defenterprise` overrides so the EE behavior is wired up before sync,
   QP middleware, or model lifecycle hooks run.

   Without this eager load, the OSS `defenterprise` declarations in
   `metabase.workspaces.table-remapping` resolve to identity fallbacks on
   cold-boot sync (the lazy `classloader/require` inside `defenterprise`
   races the registry consult), and isolation-schema tables leak into
   app-db. See `metabase-enterprise.core.init` docstring for the broader
   pattern."
  (:require
   [metabase-enterprise.workspaces-deprecated.models.workspace]
   [metabase-enterprise.workspaces-deprecated.models.workspace-database]
   [metabase-enterprise.workspaces-deprecated.query-processor.middleware]
   [metabase-enterprise.workspaces-deprecated.settings]
   [metabase-enterprise.workspaces-deprecated.table-remapping]
   [metabase-enterprise.workspaces-deprecated.transform-hooks]))
