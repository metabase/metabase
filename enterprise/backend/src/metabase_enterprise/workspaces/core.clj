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
     [[workspace-mode?]] / [[db-workspace-namespace]]. The atom is fresh per process
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
   [metabase.driver :as driver]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn engine-namespace-positions
  "Return `{:db ?, :schema ?}` — the values that should populate the `:db` and
   `:schema` AST slots for a Table row in `database`. `table` is optional; pass
   it when you want the schema position derived from the Table's `:schema`
   column (the normal `spec-for-table` case). Pass nil for `table` when you only
   need the `:db` slot (workspace `output_namespace` expansion, GRANT emission).

   Each engine is spelled out explicitly. Verbose, but obvious at a glance —
   no more cross-referencing two `case` fns to figure out where each driver
   reads from.

   `nil` for either slot means \"this driver doesn't emit this AST level.\"
   Empty-string sentinel coercion happens at the storage boundary, not here."
  ([database]       (engine-namespace-positions database nil))
  ([database table]
   (case (:engine database)
     ;; 2-slot, schema-from-table
     :postgres   {:db nil
                  :schema (:schema table)}
     :redshift   {:db nil
                  :schema (:schema table)}
     :h2         {:db nil
                  :schema (:schema table)}

     ;; 2-slot, schema-from-database-name (ClickHouse calls its top level
     ;; "database" but emits it at the schema position in compiled SQL).
     :clickhouse {:db nil
                  :schema (:name database)}

     ;; 1-slot (db only); MySQL has no schema layer.
     :mysql      {:db (:db (:details database))
                  :schema nil}

     ;; 3-slot
     :snowflake  {:db (:db (:details database))
                  :schema (:schema table)}
     :sqlserver  {:db (:db (:details database))
                  :schema (:schema table)}
     :bigquery-cloud-sdk
     {:db (:project-id (:details database))
      :schema (:schema table)}

     ;; Unknown engine. Two outcomes:
     ;;   - If the driver declares `:db` in `qualified-name-components`, we're
     ;;     missing a case for a 3-slot (or 1-slot-with-db, like MySQL) driver.
     ;;     Silently degrading would store remap rows with `:db nil` and break
     ;;     cross-DB routing at query time. Throw to surface the gap.
     ;;   - Otherwise the driver is at most 2-slot; degrade to the table's
     ;;     `:schema` column, which is the conventional shape for any
     ;;     `[:schema]` driver we haven't enumerated.
     (let [components (set (driver/qualified-name-components (:engine database)))]
       (if (contains? components :db)
         (throw (ex-info (str "engine-namespace-positions has no case for engine "
                              (pr-str (:engine database))
                              " but its qualified-name-components includes :db; "
                              "add an explicit branch.")
                         {:engine     (:engine database)
                          :components components}))
         {:db nil
          :schema (:schema table)})))))

(defonce ^{:dynamic true
           :doc "The single workspace loaded into this instance from `config.yml`, or nil
  when no workspace was loaded.

  Shape:
    {:name <workspace-name>
     :databases {<database-id> {:input_schemas [<schema-name>, ...]
                                :output        {:db ?, :schema ?}}
                 ...}}

  `:input_schemas` is a vector of driver-opaque schema strings. For 3-slot
  drivers (Snowflake, SQL Server, BigQuery) the warehouse catalog/project is
  derived from the canonical `Database.details` at use time, not duplicated
  on each row.

  `:output` is a `::table-namespace` map — the loader expands the stored
  `output_namespace` string into `{:db (db-position-value db) :schema ns}`
  at boot so QP middleware can read both slots without a per-query case."}
  *workspace-instance-config*
  (atom nil))

(mr/def ::table-namespace
  "A `{:db ?, :schema ?}` namespace map. Either or both keys may be present
   depending on the driver's `qualified-name-components`; at least one must
   populate. Empty-string `\"\"` is reserved for the storage layer; the atom
   carries `nil`/missing for absent slots."
  [:and
   [:map
    [:db     {:optional true} [:maybe :string]]
    [:schema {:optional true} [:maybe :string]]]
   [:fn {:error/message "table namespace must populate at least one of :db or :schema"}
    (fn [m] (or (some? (:db m)) (some? (:schema m))))]])

(mr/def ::workspace-database-config
  "Per-database workspace config: `:input_schemas` is a non-empty vector of
   driver-opaque schema names (the source schemas the workspace reads from);
   `:output` is a single namespace map (the workspace's isolation schema,
   expanded with the warehouse catalog at boot)."
  [:map
   [:input_schemas [:vector {:min 1} :string]]
   [:output        ::table-namespace]])

(mr/def ::workspace-instance-config
  "Shape stored in [[workspace-instance-config]] after the `:workspace` config.yml
   loader has resolved database names to ids. Database keys are integer ids
   (post-resolution); the wire format with name keys lives in
   `metabase-enterprise.advanced-config.file.workspace`."
  [:map
   [:name      [:string {:min 1}]]
   [:databases [:map-of :int ::workspace-database-config]]])

(mu/defn set-instance-workspace!
  "Set the in-process workspace config for this instance. Replaces any prior value.
  The config is validated against [[::workspace-instance-config]] — a malformed
  config throws at the boundary rather than propagating into transform target
  rewriting or QP middleware."
  [config :- ::workspace-instance-config]
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
   [[db-workspace-namespace]] when you need per-database scoping.

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

(defn list-remappings
  "Return all TableRemapping rows, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

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
    (when (and (driver/database-supports? (:engine db) :schemas db)
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
