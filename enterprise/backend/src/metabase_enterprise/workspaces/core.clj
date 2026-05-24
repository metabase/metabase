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
     parses `config.yml` and stores the resulting workspace map in the
     `workspace-instance` setting. Workspace-aware code (transform target
     rewriting, table-remapping QP middleware) reads from the setting via
     [[workspace-mode?]] / [[db-workspace-namespace]]. The setting lives in the
     instance's own application database — child instances have their own app DB,
     so storing it there persists the workspace across restarts without leaking
     between parent and child.

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
   [clojure.string :as str]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.util :as driver.u]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]
   [metabase.workspaces.core :as ws]
   [toucan2.core :as t2]))

(defn engine-namespace-positions
  "Return `{:db ?, :schema ?}` — the values that should populate the `:db` and
   `:schema` AST slots for a Table row in `database`. `table` is optional; pass
   it when you want the schema position derived from the Table's `:schema`
   column (the normal `spec-for-table` case). Pass nil for `table` when you only
   need the `:db` slot (workspace `output_namespace` expansion, GRANT emission).

   `nil` for either slot means \"this driver doesn't emit this AST level.\"
   Empty-string sentinel coercion happens at the storage boundary, not here.

   Driven by [[metabase.driver.sql/table-qualification-style]] +
   [[metabase.driver.sql/db-slot-value]] -- third-party drivers participate by
   implementing those rather than getting a new case branch here."
  ([database]       (engine-namespace-positions database nil))
  ([database table]
   (case (driver.sql/table-qualification-style (:engine database))
     :table-qualification-style/table
     {:db nil
      :schema nil}

     :table-qualification-style/schema-table
     {:db nil
      :schema (:schema table)}

     :table-qualification-style/db-table
     {:db (driver.sql/db-slot-value (:engine database) database)
      :schema nil}

     :table-qualification-style/db-schema-table
     {:db (driver.sql/db-slot-value (:engine database) database)
      :schema (:schema table)})))

(defn- coerce-database-id-key
  "JSON round-trips through the `workspace-instance` setting return integer
   `Database.id` keys as keywords (e.g. `:1`). Coerce them back to ints."
  [k]
  (cond
    (int? k)     k
    (keyword? k) (parse-long (name k))
    (string? k)  (parse-long k)))

(defn- normalize-database-keys
  "Coerce the `:databases` map keys to ints. See [[coerce-database-id-key]]."
  [config]
  (some-> config
          (update :databases #(update-keys % coerce-database-id-key))))

(defenterprise-schema set-instance-workspace! :- :any
  "EE impl: store the workspace config in the `workspace-instance` setting.
   Replaces any prior value. The shape is validated against
   `::ws/workspace-instance-config`."
  :feature :none
  [config :- ::ws/workspace-instance-config]
  (ws.settings/workspace-instance! config)
  nil)

(defenterprise clear-instance-workspace!
  "EE impl: clear the `workspace-instance` setting."
  :feature :none
  []
  (ws.settings/workspace-instance! nil)
  nil)

(defn instance-workspace
  "Return the workspace loaded on this instance, or nil if none."
  []
  (normalize-database-keys (ws.settings/workspace-instance)))

(defenterprise workspace-mode?
  "EE impl: true iff this instance is running in workspace mode (the
   `workspace-instance` setting is populated — either from a `:workspace` section
   of `config.yml` at boot or by a `POST /api/ee/workspace-instance/current`).
   Single source of truth for gating features that conflict with workspace
   remapping (DB routing, impersonation, writeback, CSV upload, model
   persistence). Use [[db-workspace-namespace]] when you need per-database
   scoping.

   Deliberately ungated on premium features: a workspace child instance bootstraps
   from `config.yml` *before* its token is installed; if the workspace map is
   loaded, we refuse incompatible features regardless of token state."
  :feature :none
  []
  (ws.settings/workspace-mode?))

(defn db-workspace-namespace
  "Return the workspace-isolated output namespace map for `db-id` on this
   instance, or `nil` when this instance is not running a workspace or the
   workspace has no entry for `db-id`. The namespace map is
   `{:db ?, :schema ?}` - either or both keys may be absent depending on
   the driver's `qualified-name-components`. Reads from the `workspace-instance`
   setting."
  [db-id]
  (get-in (instance-workspace) [:databases db-id :output]))

(defn list-remappings
  "Return all TableRemapping rows, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

(defn upsert-database!
  "Insert or update a `:model/Database` row from a `{:name, :engine, :details}` map.
   Matches on the (`:name`, `:engine`) pair. Used by the workspace `/setup`
   endpoint to register the warehouses the uploaded `config.yml` references
   without going through the full config-file loader (no env-var expansion, no
   sync). Returns the resulting Database row."
  [{:keys [name engine details] :as _spec}]
  (let [engine-kw (keyword engine)
        row       {:name name, :engine engine-kw, :details (or details {})}]
    (if-let [existing-id (t2/select-one-pk :model/Database :name name :engine engine-kw)]
      (do (t2/update! :model/Database existing-id row)
          (t2/select-one :model/Database :id existing-id))
      (first (t2/insert-returning-instances! :model/Database row)))))

(defn- expand-output-namespace
  "Expand a driver-opaque `output_namespace` string into the `{:db ?, :schema ?}`
   namespace map QP middleware, transform hooks, and table-remapping consume.

   The setting contract is map-shaped on purpose: doing this expansion once at
   write time lets the per-query hot path read both slots without re-running the
   per-engine case. For 3-slot drivers (SQL Server, BigQuery) the `:db` slot is
   filled from `Database.details`. For 2-slot drivers the `output_namespace`
   string lands in the schema slot. For no-schema drivers (MySQL) it lands in
   the db slot.

   `output_namespace` blank means the workspace database isn't provisioned yet —
   `:schema` carries `nil` and QP/transform consumers treat the workspace as
   having no output mapping for that database."
  [db output-namespace]
  (let [components (set (driver/qualified-name-components (:engine db)))
        positions  (engine-namespace-positions db)
        schema     (when-not (str/blank? output-namespace) output-namespace)]
    (cond-> {}
      (:db components)     (assoc :db (:db positions))
      (:schema components) (assoc :schema schema)
      ;; No-schema drivers (MySQL): the namespace name lands in the db slot.
      (and (:db components) (not (:schema components)))
      (assoc :db schema))))

(defn build-instance-config
  "Take a parsed `:workspace` config-file section
   (`{:name <s>, :databases {<db-name-keyword-or-string> {:input_schemas [<s>...]
                                                          :output_namespace <s>}}}`)
   and return the shape stored by [[set-instance-workspace!]]:
   `{:name <s>, :databases {<db-id> {:input_schemas [<s>...] :output {:db ?, :schema ?}}}}`.

   Resolves each `<db-name>` to a `:model/Database` row via `t2/select` —
   callers are expected to have inserted/upserted those rows beforehand.
   Throws `ex-info` (400) if the workspace section names a database not present
   in the app DB."
  [{:keys [name databases]}]
  (let [dbs-by-name (t2/select-fn->fn :name identity :model/Database)]
    {:name      name
     :databases (into {}
                      (map (fn [[db-name-kw wsd]]
                             (let [db-name (clojure.core/name db-name-kw)
                                   db      (or (get dbs-by-name db-name)
                                               (throw (ex-info (str "Workspace references unknown database: "
                                                                    (pr-str db-name))
                                                               {:status-code   400
                                                                :database-name db-name})))]
                               [(:id db) {:input_schemas (vec (:input_schemas wsd))
                                          :output        (expand-output-namespace db (:output_namespace wsd))}])))
                      databases)}))

;;; ------------------------------------- Manager-side helpers ------------------------------------------------

(defn- assert-workspace-exists [workspace-id]
  (or (workspace/get-workspace workspace-id)
      (throw (ex-info "Workspace not found"
                      {:status-code 404 :workspace_id workspace-id}))))

(defn- assert-input-schemas-when-supported!
  "Throw 400 if the database supports the `:schemas` feature and `input-schemas` is empty.
   Databases without schemas (e.g. MySQL) accept an empty `input-schemas`."
  [database-id input-schemas]
  (when-let [db (t2/select-one :model/Database :id database-id)]
    (when (and (driver.u/supports? (:engine db) :schemas db)
               (empty? input-schemas))
      (throw (ex-info "input_schemas is required: at least one source schema must be specified"
                      {:status-code 400 :database_id database-id})))))

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

;;; ------------------------------------- Manager-side writes -------------------------------------------------

(defn create-workspace!
  "Create a new Workspace (name only, no databases). Returns the created workspace, hydrated."
  [params]
  (workspace/create-workspace! (select-keys params [:name :creator_id])))

(defn add-database!
  "Add a database to a workspace and provision it immediately (blocking).
   `input-schemas` is a vector of driver-opaque schema name strings.
   Returns the updated workspace, hydrated."
  [workspace-id database-id input-schemas]
  (let [ws (assert-workspace-exists workspace-id)]
    (assert-input-schemas-when-supported! database-id input-schemas)
    (when (some #(= database-id (:database_id %)) (:databases ws))
      (throw (ex-info "Database already in workspace"
                      {:status-code 409 :workspace_id workspace-id :database_id database-id})))
    (let [wsd-id (t2/insert-returning-pk! :model/WorkspaceDatabase
                                          {:workspace_id     workspace-id
                                           :database_id      database-id
                                           :input_schemas    input-schemas
                                           :database_details {}
                                           :output_namespace ""})]
      (try
        (provisioning/provision-single! wsd-id)
        (catch Throwable t
          (t2/delete! :model/WorkspaceDatabase :id wsd-id)
          (throw t)))
      (workspace/get-workspace workspace-id))))

(defn update-database!
  "Update a database's config in a workspace: deprovision the existing one (if provisioned),
   update `input-schemas`, then reprovision (blocking). `input-schemas` is a vector of
   driver-opaque schema name strings. Returns the updated workspace, hydrated."
  [workspace-id database-id input-schemas]
  (let [ws  (assert-workspace-exists workspace-id)
        wsd (find-wsd ws database-id)]
    (assert-input-schemas-when-supported! database-id input-schemas)
    (when (= :provisioned (:status wsd))
      (provisioning/deprovision-single! (:id wsd)))
    (t2/update! :model/WorkspaceDatabase {:id (:id wsd)}
                {:input_schemas input-schemas})
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
