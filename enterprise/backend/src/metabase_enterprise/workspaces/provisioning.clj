(ns metabase-enterprise.workspaces.provisioning
  (:require
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase-enterprise.workspaces.remapping-cleanup :as ws.remapping-cleanup]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.util :as driver.u]
   [metabase.util.log :as log]
   [potemkin.types :as p]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

;;; ------------------------------------------------- Protocol -------------------------------------------------------

(p/defprotocol+ Provisioner
  "Wrapper around driver workspace-isolation multimethods for testability.
   The default [[dispatching-provisioner]] delegates to the real driver multimethods.
   Tests can reify custom implementations that fail on demand, count calls, etc."
  (init!    [this driver database workspace]
    "Create isolated schema + user. Returns {:schema ... :database_details ...}.")
  (grant!   [this driver database workspace schemas]
    "Grant read access on `schemas` to the workspace user/role. `schemas` is a
     vector of driver-opaque schema-name strings. 3-slot drivers (SQL Server,
     BigQuery) derive the catalog from `database.details`.")
  (destroy! [this driver database workspace]
    "Tear down isolated schema + user. Should be idempotent."))

(def dispatching-provisioner
  "Default Provisioner that dispatches to the driver multimethods.

   Each call is wrapped in [[driver.conn/with-admin-connection]] so the underlying
   driver impls acquire connections via the database's `:admin-details` overlay
   (when configured). Workspace DDL — `CREATE USER`, `CREATE SCHEMA`, `GRANT` —
   typically needs higher-privilege credentials than the regular query user, and
   the admin overlay is how operators provide them."
  (reify Provisioner
    (init! [_ driver database workspace]
      (driver.conn/with-admin-connection
        (driver/init-workspace-isolation! driver database workspace)))
    (grant! [_ driver database workspace schemas]
      (driver.conn/with-admin-connection
        (driver/grant-workspace-read-access! driver database workspace schemas)))
    (destroy! [_ driver database workspace]
      (driver.conn/with-admin-connection
        (driver/destroy-workspace-isolation! driver database workspace)))))

;;; ---------------------------------------------- Implementation ----------------------------------------------------

(def ^:private ^:const provisioning-lock-timeout-seconds
  "Max wait for another node/thread to finish provisioning the same row."
  60)

(defn- wsd-lock-key
  "Per-row cluster-lock keyword."
  [workspace-database-id]
  (keyword "metabase-enterprise.workspaces.provisioning"
           (str "wsd-" workspace-database-id)))

(defn do-with-workspace-database-lock
  "Run `thunk` while holding the per-row cluster lock for `workspace-database-id`.
   [[provision-single!]]/[[deprovision-single!]] take this same lock internally, so
   the acquisition here is reentrant — it lets a caller atomically combine an app-db
   change with provisioning under a single lock, acquired *before* the row is
   mutated (the lock-before-mutate order the rest of the system relies on)."
  [workspace-database-id thunk]
  (cluster-lock/with-cluster-lock {:lock            (wsd-lock-key workspace-database-id)
                                   :timeout-seconds provisioning-lock-timeout-seconds}
    (thunk)))

(defmacro with-workspace-database-lock
  "Sugar over [[do-with-workspace-database-lock]]."
  [workspace-database-id & body]
  `(do-with-workspace-database-lock ~workspace-database-id (fn [] ~@body)))

;;; ---------------------------------------- Single-database operations -----------------------------------------------

(defn provision-workspace-database!
  "Provision an isolated output schema and user for a `:provisioning`
  WorkspaceDatabase row. State transitions: `:provisioning` -> `:provisioned`
  on success, or back to `:unprovisioned` on failure."
  [workspace-database-id provisioner]
  (try
    (with-workspace-database-lock workspace-database-id
      (let [wsd (t2/select-one :model/WorkspaceDatabase :id workspace-database-id)]
        (when-not wsd
          (throw (ex-info "WorkspaceDatabase not found" {:id workspace-database-id})))
        (when-not (= :provisioning (:status wsd))
          (throw (ex-info "WorkspaceDatabase must be :provisioning to provision"
                          {:id workspace-database-id :status (:status wsd)})))
        (let [db          (t2/select-one :model/Database :id (:database_id wsd))
              driver      (driver.u/database->driver db)
              workspace   {:id workspace-database-id :name (str "wsd-" workspace-database-id)}
              init-result (init! provisioner driver db workspace)
              ws-details  (merge workspace init-result)
              schemas     (vec (:input_schemas wsd))]
          (try
            (grant! provisioner driver db ws-details schemas)
            (catch Throwable t
              (destroy! provisioner driver db ws-details)
              (throw t)))
          (t2/update! :model/WorkspaceDatabase
                      {:id workspace-database-id}
                      {:output_namespace (:schema init-result)
                       :database_details (:database_details init-result)
                       :status           :provisioned}))))
    (catch Throwable t
      (t2/update! :model/WorkspaceDatabase
                  {:id workspace-database-id}
                  {:status :unprovisioned})
      (throw t)))
  (t2/select-one :model/WorkspaceDatabase :id workspace-database-id))

(defn deprovision-workspace-database!
  "Reverse provisioning for a `:deprovisioning` WorkspaceDatabase.
  State transitions: `:deprovisioning` -> `:unprovisioned` on success,
  or back to `:provisioned` on failure."
  [workspace-database-id provisioner]
  (try
    (with-workspace-database-lock workspace-database-id
      (let [wsd (t2/select-one :model/WorkspaceDatabase :id workspace-database-id)]
        (when-not wsd
          (throw (ex-info "WorkspaceDatabase not found" {:id workspace-database-id})))
        (when-not (= :deprovisioning (:status wsd))
          (throw (ex-info "WorkspaceDatabase must be :deprovisioning to deprovision"
                          {:id workspace-database-id :status (:status wsd)})))
        (let [db        (t2/select-one :model/Database :id (:database_id wsd))
              driver    (driver.u/database->driver db)
              workspace {:id               workspace-database-id
                         :name             (str "wsd-" workspace-database-id)
                         :schema           (:output_namespace wsd)
                         :database_details (:database_details wsd)}]
          (try
            (destroy! provisioner driver db workspace)
            (finally
              ;; Clear `TableRemapping` rows whose `to_*` matches this workspace's
              ;; iso namespace. Runs in `finally` so a partial warehouse teardown
              ;; (e.g. BQ dataset deleted, SA delete throws) still leaves app-DB
              ;; in a "workspace no longer routes queries" state. Without this,
              ;; future queries against canonical tables would rewrite to an iso
              ;; namespace that no longer exists and 500 in the QP. The unique
              ;; constraint on `(database_id, from_*)` prevents two workspaces on
              ;; the same DB from remapping the same canonical table, so scoping
              ;; by iso namespace alone is correct.
              ;;
              ;; Rebind `*current-connectable*` to nil so the DELETE runs on a
              ;; fresh autocommit connection outside the workspace-database lock's
              ;; tx. Otherwise, when `destroy!` throws, the surrounding tx rolls
              ;; back and undoes the DELETE.
              (binding [t2.connection/*current-connectable* nil]
                (ws.remapping-cleanup/clear-mappings-for-iso! db
                                                              (:database_id wsd)
                                                              (:output_namespace wsd)))))
          (t2/update! :model/WorkspaceDatabase
                      {:id workspace-database-id}
                      {:output_namespace ""
                       :database_details {}
                       :status           :unprovisioned}))))
    (catch Throwable t
      (t2/update! :model/WorkspaceDatabase
                  {:id workspace-database-id}
                  {:status :provisioned})
      (throw t)))
  (t2/select-one :model/WorkspaceDatabase :id workspace-database-id))

;;; ----------------------------------- High-level entry points (blocking) --------------------------------------------

(defn provision-single!
  "Flip a single WorkspaceDatabase to `:provisioning` and provision it synchronously.
   The row must be `:unprovisioned`. Returns the updated WorkspaceDatabase row."
  ([wsd-id]
   (provision-single! wsd-id dispatching-provisioner))
  ([wsd-id provisioner]
   (t2/update! :model/WorkspaceDatabase {:id wsd-id :status :unprovisioned}
               {:status :provisioning})
   (provision-workspace-database! wsd-id provisioner)))

(defn deprovision-single!
  "Flip a single WorkspaceDatabase to `:deprovisioning` and deprovision it synchronously.
   The row must be `:provisioned`. Returns the updated WorkspaceDatabase row."
  ([wsd-id]
   (deprovision-single! wsd-id dispatching-provisioner))
  ([wsd-id provisioner]
   (t2/update! :model/WorkspaceDatabase {:id wsd-id :status :provisioned}
               {:status :deprovisioning})
   (deprovision-workspace-database! wsd-id provisioner)))

(defn provision-workspace!
  "Flip every `:unprovisioned` WorkspaceDatabase under `workspace-id` to
  `:provisioning`, then provision each one synchronously (blocking).
  Returns the number of databases provisioned."
  ([workspace-id]
   (provision-workspace! workspace-id dispatching-provisioner))
  ([workspace-id provisioner]
   (let [triggered (t2/update! :model/WorkspaceDatabase
                               {:workspace_id workspace-id :status :unprovisioned}
                               {:status :provisioning})]
     (when (pos? triggered)
       (doseq [{:keys [id]} (t2/select [:model/WorkspaceDatabase :id]
                                       :workspace_id workspace-id
                                       :status       :provisioning)]
         (try
           (provision-workspace-database! id provisioner)
           (catch Throwable t
             (log/warnf t "Failed to provision WorkspaceDatabase %s" id)))))
     triggered)))

(defn force-teardown-for-delete!
  "Best-effort warehouse teardown for a single WorkspaceDatabase, used only by the
  delete path. Drops the iso schema + user (idempotent), always clears the row's
  app-DB `TableRemapping` rows, then forces the row to `:unprovisioned` regardless
  of the warehouse outcome.

  Works from ANY non-`:unprovisioned` state: the iso schema and user names are
  deterministic from the row id (see [[metabase.driver.util/workspace-isolation-namespace-name]]),
  so the destroy target is reconstructable even for a row stuck in `:provisioning`
  that never stored its `:output_namespace`/`:database_details`.

  Returns `{:status :success}` when the warehouse objects were dropped, or
  `{:status :failure :workspace_database_id .. :database_id .. :driver .. :schema ..
  :user .. :reason ..}` when the warehouse was unreachable and inert objects were
  left behind for manual cleanup."
  [wsd provisioner]
  (with-workspace-database-lock (:id wsd)
    (let [db        (t2/select-one :model/Database :id (:database_id wsd))
          driver    (driver.u/database->driver db)
          iso-ws    {:id (:id wsd) :name (str "wsd-" (:id wsd))}
          schema    (or (not-empty (:output_namespace wsd))
                        (driver.u/workspace-isolation-namespace-name iso-ws))
          user      (or (get-in wsd [:database_details :user])
                        (driver.u/workspace-isolation-user-name iso-ws))
          ;; prefer the stored details verbatim (some drivers stash more than :user
          ;; there); synthesize a minimal map only for a crashed :provisioning row
          ;; that never recorded anything.
          details   (if (seq (:database_details wsd))
                      (:database_details wsd)
                      {:user user})
          workspace (assoc iso-ws :schema schema :database_details details)
          result    (try
                      (destroy! provisioner driver db workspace)
                      {:status :success}
                      (catch Throwable t
                        (log/warnf t (str "Workspace database %d: warehouse cleanup failed; leaving schema \"%s\" "
                                          "and user \"%s\" on database %d for manual removal")
                                   (:id wsd) schema user (:database_id wsd))
                        {:status                :failure
                         :workspace_database_id (:id wsd)
                         :database_id           (:database_id wsd)
                         :driver                driver
                         :schema                schema
                         :user                  user
                         :reason                (ex-message t)}))]
      ;; App-DB cleanup needs no warehouse connection, so it ALWAYS runs — stale
      ;; remappings would otherwise rewrite queries to a dropped schema and 500 the
      ;; QP. Fresh autocommit connection to survive any surrounding tx rollback
      ;; (mirrors `deprovision-workspace-database!`).
      (binding [t2.connection/*current-connectable* nil]
        (ws.remapping-cleanup/clear-mappings-for-iso! db (:database_id wsd) schema))
      (t2/update! :model/WorkspaceDatabase {:id (:id wsd)}
                  {:output_namespace "" :database_details {} :status :unprovisioned})
      result)))

(defn ignore-pending-database!
  "Delete-path helper for a WorkspaceDatabase the admin chose to delete while it is
  still `:provisioning`/`:deprovisioning`. Does NOT touch the warehouse — the row may
  be in flight on another node — it only clears the row's app-DB `TableRemapping`
  rows and forces it to `:unprovisioned` so it can be cascade-deleted. Any warehouse
  schema/user is intentionally left in place."
  [wsd]
  (with-workspace-database-lock (:id wsd)
    (let [db (t2/select-one :model/Database :id (:database_id wsd))]
      (binding [t2.connection/*current-connectable* nil]
        (ws.remapping-cleanup/clear-mappings-for-iso! db (:database_id wsd) (:output_namespace wsd)))
      (t2/update! :model/WorkspaceDatabase {:id (:id wsd)} {:status :unprovisioned}))))

(defn deprovision-workspace!
  "Flip every `:provisioned` WorkspaceDatabase under `workspace-id` to
  `:deprovisioning`, then deprovision each one synchronously (blocking).
  Returns the number of databases deprovisioned."
  ([workspace-id]
   (deprovision-workspace! workspace-id dispatching-provisioner))
  ([workspace-id provisioner]
   (let [triggered (t2/update! :model/WorkspaceDatabase
                               {:workspace_id workspace-id :status :provisioned}
                               {:status :deprovisioning})]
     (when (pos? triggered)
       (doseq [{:keys [id]} (t2/select [:model/WorkspaceDatabase :id]
                                       :workspace_id workspace-id
                                       :status       :deprovisioning)]
         (try
           (deprovision-workspace-database! id provisioner)
           (catch Throwable t
             (log/warnf t "Failed to deprovision WorkspaceDatabase %s" id)))))
     triggered)))
