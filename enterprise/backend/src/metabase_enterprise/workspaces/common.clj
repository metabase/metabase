(ns metabase-enterprise.workspaces.common
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.models.workspace-log :as ws.log]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.quick-task :as quick-task]
   [toucan2.core :as t2]))

;; should be encapsulated in our dag namespace, or dependency module
(defn check-no-card-dependencies!
  "Check that transforms don't depend on cards. Throws 400 if they do."
  [transform-ids]
  (when-let [card-ids (seq (ws.dag/unsupported-dependency? transform-ids))]
    (api/check-400 false
                   (format "Cannot add transforms that depend on saved questions (cards). Found dependencies on card IDs: %s"
                           (pr-str (vec card-ids))))))

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
;; TODO: Should we move this to model as per the diagram?
(defn- create-workspace-container!
  "Create the workspace and its related collection, user, and api key."
  [creator-id db-id workspace-name status]
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
                                                :status         status})
        coll    (t2/insert-returning-instance! :model/Collection
                                               {:name         (format "Collection for Workspace %s" workspace-name)
                                                :namespace    "workspace"
                                                :workspace_id (:id ws)})
        ;; Only set schema for initialized workspaces (not uninitialized)
        schema  (when (not= status :uninitialized) (ws.u/isolation-namespace-name ws))
        ws      (assoc ws
                       :collection_id (:id coll)
                       :schema schema)]
    ;; Set the backlink from the workspace to the collection inside it and set the schema.
    (t2/update! :model/Workspace (:id ws) (cond-> {:collection_id (:id coll)}
                                            schema (assoc :schema schema)))
    ;; TODO (Sanya 2025-11-18) - not sure how to transfer this api key to agent
    #_(log/infof "Generated API key for workspace: %s" (u.secret/expose (:unmasked_key api-key)))
    ws))

(defn- unique-constraint-violation?
  "Check if an exception is due to a unique constraint violation."
  [e]
  (let [msg (str (ex-message e) (some-> (ex-cause e) ex-message))]
    (or (str/includes? msg "unique")
        (str/includes? msg "duplicate")
        (str/includes? msg "UNIQUE"))))

(defn- run-workspace-setup!
  "Background job: runs isolation, grants. Updates status to :ready when done."
  [{ws-id :id :as workspace} database]
  (ws.log/track! ws-id :workspace-setup
    (let [{:keys [_database_details]} (ws.log/track! ws-id :database-isolation
                                        (-> (ws.isolation/ensure-database-isolation! workspace database)
                                            ;; it actually returns just those, this is more like a doc than behavior
                                            (select-keys [:schema :database_details])
                                            (u/prog1 (t2/update! :model/Workspace ws-id <>))))]
      (t2/update! :model/Workspace ws-id {:status :ready}))))

(defn initialize-workspace!
  "Initialize an uninitialized workspace with the given database_id.
   Updates database_id (if different from provisional), sets schema, creates isolation resources async,
   and transitions to :pending status. Returns the updated workspace with schema set."
  [workspace database-id]
  (let [database (t2/select-one :model/Database :id database-id)
        schema   (ws.u/isolation-namespace-name workspace)
        res      (t2/update! :model/Workspace {:id     (:id workspace)
                                               :status :uninitialized}
                             {:database_id database-id
                              :schema      schema
                              :status      :pending})]
    (when (zero? res)
      (let [new-db-id (t2/select-one-fn :database_id :model/Workspace (:id workspace))]
        (when (not= database-id new-db-id)
          (throw (ex-info "Workspace has been initialized already with a different database"
                          {:requested-db-id database-id
                           :actual-db-id    new-db-id})))))
    (u/prog1 (t2/select-one :model/Workspace :id (:id workspace))
      (quick-task/submit-task! #(run-workspace-setup! <> database)))))

(defn- create-uninitialized-workspace!
  "Create a workspace with a provisional database_id but no isolation resources.
   Retries on unique constraint violations for workspace name."
  [creator-id db-id ws-name max-retries]
  (loop [attempt 1]
    (let [unique-name         (generate-unique-workspace-name ws-name)
          {:keys [retry
                  workspace]} (try
                                {:workspace (create-workspace-container! creator-id db-id unique-name :uninitialized)}
                                (catch Exception e
                                  (if (and (< attempt max-retries) (unique-constraint-violation? e))
                                    {:retry true}
                                    (throw e))))]
      (if retry
        (recur (inc attempt))
        workspace))))

;; TODO internal: test!
(defn create-workspace!
  "Create workspace. If :provisional is true, creates an uninitialized workspace with a
   provisional database_id (no isolation resources yet). Otherwise creates a pending
   workspace and kicks off async setup."
  [creator-id {ws-name-maybe :name
               db-id         :database_id
               provisional?  :provisional?}]
  (let [ws-name (or ws-name-maybe (str (random-uuid)))
        ws      (create-uninitialized-workspace! creator-id db-id ws-name 5)]
    (if provisional?
      ws
      (initialize-workspace! ws db-id))))

(defn add-to-changeset!
  "Add the given transform to the workspace changeset.
   If workspace is uninitialized, initializes it with the transform's target database."
  [_creator-id workspace entity-type global-id body]
  (ws.u/assert-transform! entity-type)
  ;; Initialize workspace if uninitialized (outside transaction so async task can see committed data)
  (let [workspace (if (= :uninitialized (:status workspace))
                    (let [target-db-id (get-in body [:target :database])]
                      (api/check-400 target-db-id "Transform must have a target database")
                      (initialize-workspace! workspace target-db-id))
                    workspace)]
    (t2/with-transaction [_]
      (let [workspace-id    (:id workspace)
            workspace-db-id (:database_id workspace)
            body            (assoc-in body [:target :database] workspace-db-id)
            transform       (t2/insert-returning-instance!
                             :model/WorkspaceTransform
                             (assoc (select-keys body [:name :description :source :target])
                                    ;; TODO add this to workspace_transform, or implicitly use the id of the user that does the merge?
                                    ;;:creator_id creator-id
                                    :global_id global-id
                                    :workspace_id workspace-id))]
        (ws.impl/sync-transform-dependencies! workspace (select-keys transform [:ref_id :source_type :source :target]))
        transform))))
