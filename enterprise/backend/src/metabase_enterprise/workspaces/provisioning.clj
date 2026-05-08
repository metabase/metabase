(ns metabase-enterprise.workspaces.provisioning
  (:require
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util.log :as log]
   [potemkin.types :as p]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

;;; ------------------------------------------------- Protocol -------------------------------------------------------

(p/defprotocol+ Provisioner
  "Wrapper around driver workspace-isolation multimethods for testability.
   The default [[dispatching-provisioner]] delegates to the real driver multimethods.
   Tests can reify custom implementations that fail on demand, count calls, etc."
  (init!    [this driver database workspace]
    "Create isolated schema + user. Returns {:schema ... :database_details ...}.")
  (grant!   [this driver database workspace input]
    "Grant read access on input namespaces to the workspace user/role. `input`
     is a vector of `::table-namespace` maps `[{:db ?, :schema ?}]`.")
  (destroy! [this driver database workspace]
    "Tear down isolated schema + user. Should be idempotent."))

(def dispatching-provisioner
  "Default Provisioner that dispatches to the driver multimethods."
  (reify Provisioner
    (init! [_ driver database workspace]
      (driver/init-workspace-isolation! driver database workspace))
    (grant! [_ driver database workspace schemas]
      (driver/grant-workspace-read-access! driver database workspace schemas))
    (destroy! [_ driver database workspace]
      (driver/destroy-workspace-isolation! driver database workspace))))

;;; ---------------------------------------------- Implementation ----------------------------------------------------

(def ^:private ^:const provisioning-lock-timeout-seconds
  "Max wait for another node/thread to finish provisioning the same row."
  60)

(defn- wsd-lock-key
  "Per-row cluster-lock keyword."
  [workspace-database-id]
  (keyword "metabase-enterprise.workspaces.provisioning"
           (str "wsd-" workspace-database-id)))

;;; ---------------------------------------- Single-database operations -----------------------------------------------

(defn provision-workspace-database!
  "Provision an isolated output schema and user for a `:provisioning`
  WorkspaceDatabase row. State transitions: `:provisioning` -> `:provisioned`
  on success, or back to `:unprovisioned` on failure."
  [workspace-database-id provisioner]
  (try
    (cluster-lock/with-cluster-lock {:lock            (wsd-lock-key workspace-database-id)
                                     :timeout-seconds provisioning-lock-timeout-seconds}
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
              ;; `:input` is a vector of `::table-namespace` maps `[{:db ?, :schema ?}]`.
              ;; Driver `grant!` impls receive them directly — 3-slot drivers (Snowflake,
              ;; SQL Server) read `:db`; schema-having drivers read `:schema`.
              input       (vec (:input wsd))]
          (try
            (grant! provisioner driver db ws-details input)
            (catch Throwable t
              (destroy! provisioner driver db ws-details)
              (throw t)))
          (t2/update! :model/WorkspaceDatabase
                      {:id workspace-database-id}
                      {:output_schema    (:schema init-result)
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
    (cluster-lock/with-cluster-lock {:lock            (wsd-lock-key workspace-database-id)
                                     :timeout-seconds provisioning-lock-timeout-seconds}
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
                         :schema           (:output_schema wsd)
                         :database_details (:database_details wsd)}]
          (destroy! provisioner driver db workspace)
          (t2/update! :model/WorkspaceDatabase
                      {:id workspace-database-id}
                      {:output_schema    ""
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
