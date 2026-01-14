(ns metabase-enterprise.workspaces.models.workspace-input
  "Model for WorkspaceInput - external tables that workspace transforms consume.
   Each input is linked to a specific transform via ref_id."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceInput [_model] :workspace_input)

(doto :model/WorkspaceInput
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceInput
  {:ref_id mi/transform-trim})
