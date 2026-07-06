(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.api-keys.core :as api-keys]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.secret :as u.secret]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

;;; --------------------------------------- Permission predicates ---------------------------------------
;;;
;;; Workspaces are superuser-only: read, write, and create all require admin.

(defmethod mi/can-read? :model/Workspace
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-create? :model/Workspace
  [_model _instance]
  api/*is-superuser?*)

(defmethod mi/can-write? :model/Workspace
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(methodical/defmethod t2/batched-hydrate [:model/Workspace :databases]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (map :id workspaces))]
       (group-by :workspace_id
                 (t2/select :model/WorkspaceDatabase :workspace_id [:in ids]))))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/Workspace :creator]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (distinct (keep :creator_id workspaces)))]
       (u/index-by :id
                   (t2/select [:model/User :id :first_name :last_name :email :common_name]
                              :id [:in ids]))))
   :creator_id))

(defn list-workspaces
  "Return every Workspace with its `:databases` (each with its `:database`) and
  `:creator` hydrated."
  []
  (t2/hydrate (t2/select :model/Workspace {:order-by [[:id :asc]]}) :creator [:databases :database]))

(defn get-workspace
  "Return the Workspace with the given id and its `:databases` (each with its
  `:database`) + `:creator` hydrated, or nil if none exists."
  [id]
  (when-let [workspace (t2/select-one :model/Workspace :id id)]
    (t2/hydrate workspace :creator [:databases :database])))

(defn get-workspace-by-name
  "Return the Workspace with the given name and its `:databases` + `:creator` hydrated,
  or nil if none exists. Workspace names are not unique at the schema level, so this
  returns the lowest-id match."
  [workspace-name]
  (when-let [workspace (t2/select-one :model/Workspace :name workspace-name {:order-by [[:id :asc]]})]
    (t2/hydrate workspace :creator :databases)))

(defn- with-workspace-database-defaults
  "Fill server-managed columns that are NOT NULL in the DB with their defaults when callers omit them."
  [wsd workspace-id]
  (merge {:database_details {}
          :output_namespace ""}
         wsd
         {:workspace_id workspace-id}))

(defn create-workspace!
  "Create a Workspace and its nested WorkspaceDatabase rows in a single transaction.
  The param map must supply `:creator_id`. Optional `:base_branch` /
  `:target_branch` record the child's git-sync binding (see the config builder).
  Returns the created Workspace with `:databases` and `:creator` hydrated."
  [{:keys [name creator_id databases base_branch target_branch]}]
  (t2/with-transaction [_conn]
    (let [workspace-id (t2/insert-returning-pk! :model/Workspace
                                                {:name          name
                                                 :creator_id    creator_id
                                                 :base_branch   base_branch
                                                 :target_branch target_branch})]
      (when (seq databases)
        (t2/insert! :model/WorkspaceDatabase
                    (map #(with-workspace-database-defaults % workspace-id) databases)))
      (get-workspace workspace-id))))

(defn mint-api-key!
  "Mint the api-key for `workspace-id`'s child instance: generate a fresh `mb_` key,
  record its prefix on the workspace row, and return the unhashed key (a
  [[metabase.util.secret]]; `u.secret/expose` it at the single point of use).

  Accounting only: the parent stores just the prefix — deliberately NOT a
  `:model/ApiKey` row — so the key can never authenticate against the parent. It
  authenticates against the child, which registers it at boot from the config.yml
  `api-keys:` section. ws<->key = this prefix; key<->user = the workspace's
  `creator_id`. One key per workspace, minted at create; calling again replaces
  the recorded prefix (the old key dies with the child instance it was born for)."
  [workspace-id]
  (let [k (api-keys/generate-key)]
    (t2/update! :model/Workspace :id workspace-id
                {:api_key_prefix (api-keys/prefix (u.secret/expose k))})
    k))

(defn- reject-active-modification!
  "Throw a 409 if any row in `existing-active` (everything other than `:unprovisioned`)
  is missing from the incoming `:databases` list or would have its `:input_schemas` changed.
  Only `:unprovisioned` rows are freely mutable; `:provisioning`, `:provisioned`,
  and `:deprovisioning` rows must be preserved verbatim."
  [existing-active incoming-by-db-id]
  (doseq [{:keys [database_id input_schemas]} existing-active]
    (let [incoming (get incoming-by-db-id database_id)]
      (when (or (nil? incoming)
                (not= (vec input_schemas) (vec (:input_schemas incoming))))
        (throw (ex-info "Cannot modify a workspace_database that is not :unprovisioned"
                        {:status-code 409
                         :database_id database_id}))))))

(defn delete-workspace!
  "Delete a Workspace. Refuses with a 409 if any of its WorkspaceDatabase rows is in
  a non-`:unprovisioned` state (`:provisioning`, `:provisioned`, or `:deprovisioning`)
  — those point at live warehouse resources and must be unprovisioned explicitly
  first. Cascade-deletes `:unprovisioned` children via the FK."
  [id]
  (when (t2/exists? :model/WorkspaceDatabase
                    :workspace_id id
                    :status [:not= :unprovisioned])
    (throw (ex-info "Cannot delete a workspace with databases that are not :unprovisioned; deprovision them first"
                    {:status-code 409
                     :workspace_id id})))
  (t2/delete! :model/Workspace :id id))

(defn update-workspace!
  "Update a Workspace and reconcile its `WorkspaceDatabase` rows with the provided
  list. Only `:unprovisioned` rows are freely mutable. Rows in any other state
  (`:provisioning`, `:provisioned`, `:deprovisioning`) must be preserved by
  `database_id` with matching `:input`, or a 409 is raised. Fields not
  present in `params` are left untouched."
  [id params]
  (t2/with-transaction [_conn]
    (when (contains? params :name)
      (t2/update! :model/Workspace :id id {:name (:name params)}))
    (when (contains? params :databases)
      (let [databases         (:databases params)
            existing          (t2/select :model/WorkspaceDatabase :workspace_id id)
            active            (remove #(= :unprovisioned (:status %)) existing)
            unprovisioned     (filter #(= :unprovisioned (:status %)) existing)
            incoming-by-db-id (into {} (map (juxt :database_id identity)) databases)
            preserved-db-ids  (set (map :database_id active))]
        (reject-active-modification! active incoming-by-db-id)
        (when-let [to-delete-ids (seq (map :id unprovisioned))]
          (t2/delete! :model/WorkspaceDatabase :id [:in to-delete-ids]))
        (when-let [to-insert (seq (remove #(contains? preserved-db-ids (:database_id %)) databases))]
          (t2/insert! :model/WorkspaceDatabase
                      (map #(with-workspace-database-defaults % id) to-insert)))))
    (get-workspace id)))
