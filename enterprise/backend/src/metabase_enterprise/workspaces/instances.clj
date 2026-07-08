(ns metabase-enterprise.workspaces.instances
  "Manager-side registry of connected child Metabase instances. Each row stores
   the child's base URL and (encrypted) an admin API key created on the child.
   An instance hosts at most one workspace at a time, and a workspace targets at
   most one instance — the link lives on `workspace_instance.workspace_id`, so
   deleting a workspace frees its instance.

   [[push-config!]] deploys a workspace to its assigned instance: it builds the
   workspace's `config.yml` and uploads it to the child's unsafe-init endpoint,
   which wipes the child's content and re-initializes it from the config."
  (:require
   [metabase-enterprise.workspaces.client :as client]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase-enterprise.workspaces.models.workspace-instance]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-instance/keep-me)

(defn get-instance
  "Return the WorkspaceInstance with the given id, or nil if none exists."
  [id]
  (t2/select-one :model/WorkspaceInstance :id id))

(defn- assert-instance-exists [id]
  (or (get-instance id)
      (throw (ex-info (tru "Instance not found")
                      {:status-code 404 :instance_id id}))))

(defn list-instances
  "Return all WorkspaceInstances, ordered by id."
  []
  (t2/select :model/WorkspaceInstance {:order-by [[:id :asc]]}))

(defn create-instance!
  "Register a child instance. `api_key` is stored encrypted in `:details`."
  [{:keys [name url api_key]}]
  (let [id (t2/insert-returning-pk! :model/WorkspaceInstance
                                    {:name    name
                                     :url     url
                                     :details {:api-key api_key}})]
    (get-instance id)))

(defn update-instance!
  "Update a child instance's name, url, and/or API key. A nil or absent `api_key`
   keeps the stored one — the API key is never sent back to clients, so edits
   that don't change it omit it."
  [id {:keys [api_key] :as params}]
  (assert-instance-exists id)
  (let [updates (cond-> (select-keys params [:name :url])
                  (some? api_key) (assoc :details {:api-key api_key}))]
    (when (seq updates)
      (t2/update! :model/WorkspaceInstance :id id updates)))
  (get-instance id))

(defn delete-instance!
  "Delete a child instance registration. The child itself is not touched."
  [id]
  (assert-instance-exists id)
  (t2/delete! :model/WorkspaceInstance :id id))

(defn check-assignable!
  "Throw 404/409 unless `instance-id` exists and isn't hosting a workspace yet.
   Used to fail workspace creation fast, before any provisioning work."
  [instance-id]
  (let [instance (assert-instance-exists instance-id)]
    (when (:workspace_id instance)
      (throw (ex-info (tru "Instance is already assigned to another workspace")
                      {:status-code  409
                       :instance_id  instance-id
                       :workspace_id (:workspace_id instance)})))))

(defn assign-to-workspace!
  "Point `instance-id` at `workspace-id`, releasing any instance previously
   assigned to that workspace. nil `instance-id` just releases. Throws 404 when
   the instance doesn't exist and 409 when it already hosts another workspace."
  [instance-id workspace-id]
  (t2/with-transaction [_conn]
    (when instance-id
      (let [instance (assert-instance-exists instance-id)]
        (when (and (:workspace_id instance)
                   (not= (:workspace_id instance) workspace-id))
          (throw (ex-info (tru "Instance is already assigned to another workspace")
                          {:status-code  409
                           :instance_id  instance-id
                           :workspace_id (:workspace_id instance)})))))
    (if instance-id
      (do
        (t2/update! :model/WorkspaceInstance
                    :workspace_id workspace-id
                    :id [:not= instance-id]
                    {:workspace_id nil})
        (t2/update! :model/WorkspaceInstance :id instance-id {:workspace_id workspace-id}))
      (t2/update! :model/WorkspaceInstance :workspace_id workspace-id {:workspace_id nil}))))

(defn test-connection
  "Check that a child instance is reachable and the API key authenticates an
   admin there. Accepts `url` + `api_key` directly (pre-save checks from the
   create/edit form) or an `id` whose stored credentials fill in whatever the
   caller omitted. Returns `{:ok true}` or `{:ok false :message ...}`."
  [{:keys [id url api_key]}]
  (let [stored (when id (assert-instance-exists id))]
    (client/test-connection {:url     (or url (:url stored))
                             :api-key (or api_key (get-in stored [:details :api-key]))})))

(defn push-config!
  "Build `workspace`'s config.yml and upload it to the workspace's assigned
   instance, wiping the child and re-initializing it from the config. Blocking.
   Throws 400 when the workspace has no assigned instance, 409 when the workspace
   isn't fully provisioned, and 502 when the child rejects the config or can't be
   reached. Stamps the instance's `initialized_at` on success."
  [workspace-id]
  (let [instance (or (t2/select-one :model/WorkspaceInstance :workspace_id workspace-id)
                     (throw (ex-info (tru "Workspace has no assigned instance")
                                     {:status-code 400 :workspace_id workspace-id})))
        config   (or (ws.config/build-workspace-config workspace-id)
                     (throw (ex-info (tru "Workspace not found")
                                     {:status-code 404 :workspace_id workspace-id})))
        result   (client/push-config! {:url     (:url instance)
                                       :api-key (get-in instance [:details :api-key])}
                                      (ws.config/config->yaml config))]
    (when-not (:ok result)
      (throw (ex-info (tru "Failed to initialize the instance: {0}" (:message result))
                      {:status-code 502
                       :instance_id (:id instance)})))
    (t2/update! :model/WorkspaceInstance :id (:id instance) {:initialized_at :%now})
    (get-instance (:id instance))))
