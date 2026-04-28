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
  (grant!   [this driver database workspace schemas]
    "Grant read access on input schemas to the workspace user.")
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
              schemas     (mapv (fn [s] {:schema s}) (:input_schemas wsd))]
          (try
            (grant! provisioner driver db ws-details schemas)
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

(defn provision-workspace-databases!
  "Synchronously provision every `:provisioning` WorkspaceDatabase under `workspace-id`."
  [workspace-id provisioner]
  (doseq [{:keys [id]} (t2/select [:model/WorkspaceDatabase :id]
                                  :workspace_id workspace-id
                                  :status       :provisioning)]
    (try
      (provision-workspace-database! id provisioner)
      (catch Throwable t
        (log/warnf t "Failed to provision WorkspaceDatabase %s" id)))))

(defn run-async!
  "Test seam. Dispatches `f` on a background thread. Rebind in tests to run synchronously."
  [f]
  (future (f)))

(defn provision-workspace!
  "Flip every `:unprovisioned` WorkspaceDatabase under `workspace-id` to
  `:provisioning` synchronously, then kick off async provisioning.
  Returns the number of rows scheduled."
  ([workspace-id]
   (provision-workspace! workspace-id dispatching-provisioner))
  ([workspace-id provisioner]
   (let [triggered (t2/update! :model/WorkspaceDatabase
                               {:workspace_id workspace-id :status :unprovisioned}
                               {:status :provisioning})]
     (when (pos? triggered)
       (run-async! (fn [] (provision-workspace-databases! workspace-id provisioner))))
     triggered)))

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

(defn deprovision-workspace-databases!
  "Synchronously deprovision every `:deprovisioning` WorkspaceDatabase under `workspace-id`."
  [workspace-id provisioner]
  (doseq [{:keys [id]} (t2/select [:model/WorkspaceDatabase :id]
                                  :workspace_id workspace-id
                                  :status       :deprovisioning)]
    (try
      (deprovision-workspace-database! id provisioner)
      (catch Throwable t
        (log/warnf t "Failed to deprovision WorkspaceDatabase %s" id)))))

(defn deprovision-workspace!
  "Flip every `:provisioned` WorkspaceDatabase under `workspace-id` to
  `:deprovisioning` synchronously, then kick off async deprovisioning.
  Returns the number of rows scheduled."
  ([workspace-id]
   (deprovision-workspace! workspace-id dispatching-provisioner))
  ([workspace-id provisioner]
   (let [triggered (t2/update! :model/WorkspaceDatabase
                               {:workspace_id workspace-id :status :provisioned}
                               {:status :deprovisioning})]
     (when (pos? triggered)
       (run-async! (fn [] (deprovision-workspace-databases! workspace-id provisioner))))
     triggered)))
