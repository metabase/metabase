(ns metabase-enterprise.workspaces.core
  "EE implementations of the workspace mode hooks declared in `metabase.workspaces.core`."
  (:require
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :refer [defenterprise-schema]]
   [metabase.workspaces.core :as workspaces]
   [metabase.workspaces.schema :as ws.schema]))

;;; Every hook below takes the workspace from [[metabase.workspaces.core/*current-workspace-id*]] rather than as an
;;; argument, so the OSS arities stay as they were and callers scope themselves with `with-workspace`.
;;;
;;; The write path (`remap-table!`) demands a workspace: materializing into the canonical table is the outcome
;;; worth refusing. The read paths tolerate its absence and answer with the canonical table, which is what a
;;; caller outside any workspace should see.

(defenterprise-schema remap-table! :- ::ws.schema/table-info
  "Record (or reuse) the current workspace's remapping of the canonical table `table-name` in `schema` and return its
  workspace table. Throws when no workspace is in effect."
  :feature :workspaces
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (ws.impl/remap-table! (workspaces/current-workspace-id-or-throw) db-id schema table-name))

(defenterprise-schema unmap-table! :- :boolean
  "Delete the current workspace's remapping of the canonical table `table-name` in `schema`, returning whether there
  was one. False when no workspace is in effect: there is nothing to unmap."
  :feature :workspaces
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (if-let [workspace-id (workspaces/current-workspace-id)]
    (ws.impl/unmap-table! workspace-id db-id schema table-name)
    false))

(defenterprise-schema workspace-table :- ::ws.schema/table-info
  "The current workspace's table backing the canonical table `table-name` in `schema`, or that table itself when
  there is no remapping or no workspace in effect."
  :feature :workspaces
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (if-let [workspace-id (workspaces/current-workspace-id)]
    (ws.impl/workspace-table workspace-id db-id schema table-name)
    {:schema schema, :name table-name}))

(defenterprise-schema canonical-table :- ::ws.schema/table-info
  "The canonical table backed by the workspace table `table-name` in `schema` in the current workspace, or that table
  itself when it is not one or no workspace is in effect."
  :feature :workspaces
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (if-let [workspace-id (workspaces/current-workspace-id)]
    (ws.impl/canonical-table workspace-id db-id schema table-name)
    {:schema schema, :name table-name}))

(defenterprise-schema table-remappings :- [:sequential ::ws.schema/workspace-table-remapping]
  "Every remapping of the Database with `db-id` in the current workspace; empty when none is in effect."
  :feature :workspaces
  [db-id :- ::lib.schema.id/database]
  (if-let [workspace-id (workspaces/current-workspace-id)]
    (ws.impl/table-remappings workspace-id db-id)
    []))

(defenterprise-schema enabled? :- :boolean
  "Whether workspaces are enabled on this instance."
  :feature :workspaces
  []
  (boolean (ws.settings/workspaces-enabled)))

(defenterprise-schema workspace-schemas :- [:sequential [:map
                                                         [:db_id ::lib.schema.id/database]
                                                         [:schema ::lib.schema.common/non-blank-string]]]
  "Every `{:db_id, :schema}` transforms write their output into while workspaces are on."
  :feature :workspaces
  []
  (if (workspaces/allow-table-remapping?)
    (ws.impl/workspace-schemas)
    []))

(defenterprise-schema current-workspace-id :- [:maybe pos-int?]
  "The workspace whose remappings the Table overlay should resolve against, or nil for none.

  The overlay builds SQL rather than calling the remapping hooks, so it reads the binding through this rather than
  taking a workspace as an argument -- the ~10 `table-query` call sites have no workspace to pass. Nil when
  remapping is suppressed, so a caller showing someone the SQL they authored sees canonical tables here too."
  :feature :workspaces
  []
  (when (workspaces/allow-table-remapping?)
    (workspaces/current-workspace-id)))
