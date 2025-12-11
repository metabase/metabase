(ns metabase-enterprise.workspaces.models.workspace-dependency
  "Model for WorkspaceDependency - edges between workspace transforms and their dependencies."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceDependency [_model] :workspace_dependency)

(doto :model/WorkspaceDependency
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/WorkspaceDependency
  {:from_entity_type mi/transform-keyword
   :to_entity_type   mi/transform-keyword
   :from_entity_id   mi/transform-trim})
