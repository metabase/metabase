(ns metabase-enterprise.workspaces.core
  "Programmatic API for workspaces. All provisioning operations are blocking
   (synchronous) — the caller waits until the warehouse work completes.

   ## Endpoint contract

   - `create-workspace!`  — name only, no databases
   - `add-database!`      — insert WorkspaceDatabase row + provision immediately
   - `update-database!`   — deprovision existing + reprovision with new config
   - `remove-database!`   — deprovision + delete the WorkspaceDatabase row
   - `delete-workspace!`  — deprovision all databases, then delete workspace

   ## Per-database lifecycle

                    provision
    unprovisioned ────────────► provisioning ──────► provisioned
         ▲                           │                    │
         │                  failure  │                    │ deprovision
         │                           ▼                    ▼
         │                     unprovisioned ◄──── deprovisioning
         │                                                │
         │                                       failure  │
         │                                                ▼
         └──────────────────────────────────────── provisioned"
  (:require
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Helpers ---------------------------------------------------

(defn- assert-workspace-exists [workspace-id]
  (or (workspace/get-workspace workspace-id)
      (throw (ex-info "Workspace not found"
                      {:status-code 404 :workspace_id workspace-id}))))

(defn- assert-schemas-present!
  "Throw 400 if input_schemas is empty. We require at least one source schema."
  [input_schemas]
  (when (empty? input_schemas)
    (throw (ex-info "input_schemas is required: at least one source schema must be specified"
                    {:status-code 400}))))

(defn- find-wsd
  "Find the WorkspaceDatabase for a given workspace + database, or throw 404."
  [ws database-id]
  (or (some #(when (= database-id (:database_id %)) %) (:databases ws))
      (throw (ex-info "Database not in workspace"
                      {:status-code 404 :workspace_id (:id ws) :database_id database-id}))))

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
  "Create a new Workspace (name only, no databases). Returns the created workspace, hydrated."
  [params]
  (workspace/create-workspace! (select-keys params [:name :creator_id])))

(defn add-database!
  "Add a database to a workspace and provision it immediately (blocking).
   Returns the updated workspace, hydrated."
  [workspace-id database-id input_schemas]
  (let [ws (assert-workspace-exists workspace-id)]
    (assert-schemas-present! input_schemas)
    (when (some #(= database-id (:database_id %)) (:databases ws))
      (throw (ex-info "Database already in workspace"
                      {:status-code 409 :workspace_id workspace-id :database_id database-id})))
    (let [wsd-id (t2/insert-returning-pk! :model/WorkspaceDatabase
                                          {:workspace_id     workspace-id
                                           :database_id      database-id
                                           :input_schemas    input_schemas
                                           :database_details {}
                                           :output_schema    ""})]
      (provisioning/provision-single! wsd-id)
      (workspace/get-workspace workspace-id))))

(defn update-database!
  "Update a database's config in a workspace: deprovision the existing one (if provisioned),
   update input_schemas, then reprovision (blocking). Returns the updated workspace, hydrated."
  [workspace-id database-id input_schemas]
  (let [ws  (assert-workspace-exists workspace-id)
        wsd (find-wsd ws database-id)]
    (assert-schemas-present! input_schemas)
    ;; deprovision if currently provisioned
    (when (= :provisioned (:status wsd))
      (provisioning/deprovision-single! (:id wsd)))
    ;; update the schemas
    (t2/update! :model/WorkspaceDatabase {:id (:id wsd)}
                {:input_schemas input_schemas})
    ;; reprovision
    (provisioning/provision-single! (:id wsd))
    (workspace/get-workspace workspace-id)))

(defn remove-database!
  "Deprovision a database (if provisioned) and remove it from the workspace (blocking).
   Returns the updated workspace, hydrated."
  [workspace-id database-id]
  (let [ws  (assert-workspace-exists workspace-id)
        wsd (find-wsd ws database-id)]
    ;; deprovision if currently provisioned
    (when (= :provisioned (:status wsd))
      (provisioning/deprovision-single! (:id wsd)))
    (t2/delete! :model/WorkspaceDatabase :id (:id wsd))
    (workspace/get-workspace workspace-id)))

(defn delete-workspace!
  "Deprovision all databases (blocking), then delete the workspace."
  [id]
  (let [ws (assert-workspace-exists id)]
    ;; deprovision any provisioned databases
    (when (some #(= :provisioned (:status %)) (:databases ws))
      (provisioning/deprovision-workspace! id))
    ;; now all should be unprovisioned — delete
    (workspace/delete-workspace! id)))
