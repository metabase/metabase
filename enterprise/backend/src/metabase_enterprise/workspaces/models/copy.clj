(ns metabase-enterprise.workspaces.models.copy
  "Toucan 2 models for how the copies that a workspace's transforms write differ from the Tables and Fields that every
   workspace shares: `workspace_table_copy`, whether a Table is active in the workspace, and `workspace_field_copy`, a
   Field as the workspace's copy of its Table has it. A request that names the workspace reads them over the shared
   metadata."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/WorkspaceTableCopy [_model] :workspace_table_copy)
(methodical/defmethod t2/table-name :model/WorkspaceFieldCopy [_model] :workspace_field_copy)

(doseq [model [:model/WorkspaceTableCopy :model/WorkspaceFieldCopy]]
  (doto model
    (derive :metabase/model)
    (derive :hook/timestamped?)))

(t2/deftransforms :model/WorkspaceFieldCopy
  {:base_type      mi/transform-keyword
   :effective_type mi/transform-keyword})
