(ns metabase-enterprise.workspaces.provisioning.database
  "Warehouse-side provisioning for a single `:model/WorkspaceDatabase` row:
   creating/destroying the isolated schema + user via the driver
   workspace-isolation multimethods.

   Per-row lifecycle:

                     provision
     unprovisioned ────────────► provisioning ──────► provisioned
           ▲                          │                    │
           │                 failure  ▼                    │ deprovision
           │                 provisioning-failure          ▼
           │                                        deprovisioning
           │                                               │
           │                                      failure  ▼
           └───────────────────────────◄──────── deprovisioning-failure (retry deprovision)

   Failures are recorded on the row (`:status_details` carries the error
   message); there are no rollbacks or retries — both operations may simply be
   invoked again from any status and no-op when there is nothing to do."
  (:require
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.util :as driver.u]
   [metabase.util.malli :as mu]
   [potemkin.types :as p]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.table-remapping/keep-me
         metabase-enterprise.workspaces.models.workspace-database/keep-me)

;;; ------------------------------------------------- Protocol -------------------------------------------------------

(p/defprotocol+ DatabaseProvisioner
  "Wrapper around driver workspace-isolation multimethods for testability.
   The default [[database-provisioner]] delegates to the real driver multimethods.
   Tests can reify custom implementations that fail on demand, count calls, etc."
  (details  [this driver database workspace]
    "Compute {:schema ... :database_details ...} for the workspace without touching
     the warehouse. Called before init! so destroy! can clean up a partial init.")
  (init!    [this driver database workspace]
    "Create isolated schema + user. `workspace` carries the precomputed `:schema`
     and `:database_details` from [[details]].")
  (grant!   [this driver database workspace schemas]
    "Grant read access on `schemas` to the workspace user/role. `schemas` is a
     vector of driver-opaque schema-name strings. 3-slot drivers (SQL Server,
     BigQuery) derive the catalog from `database.details`.")
  (destroy! [this driver database workspace]
    "Tear down isolated schema + user. Should be idempotent."))

(def database-provisioner
  "Default DatabaseProvisioner that dispatches to the driver multimethods.

   Each call is wrapped in [[driver.conn/with-admin-connection]] so the underlying
   driver impls acquire connections via the database's `:admin-details` overlay
   (when configured). Workspace DDL — `CREATE USER`, `CREATE SCHEMA`, `GRANT` —
   typically needs higher-privilege credentials than the regular query user, and
   the admin overlay is how operators provide them. `details` computes no DDL but
   still binds the overlay: some drivers derive connection strings/catalogs from
   the effective details."
  (reify DatabaseProvisioner
    (details [_ driver database workspace]
      (driver.conn/with-admin-connection
        (driver/workspace-isolation-details driver database workspace)))
    (init! [_ driver database workspace]
      (driver.conn/with-admin-connection
        (driver/init-workspace-isolation! driver database workspace)))
    (grant! [_ driver database workspace schemas]
      (driver.conn/with-admin-connection
        (driver/grant-workspace-read-access! driver database workspace schemas)))
    (destroy! [_ driver database workspace]
      (driver.conn/with-admin-connection
        (driver/destroy-workspace-isolation! driver database workspace)))))

;;; -------------------------------------------- Engine namespaces ---------------------------------------------------

(mu/defn engine-namespace-positions :- [:map [:db [:maybe :string]] [:schema [:maybe :string]]]
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
  ([database :- :map table :- [:maybe :map]]
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

;;; ---------------------------------------------- Implementation ----------------------------------------------------

(defn- wsd-iso-workspace
  "The synthetic workspace map from which all warehouse identifiers for a
  WorkspaceDatabase row are derived. Every provision/deprovision path must build
  the exact same map — deprovision recomputes what provision computed."
  [wsd-id]
  {:id wsd-id :name (str "wsd-" wsd-id)})

(defn- iso-db-slot
  "Value of the `:db` AST slot a `TableRemapping.to_db` carries for `database`'s
   engine. Empty string for drivers that don't populate the `:db` slot
   (Postgres, Redshift, H2, ClickHouse) — the storage sentinel. For drivers
   that do (MySQL, SQL Server, BigQuery), consults
   [[metabase.driver.sql/db-slot-value]]."
  [database]
  (or (driver.sql/db-slot-value (:engine database) database) ""))

(defn clear-mappings-for-iso!
  "Delete every `TableRemapping` row on `database`'s id whose `to_*` slots match
   the iso namespace `(iso-db, iso-schema)` for this workspace_database row.

   Idempotent — 0 rows deleted is a valid outcome when nothing was registered
   (e.g. a workspace_database that was provisioned but never had a transform run).

   Scope rationale: the unique constraint on `(database_id, from_db, from_schema,
   from_table_name)` prevents two workspaces on the same metabase_database from
   remapping the same canonical table. So deleting by iso namespace is enough
   to avoid clobbering another workspace's rows on the same database_id.

   Returns the count of rows deleted."
  [database database-id output-namespace]
  (long
   (t2/delete! :model/TableRemapping
               :database_id database-id
               :to_db       (iso-db-slot database)
               :to_schema   (or output-namespace ""))))

(mu/defn provision-database! :- :nil
  "Provision an isolated output schema and user for one WorkspaceDatabase row
   (blocking). No-op when the row is already `:provisioned`, so retries are safe.
   State transitions: `:provisioning` -> `:provisioned` on success, or
   `:provisioning-failure` with the error message in `:status_details` on failure
   — no rollback, the error is rethrown and a later retry picks up from whatever
   state the warehouse is in."
  ([workspace-database]
   (provision-database! workspace-database database-provisioner))
  ([{wsd-id :id :as wsd} :- ::ws.schema/workspace-database
    provisioner]
   (when-not (= :provisioned (:status wsd))
     (t2/update! :model/WorkspaceDatabase wsd-id {:status :provisioning, :status_details nil})
     (try
       (let [db         (t2/select-one :model/Database :id (:database_id wsd))
             driver     (driver.u/database->driver db)
             workspace  (wsd-iso-workspace wsd-id)
             ws-details (merge workspace (details provisioner driver db workspace))]
         (init! provisioner driver db ws-details)
         (grant! provisioner driver db ws-details (vec (:input_schemas wsd)))
         (t2/update! :model/WorkspaceDatabase wsd-id
                     {:output_namespace (:schema ws-details)
                      :database_details (:database_details ws-details)
                      :status           :provisioned}))
       (catch Throwable t
         (t2/update! :model/WorkspaceDatabase wsd-id
                     {:status :provisioning-failure, :status_details (ex-message t)})
         (throw t))))
   nil))

(mu/defn deprovision-database! :- :nil
  "Tear down the warehouse isolation of one WorkspaceDatabase row (blocking).
   No-op when the row is already `:unprovisioned`, so retries are safe. Works
   from ANY other state: warehouse identifiers are the persisted ones, or
   recomputed deterministically from the row id via the provisioner's `details`
   for a crashed `:provisioning` row that never recorded anything.

   State transitions: `:deprovisioning` -> `:unprovisioned` on success (the
   persisted identifiers are cleared), or `:deprovisioning-failure` with the
   error message in `:status_details` on failure — the error is rethrown and the
   deprovision can be retried.

   App-DB `TableRemapping` rows for the row's iso namespace are ALWAYS cleared,
   even when the warehouse teardown fails partway — stale remappings would
   rewrite queries to a dropped schema and 500 the QP."
  ([workspace-database]
   (deprovision-database! workspace-database database-provisioner))
  ([{wsd-id :id :as wsd} :- ::ws.schema/workspace-database
    provisioner]
   (when-not (= :unprovisioned (:status wsd))
     (t2/update! :model/WorkspaceDatabase wsd-id {:status :deprovisioning, :status_details nil})
     (try
       (let [db         (t2/select-one :model/Database :id (:database_id wsd))
             driver     (driver.u/database->driver db)
             iso-ws     (wsd-iso-workspace wsd-id)
             computed   (delay (details provisioner driver db iso-ws))
             schema     (or (not-empty (:output_namespace wsd))
                            (:schema @computed))
             db-details (if (seq (:database_details wsd))
                          (:database_details wsd)
                          (:database_details @computed))
             workspace  (assoc iso-ws :schema schema :database_details db-details)]
         (try
           (destroy! provisioner driver db workspace)
           (finally
             (clear-mappings-for-iso! db (:database_id wsd) schema)))
         (t2/update! :model/WorkspaceDatabase wsd-id
                     {:output_namespace ""
                      :database_details {}
                      :status           :unprovisioned}))
       (catch Throwable t
         (t2/update! :model/WorkspaceDatabase wsd-id
                     {:status :deprovisioning-failure, :status_details (ex-message t)})
         (throw t))))
   nil))
