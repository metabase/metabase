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
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- workspace-databases [workspace-id]
  (t2/select :model/WorkspaceDatabase :workspace_id workspace-id {:order-by [[:id :asc]]}))

(mu/defn- set-workspace-status! :- :nil
  [workspace-id :- pos-int?
   status :- ::ws.schema/workspace-status
   status-details :- [:maybe :string]]
  (t2/update! :model/Workspace workspace-id {:status status, :status_details status-details})
  nil)

(mu/defn provision-workspace! :- :nil
  "Provision every database of `workspace` (blocking) and drive the workspace's
   `:status` through the lifecycle. Stops on the first database failure, leaving
   the workspace `:provisioning-failure` with the failure message in
   `:status_details`. Safe to retry from any status."
  [{ws-id :id} :- ::ws.schema/workspace]
  (set-workspace-status! ws-id :provisioning nil)
  (try
    (run! provisioning.database/provision-database! (workspace-databases ws-id))
    (set-workspace-status! ws-id :provisioned nil)
    (catch Throwable t
      (log/warnf t "Failed to provision workspace %s" ws-id)
      (set-workspace-status! ws-id :provisioning-failure (ex-message t)))))

(mu/defn deprovision-workspace! :- :nil
  "Deprovision every database of `workspace` (blocking) and drive the workspace's
   `:status` through the lifecycle, ending `:unprovisioned`. Stops on the first
   database failure, leaving the workspace `:deprovisioning-failure` with the
   failure message in `:status_details`. Safe to retry from any status."
  [{ws-id :id} :- ::ws.schema/workspace]
  (set-workspace-status! ws-id :deprovisioning nil)
  (try
    (run! provisioning.database/deprovision-database! (workspace-databases ws-id))
    (set-workspace-status! ws-id :unprovisioned nil)
    (catch Throwable t
      (log/warnf t "Failed to deprovision workspace %s" ws-id)
      (set-workspace-status! ws-id :deprovisioning-failure (ex-message t)))))
