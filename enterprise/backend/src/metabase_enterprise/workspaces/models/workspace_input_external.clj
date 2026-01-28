(ns metabase-enterprise.workspaces.models.workspace-input-external
  "Model for WorkspaceInputExternal - external tables that enclosed external transforms consume."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceInputExternal [_model] :workspace_input_external)

(doto :model/WorkspaceInputExternal
  (derive :metabase/model)
  (derive :hook/timestamped?))
