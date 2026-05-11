(ns metabase-enterprise.workspaces.models.workspace-database-operation-step
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceDatabaseOperationStep [_model]
  :workspace_database_operation_step)

(doto :model/WorkspaceDatabaseOperationStep
  (derive :metabase/model))

(t2/deftransforms :model/WorkspaceDatabaseOperationStep
  {:status mi/transform-keyword
   :op     mi/transform-keyword})
