(ns metabase-enterprise.workspaces.init
  "Initialize workspace models. Driver workspace isolation methods are now
   defined directly in the driver files."
  (:require
   [metabase-enterprise.workspaces.events]
   [metabase-enterprise.workspaces.models.workspace]
   [metabase-enterprise.workspaces.models.workspace-graph]
   [metabase-enterprise.workspaces.models.workspace-transform]
   [metabase-enterprise.workspaces.settings]))
