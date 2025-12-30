(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(def base-statuses
  "Set of valid base_status values, representing the intended state of the workspace based on user actions."
  #{:active :archived})

(def db-statuses
  "Set of valid db_status values, representing the status of the isolated resources in the data warehouse."
  #{:uninitialized :pending :ready :setup-failed})

(t2/deftransforms :model/Workspace
  {:graph            mi/transform-json
   :database_details mi/transform-encrypted-json
   :base_status      (mi/transform-validator mi/transform-keyword (partial mi/assert-enum base-statuses))
   :db_status        (mi/transform-validator mi/transform-keyword (partial mi/assert-enum db-statuses))})

(defn computed-status
  "Compute backwards-compatible status from base_status and db_status.
   Returns :archived if workspace is archived, otherwise returns db_status."
  [{:keys [base_status db_status]}]
  (if (= base_status :archived)
    :archived
    db_status))

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn archive!
  "Archive a workspace. Destroys database isolation resources (best-effort), revokes access grants, sets base_status to :archived.
   Cleanup failures are logged but don't block archiving - the workspace can be unarchived to retry cleanup,
   or deleted once the underlying permission issues are resolved."
  [{workspace-id :id :as workspace}]
  ;; Only destroy isolation if workspace was initialized (not uninitialized db_status)
  (when (not= :uninitialized (:db_status workspace))
    (let [database (t2/select-one :model/Database :id (:database_id workspace))]
      ;; Best-effort cleanup - don't block archiving on cleanup failures
      (try
        (ws.isolation/destroy-workspace-isolation! database workspace)
        (catch Exception e
          (log/warnf e "Failed to cleanup isolation resources for workspace %s, proceeding with archive" workspace-id)))
      ;; Mark all inputs as un-granted since the user may have been dropped
      (t2/update! :model/WorkspaceInput {:workspace_id workspace-id}
                  {:access_granted false})))
  (t2/update! :model/Workspace workspace-id {:base_status :archived}))

(defn unarchive!
  "Unarchive a workspace. Re-initializes database isolation resources, re-grants read access
   to source tables, and changes base_status back to :active with db_status :ready.
   Cannot unarchive an uninitialized workspace (no isolation resources to restore)."
  [workspace]
  (when (= :uninitialized (:db_status workspace))
    (throw (ex-info "Cannot unarchive an uninitialized workspace" {:status-code 400})))
  (let [database         (t2/select-one :model/Database (:database_id workspace))
        isolation-result (ws.isolation/ensure-database-isolation! workspace database)
        workspace-id     (:id workspace)
        _                (t2/update! :model/Workspace workspace-id
                                     (merge {:base_status :active
                                             :db_status   :ready}
                                            (select-keys isolation-result [:schema :database_details])))
        ;; Re-fetch workspace to get updated database_details and schema for granting permissions
        updated-ws       (t2/select-one :model/Workspace workspace-id)]
    ;; Re-grant read access to source tables (inputs were marked un-granted during archive)
    (ws.impl/sync-grant-accesses! updated-ws)))

(defn delete!
  "Delete a workspace. Destroys database isolation resources and deletes the workspace."
  [workspace]
  ;; Only destroy isolation if workspace was initialized
  (when (not= :uninitialized (:db_status workspace))
    (when-let [database (t2/select-one :model/Database :id (:database_id workspace))]
      (try
        (ws.isolation/destroy-workspace-isolation! database workspace)
        (catch Exception _))
      (t2/update! :model/WorkspaceInput {:workspace_id (:id workspace)}
                  {:access_granted false})))
  (t2/delete! :model/Workspace (:id workspace)))
