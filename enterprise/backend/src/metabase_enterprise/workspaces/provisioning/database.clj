(ns metabase-enterprise.workspaces.provisioning.database
  "Provisioning of per-database warehouse isolation for workspaces: a
  [[DatabaseProvisioner]] per driver creates/destroys the isolated schema and
  user each WorkspaceDatabase row represents."
  (:require
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase-enterprise.workspaces.remapping-cleanup :as ws.remapping-cleanup]
   [metabase-enterprise.workspaces.schema :as ws.schema]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.util :as driver.u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [potemkin.types :as p]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Protocol -------------------------------------------------------

(p/defprotocol+ DatabaseProvisioner
  "Wrapper around driver workspace-isolation multimethods for testability.
   The default [[dispatching-database-provisioner]] delegates to the real driver multimethods.
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

(def dispatching-database-provisioner
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
  ([database :- [:map [:engine :keyword]]]
   (engine-namespace-positions database nil))
  ([database :- [:map [:engine :keyword]]
    table    :- [:maybe :map]]
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

(def ^:private ^:const provisioning-lock-timeout-seconds
  "Max wait for another node/thread to finish provisioning the same row."
  60)

(defn- wsd-lock-key
  "Per-row cluster-lock keyword."
  [workspace-database-id]
  (keyword "metabase-enterprise.workspaces.provisioning.database"
           (str "wsd-" workspace-database-id)))

(mu/defn do-with-workspace-database-lock
  "Run `thunk` while holding the per-row cluster lock for `workspace-database-id`.
   [[provision-database!]]/[[deprovision-database!]] take this same lock internally, so
   the acquisition here is reentrant — it lets a caller atomically combine an app-db
   change with provisioning under a single lock, acquired *before* the row is
   mutated (the lock-before-mutate order the rest of the system relies on)."
  [workspace-database-id :- ms/PositiveInt
   thunk                 :- fn?]
  (cluster-lock/with-cluster-lock {:lock            (wsd-lock-key workspace-database-id)
                                   :timeout-seconds provisioning-lock-timeout-seconds}
    (thunk)))

(defmacro with-workspace-database-lock
  "Sugar over [[do-with-workspace-database-lock]]."
  [workspace-database-id & body]
  `(do-with-workspace-database-lock ~workspace-database-id (fn [] ~@body)))

(defn- wsd-iso-workspace
  "The synthetic workspace map from which all warehouse identifiers for a
  WorkspaceDatabase row are derived. Every provision/deprovision path must build
  the exact same map — deprovision recomputes what provision computed."
  [workspace-database-id]
  {:id workspace-database-id :name (str "wsd-" workspace-database-id)})

;;; ---------------------------------------- Single-database operations -----------------------------------------------

(mu/defn provision-workspace-database! :- [:maybe ::ws.schema/workspace-database]
  "Provision an isolated output schema and user for a `:provisioning`
  WorkspaceDatabase row. State transitions: `:provisioning` -> `:provisioned`
  on success, or back to `:unprovisioned` on failure."
  [workspace-database-id :- ms/PositiveInt
   provisioner]
  (try
    (with-workspace-database-lock workspace-database-id
      (let [wsd (t2/select-one :model/WorkspaceDatabase :id workspace-database-id)]
        (when-not wsd
          (throw (ex-info "WorkspaceDatabase not found" {:id workspace-database-id})))
        (when-not (= :provisioning (:status wsd))
          (throw (ex-info "WorkspaceDatabase must be :provisioning to provision"
                          {:id workspace-database-id :status (:status wsd)})))
        (let [db         (t2/select-one :model/Database :id (:database_id wsd))
              driver     (driver.u/database->driver db)
              workspace  (wsd-iso-workspace workspace-database-id)
              ws-details (merge workspace (details provisioner driver db workspace))
              schemas    (vec (:input_schemas wsd))]
          (try
            (init! provisioner driver db ws-details)
            (grant! provisioner driver db ws-details schemas)
            (catch Throwable t
              (try
                (destroy! provisioner driver db ws-details)
                (catch Throwable destroy-t
                  (log/warnf destroy-t "Failed to clean up after provisioning failure for WorkspaceDatabase %s"
                             workspace-database-id)))
              (throw t)))
          (t2/update! :model/WorkspaceDatabase
                      {:id workspace-database-id}
                      {:output_namespace (:schema ws-details)
                       :database_details (:database_details ws-details)
                       :status           :provisioned}))))
    (catch Throwable t
      (t2/update! :model/WorkspaceDatabase
                  {:id workspace-database-id}
                  {:status :unprovisioned})
      (throw t)))
  (t2/select-one :model/WorkspaceDatabase :id workspace-database-id))

;;; ----------------------------------- High-level entry points (blocking) --------------------------------------------

(mu/defn provision-database! :- [:maybe ::ws.schema/workspace-database]
  "Flip a single WorkspaceDatabase to `:provisioning` and provision it synchronously.
   The row must be `:unprovisioned`. Returns the updated WorkspaceDatabase row."
  ([wsd-id :- ms/PositiveInt]
   (provision-database! wsd-id dispatching-database-provisioner))
  ([wsd-id :- ms/PositiveInt
    provisioner]
   (t2/update! :model/WorkspaceDatabase {:id wsd-id :status :unprovisioned}
               {:status :provisioning})
   (provision-workspace-database! wsd-id provisioner)))

(mu/defn deprovision-database! :- :nil
  "Destroy one WorkspaceDatabase's warehouse isolation and, on success, delete
  its row. Used by the delete path and by create-workspace cleanup. Works from ANY
  state: the per-row cluster lock is taken first, so in-flight
  provisioning/deprovisioning on another node completes before we touch anything
  (or the lock times out and the deprovision is reported as a failure), and the row
  is re-read under the lock so we see whatever that work persisted. Identifiers
  are the persisted ones, or
  recomputed deterministically from the row id via the provisioner's `details`
  ([[metabase.driver/workspace-isolation-details]]) for a crashed `:provisioning`
  row that never recorded anything.

  There is no partial outcome: the deprovision either fully succeeds or the row
  stays. The row is the durable record that warehouse resources may exist — it
  must survive instance crashes and disappear only once the warehouse footprint
  is confirmed gone. On success the WorkspaceDatabase row is DELETED and the
  app-DB `TableRemapping` rows for the iso namespace are cleared — stale
  remappings would rewrite queries to a dropped schema and 500 the QP.

  Throws on failure. When the destroy itself fails, the row bookkeeping runs
  first: the row is kept, forced `:unprovisioned`, and the remapping cleanup
  still runs. Failures before the destroy — lock timeout, identifier
  computation — throw without touching the row. Either way the deprovision can
  be retried. Returns nil."
  ([wsd :- ::ws.schema/workspace-database]
   (deprovision-database! wsd dispatching-database-provisioner))
  ([wsd :- ::ws.schema/workspace-database
    provisioner]
   (with-workspace-database-lock (:id wsd)
     (when-let [wsd (t2/select-one :model/WorkspaceDatabase :id (:id wsd))]
       (let [db         (t2/select-one :model/Database :id (:database_id wsd))
             driver     (driver.u/database->driver db)
             iso-ws     (wsd-iso-workspace (:id wsd))
             computed   (delay (details provisioner driver db iso-ws))
             schema     (or (not-empty (:output_namespace wsd))
                            (:schema @computed))
             db-details (if (seq (:database_details wsd))
                          (:database_details wsd)
                          (:database_details @computed))
             workspace  (assoc iso-ws :schema schema :database_details db-details)]
         (try
           (destroy! provisioner driver db workspace)
           (catch Throwable t
             ;; The rethrow rolls back the cluster lock's wrapping transaction on
             ;; postgres/mysql app DBs, so the keep-row bookkeeping needs its own
             ;; autocommit connection to survive it.
             (binding [t2.connection/*current-connectable* nil]
               (t2/update! :model/WorkspaceDatabase {:id (:id wsd)}
                           {:output_namespace "" :database_details {} :status :unprovisioned}))
             (throw t))
           (finally
             ;; App-DB cleanup needs no warehouse connection, so it ALWAYS runs — stale
             ;; remappings would otherwise rewrite queries to a dropped schema and 500 the
             ;; QP. Fresh autocommit connection to survive any surrounding tx rollback.
             (binding [t2.connection/*current-connectable* nil]
               (ws.remapping-cleanup/clear-mappings-for-iso! db (:database_id wsd) schema))))
         (t2/delete! :model/WorkspaceDatabase :id (:id wsd))
         nil)))))
