(ns metabase-enterprise.workspaces.models.workspace-database
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceDatabase [_model] :workspace_database)

(doto :model/WorkspaceDatabase
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceDatabase
  {:database_details mi/transform-encrypted-json
   :input            mi/transform-json
   :status           mi/transform-keyword})

;;; --------------------------------------- Permission predicates ---------------------------------------
;;;
;;; - read:          Data Analyst.
;;; - write/create:  Data Analyst + `:perms/workspaces :yes` for `:database_id`.

(defmethod mi/can-read? :model/WorkspaceDatabase
  ([_instance]
   (api/is-data-analyst?))
  ([_model _pk]
   (api/is-data-analyst?)))

(defmethod mi/can-write? :model/WorkspaceDatabase
  ([{:keys [database_id]}]
   (and (api/is-data-analyst?)
        (perms/has-db-workspaces-permission? api/*current-user-id* database_id)))
  ([_model pk]
   (when-let [wsd (t2/select-one :model/WorkspaceDatabase :id pk)]
     (mi/can-write? wsd))))

(defmethod mi/can-create? :model/WorkspaceDatabase
  [_model {:keys [database_id]}]
  (and (api/is-data-analyst?)
       (perms/has-db-workspaces-permission? api/*current-user-id* database_id)))

(defenterprise reconcile-workspace-database-refs-before-delete!
  "Enterprise impl of the `:model/Database` before-delete hook. Refuses (409) when any
   non-`:unprovisioned` workspace_database row references `db-id` — anything in a
   `:provisioning`, `:provisioned`, or `:deprovisioning` state points at (or is in
   flight against) live warehouse schemas/users that must be unprovisioned explicitly
   first. Deletes any `:unprovisioned` rows so the `workspace_database.database_id`
   FK RESTRICT doesn't trip on the subsequent Database delete. Deliberately NOT gated
   on a premium feature: a token expiry shouldn't leave workspace_database rows
   un-cleanable, and an active row must refuse the delete regardless of current
   feature state."
  :feature :none
  [db-id]
  (when (t2/exists? :model/WorkspaceDatabase
                    :database_id db-id
                    :status [:not= :unprovisioned])
    (throw (ex-info "Cannot delete a Database with active workspace_database rows; deprovision them first"
                    {:status-code 409
                     :database_id db-id})))
  (t2/delete! :model/WorkspaceDatabase :database_id db-id :status :unprovisioned))
