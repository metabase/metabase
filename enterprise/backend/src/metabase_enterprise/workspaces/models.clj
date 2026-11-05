(ns metabase-enterprise.workspaces.models
  "Toucan 2 models of the parent's workspace tables."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/table-name :model/WorkspaceDatabase [_model] :workspace_database)

(doto :model/WorkspaceDatabase
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceDatabase
  {:database_details (mi/transform-encrypted-json "workspace_database.database_details")
   :status           mi/transform-keyword})

(methodical/defmethod t2/table-name :model/WorkspaceSchema [_model] :workspace_schema)

(derive :model/WorkspaceSchema :metabase/model)

(t2/deftransforms :model/WorkspaceSchema
  {:status mi/transform-keyword})

(methodical/defmethod t2/table-name :model/WorkspaceProvisioningConnection [_model] :workspace_provisioning_connection)

(methodical/defmethod t2/primary-keys :model/WorkspaceProvisioningConnection [_model] [:database_id])

(doto :model/WorkspaceProvisioningConnection
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?))

(t2/deftransforms :model/WorkspaceProvisioningConnection
  {:details (mi/transform-encrypted-json "workspace_provisioning_connection.details")})
