(ns metabase-enterprise.workspaces.common
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.models.workspace-log :as ws.log]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :as api]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [toucan2.core :as t2]))

(defn- extract-suffix-number
  "Extract the numeric suffix from a workspace name like 'Foo (3)', or nil if no valid suffix."
  [ws-name base-name]
  (when (= (str/replace ws-name #"\s*\(\d+\)$" "") base-name)
    (when-let [[_ n] (re-find #"\((\d+)\)$" ws-name)]
      (parse-long n))))

(defn- generate-unique-workspace-name
  "Generate a unique workspace name by appending (N) if the name already exists.

  Strategy:
  1. If the base name doesn't exist, use it as-is
  2. If it exists, strip any existing (N) suffix and find the highest N among similar names
  3. Return the base name with (N+1) appended

  Note: This function has a potential race condition between checking existence and insertion.
  Callers should handle unique constraint violations by retrying."
  [base-name]
  (when (str/blank? base-name)
    (throw (ex-info "Workspace name cannot be empty" {:status-code 400})))
  (if-not (t2/exists? :model/Workspace :name base-name)
    base-name
    (let [stripped-name (str/replace base-name #"\s*\(\d+\)$" "")
          existing      (t2/select-fn-set :name :model/Workspace
                                          :name [:like (str stripped-name " (%)")])
          numbers       (keep #(extract-suffix-number % stripped-name) existing)
          next-num      (inc (apply max 0 numbers))]
      (str stripped-name " (" next-num ")"))))

;; TODO: Generate new metabase user for the workspace
(defn- create-workspace-container!
  "Create the workspace and its related collection, user, and api key."
  [creator-id db-id workspace-name]
  ;; TODO (Chris 2025-11-19) Unsure API key name is unique, and remove this (insecure) workaround.
  (let [api-key (let [key-name (format "API key for Workspace %s" workspace-name)]
                  (or (t2/select-one :model/ApiKey :name key-name)
                      (api-key/create-api-key-with-new-user! {:key-name key-name})))
        ;; TODO (Chris 2025-11-19) Associate the api-key user with the workspace as well.
        ws      (t2/insert-returning-instance! :model/Workspace
                                               {:name           workspace-name
                                                :creator_id     creator-id
                                                :database_id    db-id
                                                :api_key_id     (:id api-key)
                                                :execution_user (:user_id api-key)
                                                :base_status    :empty
                                                :db_status      :uninitialized})
        coll    (t2/insert-returning-instance! :model/Collection
                                               {:name         (format "Collection for Workspace %s" workspace-name)
                                                :namespace    "workspace"
                                                :workspace_id (:id ws)})
        ws      (assoc ws :collection_id (:id coll))]
    ;; Set the backlink from the workspace to the collection inside it and set the schema.
    (t2/update! :model/Workspace (:id ws) {:collection_id (:id coll)})
    ;; TODO (Sanya 2025-11-18) - for now we expose this in logs for manual testing, in future we need a secure channel
    (log/infof "Generated API key for workspace: %s" (:unmasked_key api-key))
    ws))

(defn- unique-constraint-violation?
  "Check if an exception is due to a unique constraint violation."
  [e]
  (let [msg (str (ex-message e) (some-> (ex-cause e) ex-message))]
    (or (str/includes? msg "unique")
        (str/includes? msg "duplicate")
        (str/includes? msg "UNIQUE"))))

(defn- run-workspace-setup!
  "Background job: runs isolation, grants. Updates db_status to :ready when done."
  [{ws-id :id :as workspace} database]
  (try
    (ws.log/track! ws-id :workspace-setup
      (let [isolation-details (ws.log/track! ws-id :database-isolation
                                (ws.isolation/ensure-database-isolation! workspace database))]
        (t2/update! :model/Workspace ws-id (merge (select-keys isolation-details [:schema :database_details])
                                                  {:db_status :ready}))))
    (catch Exception e
      (log/error e "Failed to setup workspace")
      (t2/update! :model/Workspace ws-id {:db_status :broken})
      (throw e))))

(defn initialize-workspace!
  "Initialize an uninitialized workspace with the given database_id.
   Updates database_id (if different from provisional), sets schema, creates isolation resources async,
   and transitions db_status to :pending. Returns the updated workspace with schema set."
  [workspace database-id]
  (let [database (t2/select-one :model/Database database-id)
        schema   (ws.u/isolation-namespace-name workspace)
        res      (t2/update! :model/Workspace {:id        (:id workspace)
                                               :db_status :uninitialized}
                             {:database_id database-id
                              :schema      schema
                              :db_status   :pending})]
    (when (zero? res)
      (let [new-db-id (t2/select-one-fn :database_id :model/Workspace (:id workspace))]
        (when (not= database-id new-db-id)
          (throw (ex-info "Workspace has been initialized already with a different database"
                          {:requested-db-id database-id
                           :actual-db-id    new-db-id})))))
    (let [ws (t2/select-one :model/Workspace (:id workspace))]
      ;; TODO allow this to be fully async as part of BOT-746
      (try
        @(quick-task/submit-task! #(run-workspace-setup! ws database))
        (catch Exception e
          (log/error e "Failed to initialize workspace")))
      ;; Querying again to get the database_details
      (t2/select-one :model/Workspace (:id workspace)))))

(defn- create-uninitialized-workspace!
  "Create a workspace with a provisional database_id but no isolation resources.
   Retries on unique constraint violations for workspace name."
  [creator-id db-id ws-name max-retries]
  (loop [attempt 1]
    (let [unique-name         (generate-unique-workspace-name ws-name)
          {:keys [retry
                  workspace]} (try
                                {:workspace (create-workspace-container! creator-id db-id unique-name)}
                                (catch Exception e
                                  (if (and (< attempt max-retries) (unique-constraint-violation? e))
                                    {:retry true}
                                    (throw e))))]
      (if retry
        (recur (inc attempt))
        workspace))))

(defn create-workspace!
  "Create workspace."
  [creator-id {ws-name-maybe :name
               db-id         :database_id}]
  (let [ws-name (or ws-name-maybe (ws.u/generate-name))]
    (create-uninitialized-workspace! creator-id db-id ws-name 5)))

(defn add-to-changeset!
  "Add the given transform to the workspace changeset.
   If workspace db_status is uninitialized, initializes it with the transform's target database.
   If workspace base_status is empty, transitions it to active."
  [creator-id workspace entity-type global-id body]
  (ws.u/assert-transform! entity-type)
  ;; Initialize workspace if uninitialized (outside transaction so async task can see committed data)
  (let [workspace (if (= :uninitialized (:db_status workspace))
                    (let [target-db-id (transforms.i/target-db-id body)]
                      (api/check-400 target-db-id "Transform must have a target database")
                      (initialize-workspace! workspace target-db-id))
                    workspace)]
    (t2/with-transaction [_]
      (let [workspace-id    (:id workspace)
            workspace-db-id (:database_id workspace)
            body            (assoc-in body [:target :database] workspace-db-id)
            transform       (ws.u/insert-returning-ws-tx!
                             (assoc (select-keys body [:name :description :source :target])
                                    :ref_id (ws.u/generate-ref-id)
                                    :creator_id creator-id
                                    :global_id global-id
                                    :workspace_id workspace-id))]
        (t2/update! :model/Workspace workspace-id
                    ;; Increment graph_version since new transform = graph needs recalculation
                    (cond-> {:graph_version [:+ :graph_version 1]}
                     ;; Transition base_status from :empty to :active when first transform is added
                      (= :empty (:base_status workspace))
                      (assoc :base_status :active)))
        transform))))
