(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(def workspace-statuses
  "Set of valid workspace statuses."
  #{:uninitialized :pending :ready :setup-failed :archived}
  #_#{:enum :uninitialized :database-not-read :graph-not-ready :ready})

(t2/deftransforms :model/Workspace
  {:graph            mi/transform-json
   :database_details mi/transform-encrypted-json
   :status           (mi/transform-validator mi/transform-keyword (partial mi/assert-enum workspace-statuses))})

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn archive!
  "Archive a workspace. Destroys database isolation resources (best-effort), revokes access grants, sets status to :archived.
   Cleanup failures are logged but don't block archiving - the workspace can be unarchived to retry cleanup,
   or deleted once the underlying permission issues are resolved."
  [{workspace-id :id :as workspace}]
  ;; Only destroy isolation if workspace was initialized (not uninitialized status)
  (when (not= :uninitialized (:status workspace))
    (let [database (t2/select-one :model/Database :id (:database_id workspace))]
      ;; Best-effort cleanup - don't block archiving on cleanup failures
      (try
        (ws.isolation/destroy-workspace-isolation! database workspace)
        (catch Exception e
          (log/warnf e "Failed to cleanup isolation resources for workspace %s, proceeding with archive" workspace-id)))
      ;; Mark all inputs as un-granted since the user may have been dropped
      (t2/update! :model/WorkspaceInput {:workspace_id workspace-id}
                  {:access_granted false})))
  (t2/update! :model/Workspace workspace-id {:status :archived}))

(defn unarchive!
  "Unarchive a workspace. Re-initializes database isolation resources, re-grants read access
   to source tables, and changes status back to :ready.
   Cannot unarchive an uninitialized workspace (no isolation resources to restore)."
  [workspace]
  (when (= :uninitialized (:status workspace))
    (throw (ex-info "Cannot unarchive an uninitialized workspace" {:status-code 400})))
  (let [database         (t2/select-one :model/Database (:database_id workspace))
        isolation-result (ws.isolation/ensure-database-isolation! workspace database)
        workspace-id     (:id workspace)
        _                (t2/update! :model/Workspace workspace-id
                                     (merge {:status :ready}
                                            (select-keys isolation-result [:schema :database_details])))
        ;; Re-fetch workspace to get updated database_details and schema for granting permissions
        updated-ws       (t2/select-one :model/Workspace workspace-id)]
    ;; Re-grant read access to source tables (inputs were marked un-granted during archive)
    (ws.impl/sync-grant-accesses! updated-ws)))

(defn delete!
  "Delete a workspace. Destroys database isolation resources and deletes the workspace."
  [workspace]
  ;; Only destroy isolation if workspace was initialized (not uninitialized status)
  ;; TODO this doesn't work anymore, because status becomes "archived"
  ;;      will be fixable when we have separate db_status (BOT-759)
  (when (not= :uninitialized (:status workspace))
    (when-let [database (t2/select-one :model/Database :id (:database_id workspace))]
      (try
        (ws.isolation/destroy-workspace-isolation! database workspace)
        (catch Exception _))
      (t2/update! :model/WorkspaceInput {:workspace_id (:id workspace)}
                  {:access_granted false})))
  (t2/delete! :model/Workspace (:id workspace)))
