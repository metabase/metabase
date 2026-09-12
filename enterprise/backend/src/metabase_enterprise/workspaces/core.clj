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

(defenterprise-schema remap-table! :- ::ws.schema/table-info
  "Record (or reuse) the remapping of the canonical table `table-name` in `schema` and return its workspace table."
  :feature :workspaces
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (ws.impl/remap-table! db-id schema table-name))

(defenterprise-schema unmap-table! :- :nil
  "Delete the remapping of the canonical table `table-name` in `schema`."
  :feature :workspaces
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (ws.impl/unmap-table! db-id schema table-name))

(defenterprise-schema workspace-table :- ::ws.schema/table-info
  "The workspace table backing the canonical table `table-name` in `schema`, or that table itself."
  :feature :workspaces
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (ws.impl/workspace-table db-id schema table-name))

(defenterprise-schema canonical-table :- ::ws.schema/table-info
  "The canonical table backed by the workspace table `table-name` in `schema`, or that table itself."
  :feature :workspaces
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (ws.impl/canonical-table db-id schema table-name))

(defenterprise-schema table-remappings :- [:sequential ::ws.schema/workspace-table-remapping]
  "Every remapping of the Database with `db-id`."
  :feature :workspaces
  [db-id :- ::lib.schema.id/database]
  (ws.impl/table-remappings db-id))

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
