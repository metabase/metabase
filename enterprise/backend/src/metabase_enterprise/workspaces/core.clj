(ns metabase-enterprise.workspaces.core
  "Public API for the workspaces module. A workspace is a self-contained checkout of a git branch: its content
  lives in the same tables as the main app, tagged with a `workspace_id`. The `:model/Workspace` model itself is
  referenced by other modules via its keyword; this facade re-exports the lifecycle operations callers need."
  (:require
   [metabase-enterprise.workspaces.impl :as impl]
   [potemkin :as p]))

(comment impl/keep-me)

(p/import-vars
 [impl
  delete-workspace!])
