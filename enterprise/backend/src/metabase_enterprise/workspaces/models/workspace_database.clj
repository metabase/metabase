(ns metabase-enterprise.workspaces.models.workspace-database
  (:require
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceDatabase [_model] :workspace_database)

(doto :model/WorkspaceDatabase
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceDatabase
  {:database_details mi/transform-json
   :input_schemas    mi/transform-json
   :status           mi/transform-keyword})

(defenterprise reconcile-workspace-database-refs-before-delete!
  "Enterprise impl of the `:model/Database` before-delete hook. Refuses (409) when any
   `:initialized` workspace_database rows reference `db-id` — those rows point at live
   warehouse schemas/users that must be deprovisioned explicitly first. Deletes any
   `:uninitialized` rows so the `workspace_database.database_id` FK RESTRICT doesn't
   trip on the subsequent Database delete. Deliberately NOT gated on a premium feature:
   a token expiry shouldn't leave workspace_database rows un-cleanable, and an
   :initialized row must refuse the delete regardless of current feature state."
  :feature :none
  [db-id]
  (when (t2/exists? :model/WorkspaceDatabase :database_id db-id :status :initialized)
    (throw (ex-info "Cannot delete a Database with initialized workspace_database rows; deprovision them first"
                    {:status-code 409
                     :database_id db-id})))
  (t2/delete! :model/WorkspaceDatabase :database_id db-id :status :uninitialized))
