(ns metabase-enterprise.workspaces.models.workspace-input
  "Model for WorkspaceInput - unique external tables that workspace transforms consume.
   Each row represents a unique (workspace_id, db_id, schema, table) tuple.
   The m2m relationship to transforms is in workspace_input_transform."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceInput [_model] :workspace_input)

(doto :model/WorkspaceInput
  (derive :metabase/model)
  (derive :hook/timestamped?))
