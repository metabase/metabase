(ns metabase-enterprise.workspaces.models.workspace-input
  "Model for WorkspaceInput - external tables that workspace transforms consume."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceInput [_model] :workspace_input)

(doto :model/WorkspaceInput
  (derive :metabase/model)
  (derive :hook/timestamped?))
