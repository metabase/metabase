(ns metabase-enterprise.workspaces.models.workspace-mapping
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceMappingTable [_model] :workspace_mapping_table)

(methodical/defmethod t2/primary-keys :model/WorkspaceMappingTable [_model] [:upstream_id :downstream_id])

(doto :model/WorkspaceMappingTable
  (derive :metabase/model))

(methodical/defmethod t2/table-name :model/WorkspaceMappingTransform [_model] :workspace_mapping_transform)

(methodical/defmethod t2/primary-keys :model/WorkspaceMappingTransform [_model] [:upstream_id :downstream_id])

(doto :model/WorkspaceMappingTransform
  (derive :metabase/model))
