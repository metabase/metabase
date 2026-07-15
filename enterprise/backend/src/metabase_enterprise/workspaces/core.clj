(ns metabase-enterprise.workspaces.core
  "Programmatic API for workspaces.

   Two operational surfaces share this namespace:

   - **Manager-side state.** Workspaces and their per-database configs live in the
     `:model/Workspace` and `:model/WorkspaceDatabase` rows. Mutations go through
     [[create-workspace!]] and [[delete-workspace!]]. Provisioning operations are
     synchronous — the caller waits until the warehouse work completes.

   - **Instance-side state.** When a Metabase boots in workspace mode, the
     `:workspace` section loader (`metabase-enterprise.advanced-config.file.workspace`)
     parses `config.yml` and stores the resulting workspace map in the
     `instance-workspace` setting. Workspace-aware code (transform target
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
   [metabase-enterprise.workspaces.models.workspace-database :as workspace-database]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.driver.sql :as driver.sql]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.util.malli :as mu]
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
  "JSON round-trips through the `instance-workspace` setting return integer
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

(mu/defn set-instance-workspace! :- :any
  "Store the workspace config in the `instance-workspace` setting. Replaces any
   prior value. The shape is validated against `::ws/workspace-instance-config`."
  [config :- ::ws/workspace-instance-config]
  (ws.settings/instance-workspace! config)
  nil)

(defn clear-instance-workspace!
  "Clear the `instance-workspace` setting."
  []
  (ws.settings/instance-workspace! nil)
  nil)

;;; ------------------------------- Instance-workspace lock -------------------------------

(defonce ^:private locked-by-config?* (atom false))

(defn workspace-locked-by-config?
  "True iff this instance's workspace was set by out-of-band deployment config —
  a `:workspace` section in `config.yml` at boot, or the `MB_INSTANCE_WORKSPACE`
  env var — and so must not be mutated through the workspace-instance API. The
  lock is per-boot and not persisted: removing the config and restarting clears it.

  Read at the HTTP boundary only. Do NOT consult it from `set-instance-workspace!`
  or `clear-instance-workspace!` — internal callers and test fixtures rely on
  those setters staying unconditional."
  []
  (or @locked-by-config?*
      ;; Checked inline rather than captured at boot like the atom: nothing reads
      ;; this env var at startup, and the lookup is cheap.
      (some? (setting/env-var-value :instance-workspace))))

(defn mark-locked-by-config!
  "Called by the boot loader only; runtime code paths never flip the lock."
  []
  (reset! locked-by-config?* true))

(defn clear-all-remappings!
  "Delete every `:model/TableRemapping` row across all databases."
  []
  (t2/delete! :model/TableRemapping)
  nil)

(defn instance-workspace
  "Return the workspace loaded on this instance, or nil if none."
  []
  (normalize-database-keys (ws.settings/instance-workspace)))

(defenterprise workspace-mode?
  "EE impl: true iff this instance is running in workspace mode (the
   `instance-workspace` setting is populated — either from a `:workspace` section
   of `config.yml` at boot or by a `POST /api/ee/advanced-config`). Single
   source of truth for gating features that conflict with workspace remapping
   (DB routing, impersonation, writeback, CSV upload, model persistence). Use
   [[db-workspace-namespace]] when you need per-database scoping.

   Deliberately ungated on premium features: a workspace child instance bootstraps
   from `config.yml` *before* its token is installed; if the workspace map is
   loaded, we refuse incompatible features regardless of token state."
  :feature :none
  []
  (some? (ws.settings/instance-workspace)))

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

;;; ------------------------------------- Manager-side helpers ------------------------------------------------

(defn- assert-workspace-exists [workspace-id]
  (when-not (t2/exists? :model/Workspace :id workspace-id)
    (throw (ex-info "Workspace not found"
                    {:status-code 404 :workspace_id workspace-id}))))

(defn- assert-database-exists [database-id]
  (or (t2/select-one :model/Database :id database-id)
      (throw (ex-info "Database not found"
                      {:status-code 404 :database_id database-id}))))

(defn- assert-database-eligible-for-workspaces [database]
  (when-not (workspace-database/database-eligible-for-workspaces? database)
    (throw (ex-info "Workspaces are not enabled for this database"
                    {:status-code 400 :database_id (:id database)}))))

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

(defn- teardown-workspace-databases!
  "Tear down every WorkspaceDatabase of `workspace-id` — any state, blocking,
  continuing past failures so each row gets its attempt. Rows whose teardown
  succeeds are deleted immediately (progress is persisted per row, so an instance
  crash midway loses nothing); rows whose teardown fails are kept. Returns the
  vector of failure maps (see [[provisioning/teardown-workspace-database!]])."
  [workspace-id]
  (->> (t2/select :model/WorkspaceDatabase :workspace_id workspace-id)
       (mapv #(provisioning/teardown-workspace-database! % provisioning/dispatching-provisioner))
       (filterv #(= :failure (:status %)))))

(defn- teardown-failures-message
  [failures]
  (str/join "; " (map :reason failures)))

(defn create-workspace!
  "Create a new Workspace, attach the databases with ids `database_ids` — each must
   exist (404) and be eligible for workspaces (400, see
   [[workspace-database/database-eligible-for-workspaces?]]) — with all of their
   known schemas as `input_schemas`, and provision each database (blocking).
   Returns the created workspace, hydrated.

   The workspace and its WorkspaceDatabase rows are committed BEFORE provisioning
   starts — deliberately NOT one big transaction. The rows are the durable record
   of warehouse resources that may (partially) exist, so they must survive an
   instance crash mid-provision; a rollback would erase them while the warehouse
   objects live on. Cleanup after a provisioning failure is therefore explicit:
   every database is torn down, rows whose teardown succeeds are deleted, rows
   whose teardown fails are kept (`:unprovisioned`), and the Workspace row is
   deleted only when no database row remains — otherwise it is kept so the leak
   stays visible and the delete can be retried."
  [{:keys [name creator_id database_ids]}]
  (let [databases (mapv (fn [db-id]
                          (let [database (assert-database-exists db-id)]
                            (assert-database-eligible-for-workspaces database)
                            {:database_id   db-id
                             :input_schemas (workspace-database/database-input-schemas database)}))
                        database_ids)
        ws        (workspace/create-workspace! {:name       name
                                                :creator_id creator_id
                                                :databases  databases})]
    (try
      (doseq [{wsd-id :id} (:databases ws)]
        (provisioning/provision-single! wsd-id))
      (catch Throwable t
        (let [failures (teardown-workspace-databases! (:id ws))]
          (if (seq failures)
            (throw (ex-info (teardown-failures-message failures)
                            {:workspace_id       (:id ws)
                             :orphaned_resources failures}
                            t))
            (do (workspace/delete-workspace! (:id ws))
                (throw t))))))
    (workspace/get-workspace (:id ws))))

(defn delete-workspace!
  "Tear down every database's warehouse isolation (any state, blocking), then
  delete the workspace. There is no partial deletion: each WorkspaceDatabase is
  either fully torn down (warehouse footprint confirmed gone, row deleted) or
  kept. Every database gets its teardown attempt even when earlier ones fail; if
  any of them fail, the workspace is kept alongside the failed rows so the delete
  can be retried. Progress is persisted per row, so an instance crash midway
  loses nothing.

  Returns `{:deleted true}` on clean teardown, or `{:deleted false
  :orphaned_resources [...] :message ..}` when some databases could not be torn
  down. App-DB `TableRemapping` rows are always cleared, so query routing is
  never left dangling."
  [id]
  (assert-workspace-exists id)
  (let [failures (teardown-workspace-databases! id)]
    (if (seq failures)
      {:deleted false :orphaned_resources failures :message (teardown-failures-message failures)}
      (do (workspace/delete-workspace! id)
          {:deleted true}))))
