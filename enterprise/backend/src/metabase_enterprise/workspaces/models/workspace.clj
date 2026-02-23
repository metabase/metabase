(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(def ^:private base-statuses
  "Set of valid base_status values, representing the synchronous lifecycle."
  #{:empty :active :archived})

(def ^:private db-statuses
  "Set of valid db_status values, representing the status of the data warehouse."
  #{:uninitialized :pending :ready :broken})

(t2/deftransforms :model/Workspace
  {:database_details mi/transform-encrypted-json
   :base_status      (mi/transform-validator mi/transform-keyword (partial mi/assert-enum base-statuses))
   :db_status        (mi/transform-validator mi/transform-keyword (partial mi/assert-enum db-statuses))})

(defn computed-status
  "Compute backwards-compatible status from base_status and db_status.
   Returns :archived if workspace is archived, otherwise returns db_status."
  [{:keys [base_status db_status]}]
  (case base_status
    :empty :uninitialized
    :archived :archived
    db_status))

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn archive!
  "Archive a workspace. Destroys database isolation resources (best-effort), revokes access grants,
   sets base_status to :archived and db_status to :uninitialized.
   Cleanup failures are logged but don't block archiving - the workspace can be unarchived to retry cleanup,
   or deleted once the underlying permission issues are resolved."
  [{workspace-id :id :as workspace}]
  (let [database (t2/select-one :model/Database :id (:database_id workspace))
        ;; Best-effort cleanup - don't block archiving on cleanup failures
        ;; Only destroy isolation if workspace was initialized (not uninitialized db_status)
        cleaned? (when (not= :uninitialized (:db_status workspace))
                   (try
                     (ws.isolation/destroy-workspace-isolation! database workspace)
                     true
                     (catch Exception e
                       (log/warnf e "Failed to cleanup isolation resources for workspace %s, proceeding with archive" workspace-id)
                       false)))]
    ;; Mark all inputs as un-granted since the user *may* have been dropped (even if there were some failures)
    (t2/update! :model/WorkspaceInput {:workspace_id workspace-id}
                {:access_granted false})
    ;; Update workspace status and increment graph_version (will need recalculation on unarchive)
    (t2/update! :model/Workspace workspace-id
                {:base_status   :archived
                 :db_status     (if cleaned? :uninitialized :broken)
                 :graph_version [:+ :graph_version 1]})))

(defn unarchive!
  "Unarchive a workspace. If workspace has transforms, re-initializes database isolation resources,
   re-grants read access to source tables, and sets base_status to :active with db_status :ready.
   If workspace is empty (no transforms), sets base_status to :empty and leaves db_status as :uninitialized."
  [workspace]
  (let [workspace-id (:id workspace)
        has-transforms? (t2/exists? :model/WorkspaceTransform :workspace_id workspace-id)]
    ;; Delete old graph data - will be recalculated
    (t2/delete! :model/WorkspaceGraph :workspace_id workspace-id)
    (if has-transforms?
      ;; Workspace has transforms - re-initialize database isolation
      (let [database         (t2/select-one :model/Database (:database_id workspace))
            isolation-result (ws.isolation/ensure-database-isolation! workspace database)
            ;; Update workspace status and increment graph_version for recalculation
            _                (t2/update! :model/Workspace workspace-id
                                         (merge {:base_status   :active
                                                 :db_status     :ready
                                                 :graph_version [:+ :graph_version 1]}
                                                (select-keys isolation-result [:schema :database_details])))
            ;; Re-fetch workspace to get updated database_details and schema for granting permissions
            updated-ws       (t2/select-one :model/Workspace workspace-id)]
        ;; Re-grant read access to source tables (inputs were marked un-granted during archive)
        (ws.impl/sync-grant-accesses! updated-ws))
      ;; Workspace is empty - just set to empty status
      (t2/update! :model/Workspace workspace-id {:base_status :empty}))))

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
