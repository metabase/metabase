(ns metabase-enterprise.workspaces.models.workspace-dependency
  "Model for WorkspaceDependency - edges between workspace transforms and their dependencies."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceDependency [_model] :workspace_dependency)

(derive :model/WorkspaceDependency :metabase/model)

(t2/deftransforms :model/WorkspaceDependency
  {:from_entity_type mi/transform-keyword
   :to_entity_type   mi/transform-keyword})
