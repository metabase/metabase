(ns metabase-enterprise.workspaces.provisioning
  "Top-level workspace provisioning orchestration.

   [[provision-workspace!]] and [[deprovision-workspace!]] are blocking; the API
   endpoints run them in the background via
   [[metabase-enterprise.workspaces.execute/execute-async!]] and clients follow
   along through the workspace's `:status` (see
   `:metabase-enterprise.workspaces.schema/workspace-status`).

   Both operations may be retried from any status; the per-database work
   no-ops on rows that are already in their target state. On the first database
   failure the run stops — no rollbacks or retries — and the workspace records
   the failure message in `:status_details`."
  (:require
   [metabase-enterprise.workspaces.provisioning.database :as provisioning.database]
   [metabase-enterprise.workspaces.provisioning.instance :as provisioning.instance]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- workspace-database-ids [ws-id]
  (t2/select-pks-vec :model/WorkspaceDatabase :workspace_id ws-id {:order-by [[:id :asc]]}))

(mu/defn- set-workspace-status! :- :nil
  [ws-id :- pos-int?
   status :- ::ws.schema/workspace-status
   status-details :- [:maybe :string]]
  (t2/update! :model/Workspace ws-id {:status status, :status_details status-details})
  nil)

(mu/defn provision-workspace! :- :nil
  "Provision the workspace (blocking) and drive its `:status` through the
   lifecycle: provision every database (`:database-provisioning`), then the
   child instance (`:instance-provisioning`), ending `:provisioned`. Stops on the
   first failure, leaving the workspace in the phase's failure status with the
   failure message in `:status_details`, and rethrows. Safe to retry from any
   status — work that already succeeded is skipped."
  [ws-id :- pos-int?]
  (set-workspace-status! ws-id :database-provisioning nil)
  (try
    (run! provisioning.database/provision-database! (workspace-database-ids ws-id))
    (catch Throwable t
      (set-workspace-status! ws-id :database-provisioning-failure (ex-message t))
      (throw t)))
  (set-workspace-status! ws-id :instance-provisioning nil)
  (try
    (provisioning.instance/deprovision-instance! ws-id)
    (provisioning.instance/provision-instance! ws-id)
    (catch Throwable t
      (set-workspace-status! ws-id :instance-provisioning-failure (ex-message t))
      (throw t)))
  (set-workspace-status! ws-id :provisioned nil))

(mu/defn deprovision-workspace! :- :nil
  "Deprovision the workspace (blocking) and drive its `:status` through the
   lifecycle: delete the child instance (`:instance-deprovisioning`), then
   deprovision every database (`:database-deprovisioning`), ending `:unprovisioned`.
   Stops on the first failure, leaving the workspace in the phase's failure
   status with the failure message in `:status_details`, and rethrows. Safe to
   retry from any status — work that already succeeded is skipped."
  [ws-id :- pos-int?]
  (set-workspace-status! ws-id :instance-deprovisioning nil)
  (try
    (provisioning.instance/deprovision-instance! ws-id)
    (catch Throwable t
      (set-workspace-status! ws-id :instance-deprovisioning-failure (ex-message t))
      (throw t)))
  (set-workspace-status! ws-id :database-deprovisioning nil)
  (try
    (run! provisioning.database/deprovision-database! (workspace-database-ids ws-id))
    (catch Throwable t
      (set-workspace-status! ws-id :database-deprovisioning-failure (ex-message t))
      (throw t)))
  (set-workspace-status! ws-id :unprovisioned nil))
