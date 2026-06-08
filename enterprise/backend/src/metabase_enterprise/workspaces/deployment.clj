(ns metabase-enterprise.workspaces.deployment
  "Provision / deprovision a workspace onto a pre-booted child Metabase instance from
   the pool. The parent talks to the child over HTTP using the child's stored
   superuser `api_key` (the `X-API-Key` header).

   Binding uses the child's runtime config-file endpoint `POST /api/ee/advanced-config`,
   which applies the workspace `config.yml` (warehouse DB connections + the `:workspace`
   section) *writably* — it does NOT lock the instance (the lock is a boot-only /
   `MB_INSTANCE_WORKSPACE` concern), so the matching deprovision over HTTP keeps working.

   See [[metabase-enterprise.workspaces.api.workspace-manager]] for the `:deployment`
   endpoints that call these."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- child-url
  "Join the instance's base url with an api path."
  [base path]
  (str (str/replace base #"/$" "") path))

(defn- child-request!
  "Make an authenticated HTTP request to a child instance. `opts` is merged into the
   clj-http request map. Throws an ex-info (502) wrapping any non-2xx / transport error
   so the orchestrator can roll back."
  [{:keys [url api_key]} method path opts]
  (try
    (http/request
     (merge {:method  method
             :url     (child-url url path)
             :headers {"x-api-key" api_key}
             :as      :json
             ;; we handle non-2xx ourselves below
             :throw-exceptions true
             :socket-timeout   30000
             :connection-timeout 10000}
            opts))
    (catch Exception e
      (throw (ex-info (format "Child request failed: %s %s" (name method) path)
                      {:status-code 502
                       :child-url   url
                       :path        path}
                      e)))))

(defn- bind-workspace-on-child!
  "Apply the workspace config.yml to the child via its runtime advanced-config endpoint.
   Multipart field `config` = the YAML, exactly like the manual `/config` download +
   upload flow, but driven server-to-server. Writable (does not lock the child)."
  [instance config-yaml]
  (child-request! instance :post "/api/ee/advanced-config/"
                  {:multipart [{:name "config" :content config-yaml}]
                   :as        :string}))

(defn provision!
  "Bind workspace `workspace-id` to the free pool instance `instance-id`.

   1. Guard: the instance is free (`workspace_id` null) — else 409.
   2. Build the workspace `config.yml` (409 if the workspace has un-provisioned databases).
   3. POST it to the child (creates DB connections + binds the workspace, writably).
   4. Mark the instance busy (`workspace_id = workspace-id`).

   Atomic-ish: if the child bind fails the instance stays free (we set `workspace_id`
   only after a successful bind), so a failed provision never strands a busy instance."
  [workspace-id instance-id]
  (let [instance (t2/select-one :model/WorkspaceInstance :id instance-id)]
    (when-not instance
      (throw (ex-info "Pool instance not found" {:status-code 404 :instance_id instance-id})))
    (when (:workspace_id instance)
      (throw (ex-info "Instance is already provisioned; deprovision it first."
                      {:status-code 409 :instance_id instance-id :workspace_id (:workspace_id instance)})))
    (let [config (or (ws.config/build-workspace-config workspace-id)
                     (throw (ex-info "Workspace not found" {:status-code 404 :workspace_id workspace-id})))
          yaml   (ws.config/config->yaml config)]
      (bind-workspace-on-child! instance yaml)
      (t2/update! :model/WorkspaceInstance :id instance-id {:workspace_id workspace-id})
      (log/infof "Provisioned workspace %d onto instance %d" workspace-id instance-id)
      (t2/select-one :model/WorkspaceInstance :id instance-id))))

(defn deprovision!
  "Unbind the workspace from the instance the workspace `workspace-id` is provisioned on,
   returning that instance to the pool.

   1. Find the instance bound to `workspace-id` — 404 if none.
   2. Child: `DELETE /api/ee/workspace-instance/current` (clears workspace mode + remappings).
   3. Mark the instance free (`workspace_id = null`).

   The instance itself is NOT destroyed — it keeps its admin user + `api_key` and returns
   to the pool for reuse. Booting is the expensive part the pool exists to avoid."
  [workspace-id]
  (let [instance (t2/select-one :model/WorkspaceInstance :workspace_id workspace-id)]
    (when-not instance
      (throw (ex-info "No pool instance is provisioned for this workspace"
                      {:status-code 404 :workspace_id workspace-id})))
    (child-request! instance :delete "/api/ee/workspace-instance/current" {:as :string})
    (t2/update! :model/WorkspaceInstance :id (:id instance) {:workspace_id nil})
    (log/infof "Deprovisioned workspace %d from instance %d" workspace-id (:id instance))
    (t2/select-one :model/WorkspaceInstance :id (:id instance))))
