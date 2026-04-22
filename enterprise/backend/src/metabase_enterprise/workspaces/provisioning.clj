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
  "Provision an isolated output schema and user for an already-existing
  `:unprovisioned` `WorkspaceDatabase` row, using driver-level primitives. Grants
  the provisioned user read access on the row's `:input_schemas` and write access
  on the new output schema. State transitions: `:unprovisioned` -> `:provisioning`
  (before any driver call) -> `:provisioned` on success, or back to `:unprovisioned`
  on failure (with warehouse-side cleanup via `destroy-workspace-isolation!`).
  Throws unless the row is currently `:unprovisioned`. Returns the updated row.

  Holds an appdb cluster-lock keyed on `workspace-database-id` for the duration of
  the warehouse-side work so concurrent provision attempts on the same row
  serialize safely (any later caller sees a non-`:unprovisioned` status and throws)."
  [workspace-database-id]
  (cluster-lock/with-cluster-lock {:lock            (wsd-lock-key workspace-database-id)
                                   :timeout-seconds provisioning-lock-timeout-seconds}
    (let [wsd (t2/select-one :model/WorkspaceDatabase :id workspace-database-id)]
      (when-not wsd
        (throw (ex-info "WorkspaceDatabase not found" {:id workspace-database-id})))
      (when-not (= :unprovisioned (:status wsd))
        (throw (ex-info "WorkspaceDatabase must be :unprovisioned to provision"
                        {:id workspace-database-id :status (:status wsd)})))
      (t2/update! :model/WorkspaceDatabase
                  {:id workspace-database-id}
                  {:status :provisioning})
      (try
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
                       :status           :provisioned}))
        (catch Throwable t
          (t2/update! :model/WorkspaceDatabase
                      {:id workspace-database-id}
                      {:status :unprovisioned})
          (throw t)))
      (t2/select-one :model/WorkspaceDatabase :id workspace-database-id))))

(defn provision-workspace-databases!
  "Synchronously provision every `:unprovisioned` WorkspaceDatabase under `workspace-id`.
  Each row is attempted independently; per-row exceptions are logged and swallowed so a
  single failure does not block the rest of the batch."
  [workspace-id]
  (doseq [{:keys [id]} (t2/select [:model/WorkspaceDatabase :id]
                                  :workspace_id workspace-id
                                  :status       :unprovisioned)]
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

(defn provision-workspace!
  "Kick off async provisioning for every `:unprovisioned` WorkspaceDatabase under
  `workspace-id`. Returns the number of rows that were scheduled."
  [workspace-id]
  (let [pending-count (t2/count :model/WorkspaceDatabase
                                :workspace_id workspace-id
                                :status       :unprovisioned)]
    (run-async! (fn [] (provision-workspace-databases! workspace-id)))
    pending-count))

(defn unprovision-workspace-database!
  "Reverse provisioning for a `:provisioned` WorkspaceDatabase. State transitions:
  `:provisioned` -> `:unprovisioning` (before driver call) -> `:unprovisioned` on
  success (with empty `:database_details` / `:output_schema`), or back to
  `:provisioned` on failure so the admin can retry. Throws unless the row is
  `:provisioned`. Returns the updated row. Takes the same cluster-lock as
  [[provision-workspace-database!]]."
  [workspace-database-id]
  (cluster-lock/with-cluster-lock {:lock            (wsd-lock-key workspace-database-id)
                                   :timeout-seconds provisioning-lock-timeout-seconds}
    (let [wsd (t2/select-one :model/WorkspaceDatabase :id workspace-database-id)]
      (when-not wsd
        (throw (ex-info "WorkspaceDatabase not found" {:id workspace-database-id})))
      (when-not (= :provisioned (:status wsd))
        (throw (ex-info "WorkspaceDatabase must be :provisioned to unprovision"
                        {:id workspace-database-id :status (:status wsd)})))
      (t2/update! :model/WorkspaceDatabase
                  {:id workspace-database-id}
                  {:status :unprovisioning})
      (try
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
                       :status           :unprovisioned}))
        (catch Throwable t
          (t2/update! :model/WorkspaceDatabase
                      {:id workspace-database-id}
                      {:status :provisioned})
          (throw t)))
      (t2/select-one :model/WorkspaceDatabase :id workspace-database-id))))

(defn unprovision-workspace-databases!
  "Synchronously unprovision every `:provisioned` WorkspaceDatabase under
  `workspace-id`. Per-row exceptions are logged and swallowed so one failure
  does not block the rest of the batch."
  [workspace-id]
  (doseq [{:keys [id]} (t2/select [:model/WorkspaceDatabase :id]
                                  :workspace_id workspace-id
                                  :status       :provisioned)]
    (try
      (unprovision-workspace-database! id)
      (catch Throwable t
        (log/warnf t "Failed to unprovision WorkspaceDatabase %s" id)))))

(defn unprovision-workspace!
  "Kick off async unprovisioning for every `:provisioned` WorkspaceDatabase
  under `workspace-id`. Returns the number of rows that were scheduled."
  [workspace-id]
  (let [pending-count (t2/count :model/WorkspaceDatabase
                                :workspace_id workspace-id
                                :status       :provisioned)]
    (run-async! (fn [] (unprovision-workspace-databases! workspace-id)))
    pending-count))
