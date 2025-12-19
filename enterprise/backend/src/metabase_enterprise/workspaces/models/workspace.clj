(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(t2/deftransforms :model/Workspace
  {:graph            mi/transform-json
   :database_details mi/transform-encrypted-json
   :status           mi/transform-keyword})

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn archive!
  "Archive a workspace. Destroys database isolation resources, revokes access grants, sets archived_at."
  [{workspace-id :id :as workspace}]
  ;; Only destroy isolation if workspace was initialized (not uninitialized status)
  (when (not= :uninitialized (:status workspace))
    (let [database (t2/select-one :model/Database :id (:database_id workspace))]
      (ws.isolation/destroy-workspace-isolation! database workspace)
      ;; Mark all inputs as un-granted since the user was dropped
      (t2/update! :model/WorkspaceInput {:workspace_id workspace-id}
                  {:access_granted false})))
  (t2/update! :model/Workspace workspace-id {:archived_at [:now]}))

(defn unarchive!
  "Unarchive a workspace. Re-initializes database isolation resources, re-grants read access
   to source tables, and clears archived_at.
   Cannot unarchive an uninitialized workspace (no isolation resources to restore)."
  [workspace]
  (when (= :uninitialized (:status workspace))
    (throw (ex-info "Cannot unarchive an uninitialized workspace" {:status-code 400})))
  (let [database         (t2/select-one :model/Database (:database_id workspace))
        isolation-result (ws.isolation/ensure-database-isolation! workspace database)
        workspace-id     (:id workspace)
        _                (t2/update! :model/Workspace workspace-id
                                     (merge {:archived_at nil}
                                            (select-keys isolation-result [:schema :database_details])))
        ;; Re-fetch workspace to get updated database_details and schema for granting permissions
        updated-ws       (t2/select-one :model/Workspace workspace-id)]
    ;; Re-grant read access to source tables (inputs were marked un-granted during archive)
    (ws.impl/sync-grant-accesses! updated-ws)))

(defn delete!
  "Delete a workspace. Destroys database isolation resources and deletes the workspace."
  [workspace]
  ;; Only destroy isolation if workspace was initialized (not uninitialized status)
  (when (not= :uninitialized (:status workspace))
    (let [database (t2/select-one :model/Database :id (:database_id workspace))]
      (ws.isolation/destroy-workspace-isolation! database workspace)
      (t2/update! :model/WorkspaceInput {:workspace_id (:id workspace)}
                  {:access_granted false})))
  (t2/delete! :model/Workspace (:id workspace)))
