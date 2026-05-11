(ns metabase-enterprise.workspaces.models.workspace-database-operation
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceDatabaseOperation [_model]
  :workspace_database_operation)

(doto :model/WorkspaceDatabaseOperation
  (derive :metabase/model))

(t2/deftransforms :model/WorkspaceDatabaseOperation
  {:requested_input mi/transform-json
   :status          mi/transform-keyword
   :op_type         mi/transform-keyword})
