(ns metabase-enterprise.workspaces.models.workspace-merge
  "Model for WorkspaceMerge - tracks batch merge events with commit messages.
   Survives workspace deletion through inlined workspace_name."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Model Setup --------------------------------------------------

(methodical/defmethod t2/table-name :model/WorkspaceMerge [_model] :workspace_merge)

(doto :model/WorkspaceMerge
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
