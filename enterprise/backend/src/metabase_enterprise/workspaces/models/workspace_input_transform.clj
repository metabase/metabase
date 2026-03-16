(ns metabase-enterprise.workspaces.models.workspace-input-transform
  "Model for WorkspaceInputTransform - join table linking workspace inputs to the transforms that depend on them.
   Each row associates a unique input table (in workspace_input) with a specific transform version."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceInputTransform [_model] :workspace_input_transform)

(doto :model/WorkspaceInputTransform
  (derive :metabase/model))

(t2/deftransforms :model/WorkspaceInputTransform
  {:ref_id mi/transform-trim})
