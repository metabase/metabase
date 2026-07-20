(ns metabase-enterprise.workspaces.provisioning
  "Top-level workspace provisioning orchestration: [[provision-workspace!]] and
   [[deprovision-workspace!]], recording progress in the workspace's
   `:status`/`:status_details` (see
   `:metabase-enterprise.workspaces.schema/workspace-status`). The API runs
   them in the background."
  (:require
   [metabase-enterprise.workspaces.provisioning.database :as provisioning.database]
   [metabase-enterprise.workspaces.provisioning.instance :as provisioning.instance]
   [metabase-enterprise.workspaces.provisioning.remote-sync :as provisioning.remote-sync]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- set-initial-workspace-status! :- ::ws.schema/workspace
  "Atomically flip `workspace` to `status`, the first status of a run, unless
   its current status is in `disallowed-statuses`. The conditional UPDATE is
   the mutual-exclusion guard — two concurrent requests can never both start a
   run. Throws a 400 when the current status disallows the run. Returns the
   updated `workspace` copy."
  [workspace :- ::ws.schema/workspace
   status :- ::ws.schema/workspace-status
   disallowed-statuses :- [:set ::ws.schema/workspace-status]]
  (let [updated (t2/update! :model/Workspace
                            :id (:id workspace)
                            :status [:not-in disallowed-statuses]
                            {:status status, :status_details nil})]
    (when (zero? updated)
      (throw (ex-info "The workspace status does not allow starting this run"
                      {:status-code 400, :workspace-id (:id workspace)})))
    (assoc workspace :status status, :status_details nil)))

(mu/defn set-initial-workspace-provisioning-status! :- ::ws.schema/workspace
  "Atomically set `:database-provisioning`, the first status of the
   provisioning path; throws a 400 when a run is already in flight or the
   workspace is already `:provisioned`. Called before the background run
   starts so the run is immediately visible as in flight. Returns the updated
   `workspace` copy."
  [workspace :- ::ws.schema/workspace]
  (set-initial-workspace-status! workspace :database-provisioning
                                 (conj ws.schema/in-flight-statuses :provisioned)))

(mu/defn set-initial-workspace-deprovisioning-status! :- ::ws.schema/workspace
  "Atomically set `:instance-deprovisioning`, the first status of the
   deprovisioning path; throws a 400 when a run is already in flight or the
   workspace is already `:unprovisioned`. Called before the background run
   starts so the run is immediately visible as in flight. Returns the updated
   `workspace` copy."
  [workspace :- ::ws.schema/workspace]
  (set-initial-workspace-status! workspace :instance-deprovisioning
                                 (conj ws.schema/in-flight-statuses :unprovisioned)))

(defn- workspace-databases
  "The workspace's WorkspaceDatabase rows, in stable row order — the order the
   database phases provision and deprovision them in."
  [ws-id]
  (t2/select :model/WorkspaceDatabase :workspace_id ws-id {:order-by [[:id :asc]]}))

(mu/defn- set-workspace-status! :- ::ws.schema/workspace
  "Persist `status`/`status-details` on the row and return `workspace` with them
   assoc'ed, so callers can keep threading the updated copy."
  [workspace :- ::ws.schema/workspace
   status :- ::ws.schema/workspace-status
   status-details :- [:maybe :string]]
  (t2/update! :model/Workspace (:id workspace) {:status status, :status_details status-details})
  (assoc workspace :status status, :status_details status-details))

(mu/defn provision-workspace! :- ::ws.schema/workspace
  "Provision `workspace` (blocking): every database, then the git branch, then
   the child instance, ending `:provisioned`. Stops on the first failure — the
   phase's `*-failure` status and the error message land on the workspace —
   and rethrows. Retries skip work that already succeeded. Returns the updated
   workspace copy."
  [workspace :- ::ws.schema/workspace]
  (as-> workspace ws
    (set-workspace-status! ws :database-provisioning nil)
    (try
      (run! provisioning.database/provision-database! (workspace-databases (:id ws)))
      ws
      (catch Throwable t
        (set-workspace-status! ws :database-provisioning-failure (ex-message t))
        (throw t)))
    (set-workspace-status! ws :branch-provisioning nil)
    (try
      (provisioning.remote-sync/provision-branch! ws)
      (catch Throwable t
        (set-workspace-status! ws :branch-provisioning-failure (ex-message t))
        (throw t)))
    (set-workspace-status! ws :instance-provisioning nil)
    (try
      (-> ws
          provisioning.instance/deprovision-instance!
          provisioning.instance/provision-instance!)
      (catch Throwable t
        (set-workspace-status! ws :instance-provisioning-failure (ex-message t))
        (throw t)))
    (set-workspace-status! ws :provisioned nil)))

(mu/defn deprovision-workspace! :- ::ws.schema/workspace
  "Deprovision `workspace` (blocking): the child instance, then the git branch,
   then every database, ending `:unprovisioned`. Stops on the first failure —
   the phase's `*-failure` status and the error message land on the workspace —
   and rethrows. Retries skip work that already succeeded. Returns the updated
   workspace copy."
  [workspace :- ::ws.schema/workspace]
  (as-> workspace ws
    (set-workspace-status! ws :instance-deprovisioning nil)
    (try
      (provisioning.instance/deprovision-instance! ws)
      (catch Throwable t
        (set-workspace-status! ws :instance-deprovisioning-failure (ex-message t))
        (throw t)))
    (set-workspace-status! ws :branch-deprovisioning nil)
    (try
      (provisioning.remote-sync/deprovision-branch! ws)
      (catch Throwable t
        (set-workspace-status! ws :branch-deprovisioning-failure (ex-message t))
        (throw t)))
    (set-workspace-status! ws :database-deprovisioning nil)
    (try
      (run! provisioning.database/deprovision-database! (workspace-databases (:id ws)))
      ws
      (catch Throwable t
        (set-workspace-status! ws :database-deprovisioning-failure (ex-message t))
        (throw t)))
    (set-workspace-status! ws :unprovisioned nil)))
