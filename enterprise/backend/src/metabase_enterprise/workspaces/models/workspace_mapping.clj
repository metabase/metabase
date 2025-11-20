(ns metabase-enterprise.workspaces.models.workspace-mapping
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceMappingTable [_model] :workspace_mapping_table)

(doto :model/WorkspaceMappingTable
  (derive :metabase/model))

(methodical/defmethod t2/table-name :model/WorkspaceMappingTransform [_model] :workspace_mapping_transform)

(doto :model/WorkspaceMappingTransform
  (derive :metabase/model))
