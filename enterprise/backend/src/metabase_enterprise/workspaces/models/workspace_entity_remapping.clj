(ns metabase-enterprise.workspaces.models.workspace-entity-remapping
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceEntityRemapping [_model] :workspace_entity_remapping)

(doto :model/WorkspaceEntityRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/WorkspaceEntityRemapping
  {:entity_type mi/transform-keyword})
