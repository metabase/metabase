(ns metabase-enterprise.workspaces.core
  "Programmatic API for workspaces.

   Per-database status transitions:

                     provision!
     unprovisioned ────────────► provisioning ──────► provisioned
          ▲                           │                    │
          │                  failure  │                    │ deprovision!
          │                           ▼                    ▼
          │                     unprovisioned ◄──── deprovisioning
          │                                                │
          │                                       failure  │
          │                                                ▼
          └──────────────────────────────────────── provisioned

   Workspace-level rules (derived from per-database statuses):

     All DBs unprovisioned → EDITING mode
       • add/remove databases, change schemas, rename, delete
       • provision!

     Any DB not unprovisioned → LOCKED mode
       • provision! (retry failed DBs)
       • deprovision! (tear down everything)
       • reads (get, list)
       • all structural edits → 409"
  (:require
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Helpers ---------------------------------------------------

(defn- assert-workspace-exists [workspace-id]
  (or (workspace/get-workspace workspace-id)
      (throw (ex-info "Workspace not found"
                      {:status-code 404 :workspace_id workspace-id}))))

(defn- any-provisioned?
  "True if any database in the workspace is in a non-unprovisioned state."
  [ws]
  (some #(not= :unprovisioned (:status %)) (:databases ws)))

(defn- assert-editable!
  "Throw 409 if the workspace has any provisioned databases. Structural edits
   (add/remove DB, change schemas, rename) are only allowed when all DBs are unprovisioned."
  [ws]
  (when (any-provisioned? ws)
    (throw (ex-info "Workspace is locked: databases are provisioned. Deprovision before making changes."
                    {:status-code  409
                     :workspace_id (:id ws)
                     :statuses     (mapv (juxt :database_id :status) (:databases ws))}))))

(defn- assert-schemas-present!
  "Throw 400 if input_schemas is empty. We require at least one source schema."
  [input_schemas]
  (when (empty? input_schemas)
    (throw (ex-info "input_schemas is required: at least one source schema must be specified"
                    {:status-code 400}))))

(defn provisionable?
  "True if the workspace is in a valid state to provision: has at least one database,
   has at least one unprovisioned database, and every database has at least one input schema."
  [ws]
  (let [dbs (:databases ws)]
    (and (seq dbs)
         (some #(= :unprovisioned (:status %)) dbs)
         (every? #(seq (:input_schemas %)) dbs))))

(defn- assert-provisionable!
  "Throw 400 if the workspace is not in a valid state to provision."
  [ws]
  (let [dbs (:databases ws)]
    (when (empty? dbs)
      (throw (ex-info "Cannot provision a workspace with no databases"
                      {:status-code 400 :workspace_id (:id ws)})))
    (when-not (some #(= :unprovisioned (:status %)) dbs)
      (throw (ex-info "No unprovisioned databases to provision"
                      {:status-code 409 :workspace_id (:id ws)})))
    (doseq [db dbs
            :when (empty? (:input_schemas db))]
      (throw (ex-info "All databases must have at least one input schema before provisioning"
                      {:status-code 400
                       :workspace_id (:id ws)
                       :database_id  (:database_id db)})))))

;;; ------------------------------------------------- Reads ---------------------------------------------------

(defn get-workspace
  "Return the Workspace with the given `id`, hydrated with `:databases` and `:creator`.
   Returns nil if not found."
  [id]
  (workspace/get-workspace id))

(defn list-workspaces
  "Return all Workspaces, each hydrated with `:databases` and `:creator`."
  []
  (workspace/list-workspaces))

(defn db-workspace-schema
  "Return the workspace-isolated output schema name for `db-id`, or nil when no
   provisioned workspace database exists for that database."
  [db-id]
  (t2/select-one-fn :output_schema :model/WorkspaceDatabase
                    :database_id db-id
                    :status :provisioned))

(defn list-remappings
  "Return all TableRemapping rows, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

;;; ------------------------------------------------ Writes ---------------------------------------------------

(defn create-workspace!
  "Create a new Workspace. Returns the created workspace, hydrated.

   `params`:
     :name       - workspace name
     :creator_id - id of the creating user
     :databases  - seq of {:database_id N, :input_schemas [\"schema1\" ...]}"
  [params]
  (doseq [db (:databases params)]
    (assert-schemas-present! (:input_schemas db)))
  (workspace/create-workspace! params))

(defn update-workspace!
  "Update a workspace's name and/or databases. Only allowed when all databases are
   unprovisioned. Returns the updated workspace, hydrated."
  [id params]
  (let [ws (assert-workspace-exists id)]
    (assert-editable! ws)
    (doseq [db (:databases params)]
      (assert-schemas-present! (:input_schemas db)))
    (workspace/update-workspace! id params)))

(defn delete-workspace!
  "Delete a Workspace. All databases must be unprovisioned."
  [id]
  (let [ws (assert-workspace-exists id)]
    (assert-editable! ws)
    (workspace/delete-workspace! id)))

(defn add-database!
  "Add a database to an existing workspace. Only allowed when all existing databases
   are unprovisioned. `input_schemas` is required (at least one source schema).
   Returns the updated workspace, hydrated."
  [workspace-id database-id & {:keys [input_schemas]}]
  (let [ws (assert-workspace-exists workspace-id)]
    (assert-editable! ws)
    (assert-schemas-present! input_schemas)
    (when (some #(= database-id (:database_id %)) (:databases ws))
      (throw (ex-info "Database already in workspace"
                      {:status-code 409 :workspace_id workspace-id :database_id database-id})))
    (t2/insert! :model/WorkspaceDatabase
                {:workspace_id     workspace-id
                 :database_id      database-id
                 :input_schemas    input_schemas
                 :database_details {}
                 :output_schema    ""})
    (workspace/get-workspace workspace-id)))

(defn remove-database!
  "Remove a database from a workspace. Only allowed when all databases are unprovisioned.
   Returns the updated workspace, hydrated."
  [workspace-id database-id]
  (let [ws  (assert-workspace-exists workspace-id)
        _   (assert-editable! ws)
        wsd (some #(when (= database-id (:database_id %)) %) (:databases ws))]
    (when-not wsd
      (throw (ex-info "Database not in workspace"
                      {:status-code 404 :workspace_id workspace-id :database_id database-id})))
    (t2/delete! :model/WorkspaceDatabase :id (:id wsd))
    (workspace/get-workspace workspace-id)))

;;; --------------------------------------------- Provisioning -------------------------------------------------

(defn provision!
  "Provision all unprovisioned databases in a workspace. Can be called from any state —
   if some DBs are already provisioned and some failed back to unprovisioned, this
   retries the unprovisioned ones. Validates that every database has schemas configured.
   Returns the number of databases that were scheduled."
  [workspace-id]
  (let [ws (assert-workspace-exists workspace-id)]
    (assert-provisionable! ws)
    (provisioning/provision-workspace! workspace-id)))

(defn deprovision!
  "Deprovision all provisioned databases in a workspace. Tears everything down.
   Returns the number of databases that were scheduled."
  [workspace-id]
  (assert-workspace-exists workspace-id)
  (provisioning/deprovision-workspace! workspace-id))
