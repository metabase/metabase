(ns metabase-enterprise.workspaces.core
  "Programmatic API for workspaces.

   Two operational surfaces share this namespace:

   - **Manager-side state.** Workspaces and their per-database configs live in the
     `:model/Workspace` and `:model/WorkspaceDatabase` rows. Mutations go through
     [[create-workspace!]], [[add-database!]], [[update-database!]],
     [[remove-database!]], [[delete-workspace!]]. Provisioning operations are
     synchronous — the caller waits until the warehouse work completes.

   - **Instance-side state.** When a Metabase boots in workspace mode, the
     `:workspace` section loader (`metabase-enterprise.advanced-config.file.workspace`)
     parses `config.yml` and stores the resulting workspace map in
     [[workspace-instance-config]]. Workspace-aware code (transform target
     rewriting, table-remapping QP middleware) reads from that atom via
     [[workspace-mode?]] / [[db-workspace-schema]]. The atom is fresh per process
     — every boot re-reads `config.yml` and replaces the prior value.

   Per-database lifecycle for the manager-side rows:

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
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.util :as driver.u]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defonce ^{:dynamic true
           :doc "The single workspace loaded into this instance from `config.yml`, or nil
  when no workspace was loaded.

  Shape:
    {:name <workspace-name>
     :databases {<database-id> {:input  [{:db ?, :schema ?}, ...]
                                :output {:db ?, :schema ?}}
                 ...}}

  `:input` and `:output` are `::table-namespace` maps (the level above
  `:table` in the canonical addressing scheme). Each slot is a string when
  the driver populates it and absent (or `nil`) otherwise. Empty string
  `\"\"` is reserved for storage rows; the atom carries `nil`/missing for
  absent slots. See `ai-reports/2026-05-04-table-namespace-mapping-spec.md`."}
  *workspace-instance-config*
  (atom nil))

(defn set-instance-workspace!
  "Set the in-process workspace config for this instance. Called by the `:workspace`
  section loader at boot. Replaces any prior value."
  [config]
  (reset! *workspace-instance-config* config))

(defn clear-instance-workspace!
  "Clear the in-process workspace config. Mostly for tests."
  []
  (reset! *workspace-instance-config* nil))

(defn instance-workspace
  "Return the workspace loaded on this instance, or nil if none."
  []
  @*workspace-instance-config*)

(defenterprise workspace-mode?
  "EE impl: true iff this instance is running in workspace mode (a `:workspace`
   section was loaded from `config.yml` at boot). Single source of truth for
   gating features that conflict with workspace remapping (DB routing,
   impersonation, writeback, CSV upload, model persistence). Use
   [[db-workspace-schema]] when you need per-database scoping.

   Deliberately ungated on premium features: a workspace child instance bootstraps
   from `config.yml` *before* its token is installed; if the workspace map is
   loaded, we refuse incompatible features regardless of token state."
  :feature :none
  []
  (some? @*workspace-instance-config*))

(defn db-workspace-namespace
  "Return the workspace-isolated output namespace map for `db-id` on this
   instance, or `nil` when this instance is not running a workspace or the
   workspace has no entry for `db-id`. The namespace map is
   `{:db ?, :schema ?}` - either or both keys may be absent depending on
   the driver's `qualified-name-components`. Reads from the in-process atom
   populated by `config.yml`. See
   `ai-reports/2026-05-04-table-namespace-mapping-spec.md` for the contract."
  [db-id]
  (get-in @*workspace-instance-config* [:databases db-id :output]))

(defn db-workspace-schema
  "Return the workspace-isolated output `:schema` slot for `db-id`, or `nil`
   when this instance has no workspace entry for `db-id` OR the entry's
   output namespace doesn't populate `:schema`. Thin shim over
   [[db-workspace-namespace]] preserved for predicate-style callers
   (`(if (db-workspace-schema db-id) ...)`); new code that needs the full
   namespace should call `db-workspace-namespace` directly."
  [db-id]
  (:schema (db-workspace-namespace db-id)))

(defn list-remappings
  "Return all TableRemapping rows, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

;;; ------------------------------------- Manager-side helpers ------------------------------------------------

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

;;; ------------------------------------- Manager-side reads --------------------------------------------------

(defn get-workspace
  "Return the Workspace with the given `id`, hydrated with `:databases` and `:creator`.
   Returns nil if not found."
  [id]
  (workspace/get-workspace id))

(defn list-workspaces
  "Return all Workspaces, each hydrated with `:databases` and `:creator`."
  []
  (workspace/list-workspaces))

(defn available-databases
  "Return databases eligible for workspace assignment, paired with the input schemas
   discovered for each (from `:model/Table`).

   A database is eligible iff:
     - its driver supports the `:workspace` feature
     - it isn't the sample or audit database
     - database routing is not enabled on it (neither a router parent nor child)

   Returns `[{:database_id <id> :input_schemas [\"schema_a\" ...]} ...]`."
  []
  (let [databases            (into []
                                   (filter (fn [{:keys [id engine] :as db}]
                                             (and (driver.u/supports? engine :workspace db)
                                                  (not (database-routing/db-routing-enabled? id)))))
                                   (t2/select [:model/Database :id :engine]
                                              {:where    [:and
                                                          [:= :is_sample false]
                                                          [:= :is_audit false]
                                                          [:= :router_database_id nil]]
                                               :order-by [[:id :asc]]}))
        db-id->input-schemas (when (seq databases)
                               (-> (t2/select [:model/Table :db_id :schema]
                                              {:where    [:and
                                                          [:in :db_id (map :id databases)]
                                                          [:= :active true]
                                                          [:not= :schema nil]
                                                          [:not= :schema ""]]
                                               :group-by [:db_id :schema]
                                               :order-by [[:db_id :asc] [:schema :asc]]})
                                   (->> (group-by :db_id))
                                   (update-vals #(mapv :schema %))))]
    (mapv (fn [{:keys [id]}]
            {:database_id   id
             :input_schemas (get db-id->input-schemas id [])})
          databases)))

;;; ------------------------------------- Manager-side writes -------------------------------------------------

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
      (try
        (provisioning/provision-single! wsd-id)
        (catch Throwable t
          (t2/delete! :model/WorkspaceDatabase :id wsd-id)
          (throw t)))
      (workspace/get-workspace workspace-id))))

(defn update-database!
  "Update a database's config in a workspace: deprovision the existing one (if provisioned),
   update input_schemas, then reprovision (blocking). Returns the updated workspace, hydrated."
  [workspace-id database-id input_schemas]
  (let [ws  (assert-workspace-exists workspace-id)
        wsd (find-wsd ws database-id)]
    (assert-schemas-present! input_schemas)
    (when (= :provisioned (:status wsd))
      (provisioning/deprovision-single! (:id wsd)))
    (t2/update! :model/WorkspaceDatabase {:id (:id wsd)}
                {:input_schemas input_schemas})
    (provisioning/provision-single! (:id wsd))
    (workspace/get-workspace workspace-id)))

(defn remove-database!
  "Deprovision a database (if provisioned) and remove it from the workspace (blocking).
   Returns the updated workspace, hydrated."
  [workspace-id database-id]
  (let [ws  (assert-workspace-exists workspace-id)
        wsd (find-wsd ws database-id)]
    (when (= :provisioned (:status wsd))
      (provisioning/deprovision-single! (:id wsd)))
    (t2/delete! :model/WorkspaceDatabase :id (:id wsd))
    (workspace/get-workspace workspace-id)))

(defn delete-workspace!
  "Deprovision all databases (blocking), then delete the workspace."
  [id]
  (let [ws (assert-workspace-exists id)]
    (when (some #(= :provisioned (:status %)) (:databases ws))
      (provisioning/deprovision-workspace! id))
    (workspace/delete-workspace! id)))
