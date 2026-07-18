(ns metabase-enterprise.workspaces.provisioning
  "Top-level workspace provisioning orchestration: [[provision-workspace!]] and
   [[deprovision-workspace!]], recording progress in the workspace's
   `:status`/`:status_details` (see
   `:metabase-enterprise.workspaces.schema/workspace-status`). The API runs
   them in the background."
  (:require
   [metabase-enterprise.workspaces.provisioning.database :as provisioning.database]
   [metabase-enterprise.workspaces.provisioning.instance :as provisioning.instance]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- workspace-databases [ws-id]
  (t2/select :model/WorkspaceDatabase :workspace_id ws-id {:order-by [[:id :asc]]}))

(mu/defn workspace-provisioning? :- :boolean
  "True when a provision run is in flight for `workspace` (its `:status` is
   `:database-provisioning` or `:instance-provisioning`)."
  [workspace :- ::ws.schema/workspace]
  (contains? #{:database-provisioning :instance-provisioning} (:status workspace)))

(mu/defn workspace-deprovisioning? :- :boolean
  "True when a deprovision run is in flight for `workspace` (its `:status` is
   `:instance-deprovisioning` or `:database-deprovisioning`)."
  [workspace :- ::ws.schema/workspace]
  (contains? #{:instance-deprovisioning :database-deprovisioning} (:status workspace)))

(mu/defn- set-workspace-status! :- :nil
  [ws-id :- pos-int?
   status :- ::ws.schema/workspace-status
   status-details :- [:maybe :string]]
  (t2/update! :model/Workspace ws-id {:status status, :status_details status-details})
  nil)

(mu/defn set-workspace-provisioning-status! :- :nil
  "Set `:database-provisioning`, the first status of the provisioning path.
   Called before the background run starts so the run is immediately visible
   as in flight."
  [{ws-id :id} :- ::ws.schema/workspace]
  (set-workspace-status! ws-id :database-provisioning nil))

(mu/defn set-workspace-deprovisioning-status! :- :nil
  "Set `:instance-deprovisioning`, the first status of the deprovisioning path.
   Called before the background run starts so the run is immediately visible
   as in flight."
  [{ws-id :id} :- ::ws.schema/workspace]
  (set-workspace-status! ws-id :instance-deprovisioning nil))

(mu/defn provision-workspace! :- :nil
  "Provision `workspace` (blocking): every database, then the child instance,
   ending `:provisioned`. Stops on the first failure — the phase's `*-failure`
   status and the error message land on the workspace — and rethrows. Retries
   skip work that already succeeded."
  [{ws-id :id :as workspace} :- ::ws.schema/workspace]
  (set-workspace-provisioning-status! workspace)
  (try
    (run! provisioning.database/provision-database! (workspace-databases ws-id))
    (catch Throwable t
      (set-workspace-status! ws-id :database-provisioning-failure (ex-message t))
      (throw t)))
  (set-workspace-status! ws-id :instance-provisioning nil)
  (try
    (provisioning.instance/deprovision-instance! workspace)
    (provisioning.instance/provision-instance! workspace)
    (catch Throwable t
      (set-workspace-status! ws-id :instance-provisioning-failure (ex-message t))
      (throw t)))
  (set-workspace-status! ws-id :provisioned nil))

(mu/defn deprovision-workspace! :- :nil
  "Deprovision `workspace` (blocking): the child instance, then every database,
   ending `:unprovisioned`. Stops on the first failure — the phase's `*-failure`
   status and the error message land on the workspace — and rethrows. Retries
   skip work that already succeeded."
  [{ws-id :id :as workspace} :- ::ws.schema/workspace]
  (set-workspace-deprovisioning-status! workspace)
  (try
    (provisioning.instance/deprovision-instance! workspace)
    (catch Throwable t
      (set-workspace-status! ws-id :instance-deprovisioning-failure (ex-message t))
      (throw t)))
  (set-workspace-status! ws-id :database-deprovisioning nil)
  (try
    (run! provisioning.database/deprovision-database! (workspace-databases ws-id))
    (catch Throwable t
      (set-workspace-status! ws-id :database-deprovisioning-failure (ex-message t))
      (throw t)))
  (set-workspace-status! ws-id :unprovisioned nil))
