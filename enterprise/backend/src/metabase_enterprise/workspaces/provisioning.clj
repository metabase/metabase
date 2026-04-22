(ns metabase-enterprise.workspaces.provisioning
  (:require
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(def ^:private ^:const provisioning-lock-timeout-seconds
  "Max wait for another node/thread to finish provisioning the same row. Provisioning
   does warehouse-side work (CREATE SCHEMA, CREATE USER, GRANT) that can take tens of
   seconds against real Postgres/MySQL; a loser needs enough headroom to wait out the
   winner rather than timing out and retrying mid-operation."
  60)

(defn- wsd-lock-key
  "Per-row cluster-lock keyword. Different workspace_database ids take different locks
   so independent provisionings don't serialize globally."
  [workspace-database-id]
  (keyword "metabase-enterprise.workspaces.provisioning"
           (str "wsd-" workspace-database-id)))

(defn provision-workspace-database!
  "Provision an isolated output schema and user for an already-existing, uninitialized
  `WorkspaceDatabase` row, using driver-level primitives. Grants the provisioned user
  read access on the row's `:input_schemas` and write access on the new output schema.
  Updates the row with `:output_schema`, `:database_details`, and `:status :initialized`
  and returns it. Throws if the row is already initialized.

  Holds an appdb cluster-lock keyed on `workspace-database-id` for the duration of the
  warehouse-side work. Concurrent callers (same process via `initialize-workspace!`
  futures, or different nodes of a clustered deployment) serialize: the first caller
  creates the schema/user and flips status to `:initialized`; the second caller then
  acquires the lock, re-reads status, sees `:initialized`, and throws."
  [workspace-database-id]
  (cluster-lock/with-cluster-lock {:lock            (wsd-lock-key workspace-database-id)
                                   :timeout-seconds provisioning-lock-timeout-seconds}
    (let [wsd (t2/select-one :model/WorkspaceDatabase :id workspace-database-id)]
      (when-not wsd
        (throw (ex-info "WorkspaceDatabase not found" {:id workspace-database-id})))
      (when (= :initialized (:status wsd))
        (throw (ex-info "WorkspaceDatabase is already initialized"
                        {:id workspace-database-id :status (:status wsd)})))
      (let [db          (t2/select-one :model/Database :id (:database_id wsd))
            driver      (driver.u/database->driver db)
            workspace   {:id workspace-database-id :name (str "wsd-" workspace-database-id)}
            init-result (driver/init-workspace-isolation! driver db workspace)
            ws-details  (merge workspace init-result)
            schemas     (mapv (fn [s] {:schema s}) (:input_schemas wsd))]
        (try
          (driver/grant-workspace-read-access! driver db ws-details schemas)
          (catch Throwable t
            (driver/destroy-workspace-isolation! driver db ws-details)
            (throw t)))
        (t2/update! :model/WorkspaceDatabase
                    {:id workspace-database-id}
                    {:output_schema    (:schema init-result)
                     :database_details (:database_details init-result)
                     :status           :initialized})
        (t2/select-one :model/WorkspaceDatabase :id workspace-database-id)))))

(defn initialize-workspace-databases!
  "Synchronously provision every `:uninitialized` WorkspaceDatabase under `workspace-id`.
  Each row is attempted independently; per-row exceptions are logged and swallowed so a
  single failure does not block the rest of the batch."
  [workspace-id]
  (doseq [{:keys [id]} (t2/select [:model/WorkspaceDatabase :id]
                                  :workspace_id workspace-id
                                  :status       :uninitialized)]
    (try
      (provision-workspace-database! id)
      (catch Throwable t
        (log/warnf t "Failed to provision WorkspaceDatabase %s" id)))))

(defn run-async!
  "Test seam. Dispatches `f` on a background thread. Rebind in tests
  (`with-redefs [provisioning/run-async! (fn [f] (f))]`) to run the body
  synchronously so assertions can observe its effects without racing the
  background thread."
  [f]
  (future (f)))

(defn initialize-workspace!
  "Kick off async provisioning for every `:uninitialized` WorkspaceDatabase under
  `workspace-id`. Returns the number of rows that were scheduled."
  [workspace-id]
  (let [pending-count (t2/count :model/WorkspaceDatabase
                                :workspace_id workspace-id
                                :status       :uninitialized)]
    (run-async! (fn [] (initialize-workspace-databases! workspace-id)))
    pending-count))

(defn deprovision-workspace-database!
  "Reverse provisioning for an `:initialized` WorkspaceDatabase: call
  `driver/destroy-workspace-isolation!` to drop the isolated schema and user,
  then reset the row to `:uninitialized` with empty `:database_details` /
  `:output_schema`. Throws if the row is not `:initialized`. Returns the
  updated row. Takes the same cluster-lock as [[provision-workspace-database!]]
  so a provision and deprovision for the same row can't interleave (e.g.
  admin clicks Provision, then Deprovision before the first future commits)."
  [workspace-database-id]
  (cluster-lock/with-cluster-lock {:lock            (wsd-lock-key workspace-database-id)
                                   :timeout-seconds provisioning-lock-timeout-seconds}
    (let [wsd (t2/select-one :model/WorkspaceDatabase :id workspace-database-id)]
      (when-not wsd
        (throw (ex-info "WorkspaceDatabase not found" {:id workspace-database-id})))
      (when-not (= :initialized (:status wsd))
        (throw (ex-info "WorkspaceDatabase is not initialized"
                        {:id workspace-database-id :status (:status wsd)})))
      (let [db        (t2/select-one :model/Database :id (:database_id wsd))
            driver    (driver.u/database->driver db)
            workspace {:id               workspace-database-id
                       :name             (str "wsd-" workspace-database-id)
                       :schema           (:output_schema wsd)
                       :database_details (:database_details wsd)}]
        (driver/destroy-workspace-isolation! driver db workspace)
        (t2/update! :model/WorkspaceDatabase
                    {:id workspace-database-id}
                    {:output_schema    ""
                     :database_details {}
                     :status           :uninitialized})
        (t2/select-one :model/WorkspaceDatabase :id workspace-database-id)))))

(defn deprovision-workspace-databases!
  "Synchronously deprovision every `:initialized` WorkspaceDatabase under
  `workspace-id`. Per-row exceptions are logged and swallowed so one failure
  does not block the rest of the batch."
  [workspace-id]
  (doseq [{:keys [id]} (t2/select [:model/WorkspaceDatabase :id]
                                  :workspace_id workspace-id
                                  :status       :initialized)]
    (try
      (deprovision-workspace-database! id)
      (catch Throwable t
        (log/warnf t "Failed to deprovision WorkspaceDatabase %s" id)))))

(defn deprovision-workspace!
  "Kick off async deprovisioning for every `:initialized` WorkspaceDatabase
  under `workspace-id`. Returns the number of rows that were scheduled."
  [workspace-id]
  (let [pending-count (t2/count :model/WorkspaceDatabase
                                :workspace_id workspace-id
                                :status       :initialized)]
    (run-async! (fn [] (deprovision-workspace-databases! workspace-id)))
    pending-count))
