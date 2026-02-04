(ns metabase-enterprise.workspaces.models.workspace-output-external
  "Model for WorkspaceOutputExternal - tables that enclosed external transforms produce."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceOutputExternal [_model] :workspace_output_external)

(doto :model/WorkspaceOutputExternal
  (derive :metabase/model)
  (derive :hook/timestamped?))
