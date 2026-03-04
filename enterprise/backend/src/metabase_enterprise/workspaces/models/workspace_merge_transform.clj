(ns metabase-enterprise.workspaces.models.workspace-merge-transform
  "Model for WorkspaceMergeTransform - tracks individual transform merges.
   Linked to WorkspaceMerge for batch merges, standalone for single-transform merges.
   Survives workspace deletion through inlined workspace_name."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Model Setup --------------------------------------------------

(methodical/defmethod t2/table-name :model/WorkspaceMergeTransform [_model] :workspace_merge_transform)

(doto :model/WorkspaceMergeTransform
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
