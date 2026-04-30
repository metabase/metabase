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
   [metabase.premium-features.core :refer [defenterprise]]
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

;;; ------------------------ Instance-side state (config.yml) -----------------------
;;;
;;; The child instance's workspace state is held in this atom, populated at boot by
;;; the `:workspace` section loader (`metabase-enterprise.advanced-config.file.workspace`).
;;; It is *not* the same as the manager-side `:model/Workspace` rows: those are written
;;; by the manager's CRUD endpoints, and using them for instance-side reads conflates
;;; two operational surfaces — on a single-instance dev box it lets the manager's
;;; workspaces leak into `/api/workspace-instance/current`.
;;;
;;; The atom is fresh per process — on each boot it's repopulated from `config.yml`,
;;; or empty if no `:workspace` section is present.

(defonce ^{:doc "The single workspace loaded into this instance from `config.yml`, or nil
  when no workspace was loaded.

  Shape:
    {:name <workspace-name>
     :databases {<database-id> {:input_schemas [...]
                                :output_schema <schema>}
                 ...}}"}
  workspace-instance-config
  (atom nil))

(defn set-instance-workspace!
  "Set the in-process workspace config for this instance. Called by the `:workspace`
  section loader at boot. Replaces any prior value."
  [config]
  (reset! workspace-instance-config config))

(defn clear-instance-workspace!
  "Clear the in-process workspace config. Mostly for tests."
  []
  (reset! workspace-instance-config nil))

(defn instance-workspace
  "Return the workspace loaded on this instance, or nil if none."
  []
  @workspace-instance-config)

(defenterprise workspace-mode?
  "EE impl: true iff this instance is running in workspace mode (a `:workspace`
   section was loaded from `config.yml` at boot). Single source of truth for
   gating features that conflict with workspace remapping (DB routing,
   impersonation, writeback, CSV upload, model persistence). Use
   [[db-workspace-schema]] when you need per-database scoping.

   Deliberately ungated on premium features — same rationale as
   [[workspace-remap-schema+name]]. A workspace child instance bootstraps
   from `config.yml` *before* its token is installed; if the workspace map
   is loaded, we refuse incompatible features regardless of token state."
  :feature :none
  []
  (some? @workspace-instance-config))

(defn db-workspace-schema
  "Return the workspace-isolated output schema name for `db-id` on this instance,
   or nil when this instance is not running a workspace, or the workspace has no
   entry for `db-id`. Reads from the in-process atom populated by `config.yml`.

   This is the instance-side read that gates transform write redirection. The
   manager-side `:model/WorkspaceDatabase` rows are NOT consulted — they belong
   to the manager's CRUD surface and shouldn't influence what runs on the
   instance's transforms."
  [db-id]
  (get-in @workspace-instance-config [:databases db-id :output_schema]))

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
