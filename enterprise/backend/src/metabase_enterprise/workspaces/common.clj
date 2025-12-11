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
        schema  (ws.u/isolation-namespace-name ws)
        ws      (assoc ws
                       :collection_id (:id coll)
                       :schema schema)]
    ;; Set the backlink from the workspace to the collection inside it and set the schema.
    (t2/update! :model/Workspace (:id ws) {:collection_id (:id coll)
                                           :schema schema})
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
  "Background job: runs isolation, mirroring, grants. Updates status to :ready when done."
  [{ws-id :id :as workspace} database]
  (ws.log/track! ws-id :workspace-setup
    (let [{:keys [_database_details]} (ws.log/track! ws-id :database-isolation
                                        (-> (ws.isolation/ensure-database-isolation! workspace database)
                                           ;; it actually returns just those, this is more like a doc than behavior
                                            (select-keys [:schema :database_details])
                                            (u/prog1 (t2/update! :model/Workspace ws-id <>))))
          ;; TODO analyze graph. in the
          {:keys [inputs]}           {}]
      (when-let [table-ids (seq (keep #(when (= :table (:type %)) (:id %)) inputs))]
        (ws.log/track! ws-id :grant-read-access
          (let [input-tables (t2/select :model/Table :id [:in table-ids])]
            (ws.isolation/grant-read-access-to-tables! database workspace input-tables)))))
    (t2/update! :model/Workspace ws-id {:status :ready})))

(defn- create-workspace-with-unique-name!
  "Create a workspace with status=updating, then kick off async setup."
  [creator-id database ws-name max-retries]
  (loop [attempt 1]
    (let [unique-name         (generate-unique-workspace-name ws-name)
          {:keys [retry
                  workspace]} (try
                                {:workspace (create-workspace-container! creator-id (:id database) unique-name :pending)}
                                (catch Exception e
                                  (if (and (< attempt max-retries) (unique-constraint-violation? e))
                                    {:retry true}
                                    (throw e))))]
      (if retry
        (recur (inc attempt))
        (do
          (quick-task/submit-task! #(run-workspace-setup! workspace database))
          workspace)))))

;; TODO internal: test!
(defn create-workspace!
  "Create workspace"
  [creator-id {ws-name-maybe :name
               db-id         :database_id}]
  (let [ws-name  (or ws-name-maybe (str (random-uuid)))
        database (t2/select-one :model/Database :id db-id)]
    (create-workspace-with-unique-name! creator-id database ws-name 5)))

(defn add-to-changeset!
  "Add the given transform to the workspace changeset."
  [_creator-id workspace entity-type global-id body]
  (ws.u/assert-transform! entity-type)
  (t2/with-transaction [_]
    (let [workspace-id    (:id workspace)
          workspace-db-id (:database_id workspace)
          body            (assoc-in body [:target :database] workspace-db-id)
          transform       (t2/insert-returning-instance!
                           :model/WorkspaceTransform
                           (assoc (select-keys body [:name :description :source :target])
                                  ;; TODO add this to workspace_transform, or implicitly use the id of the user that does the merge?
                                  ;:creator_id creator-id
                                  :global_id global-id
                                  :workspace_id workspace-id))]
      (ws.impl/sync-transform-dependencies! workspace transform)
      transform)))

(defn- mirror-table-to-delete-where
  [database-id targets]
  (let [s+t (mapv (fn [[schema name]]
                    [:and
                     [:= [:inline schema] :schema]
                     [:= [:inline name] :name]])
                  targets)]
    (into [:and
           [:= [:inline database-id] :db_id]
           (into [:or] s+t)])))

(defn remove-entities!
  "Remove multiple entities from the workspace."
  [workspace entities]
  ;; count does not have to be 1
  (assert (= 1 (count entities))
          "Single kv")
  (assert (= :transforms (-> entities keys first))
          "For transforms")
  (assert (every? pos-int? (:transforms entities))
          "With seq of ids")

  ;; drop transform, drop its target table, no checking of dependencies
  (let [mirror-transforms-ids (set (:transforms entities))
        mirror-transforms-data (t2/select :model/Transform :id [:in mirror-transforms-ids])
        database (t2/select-one :model/Database :id (:database_id workspace))
        targets (mapv (fn [{:keys [target]}]
                        (assert (= "table" (:type target)))
                        [(:schema target) (:name target)])
                      mirror-transforms-data)
        _ (assert (< 0 (count targets)))
        tables-where-clause (mirror-table-to-delete-where (:database_id workspace) targets)
        tables-data (t2/select :model/Table {:where tables-where-clause})
        tables-ids (into #{} (map :id) tables-data)]
    (assert (every? pos-int? tables-ids))
    (when (seq targets)
      (ws.isolation/drop-isolated-tables! database targets))
    (when (seq tables-ids)
      (t2/delete! :model/Table :id [:in tables-ids]))
    (when (seq mirror-transforms-ids)
      (t2/delete! :model/Transform :id [:in mirror-transforms-ids]))))

#_:clj-kondo/ignore
(comment
  (defn- clean-up-ws!* [& [ws-id]]
    ;; Pass nil to clean up all workspaces
    (let [ws-clause (or ws-id [:not= nil])]
      (t2/delete! :model/Collection :workspace_id ws-clause)
      (t2/delete! :model/Transform :workspace_id ws-clause)
      (doseq [[db_id schema] (t2/select-fn-set (juxt :db_id :schema) :model/Table :workspace_id [:not= nil])]
        (t2/delete! :model/Table :schema schema)
        (let [db        (t2/select-one :model/Database db_id)
              driver    (metabase.driver.util/database->driver db)
              make-spec (requiring-resolve 'metabase.driver.sql-jdbc.connection/connection-details->spec)
              jdbc-spec (make-spec driver (:details db))]
          (clojure.java.jdbc/execute! jdbc-spec [(str "DROP SCHEMA \"" schema "\" CASCADE")])))
      (t2/delete! :model/Workspace :id ws-clause)))

  (def upstream-id (t2/select-one-pk :model/Transform :workspace_id nil {:order-by [:id]}))
  (def upstream-ids (t2/select-pks-vec :model/Transform :workspace_id nil {:order-by [:id]}))

  ;; Ensure output table exists
  (#'metabase-enterprise.transforms.execute/run-mbql-transform! (t2/select-one :model/Transform upstream-id))

  (let [admin-id (t2/select-one-pk :model/User :is_superuser true {:order-by [:id]})]
    (binding [api/*current-user-id* admin-id]
      (create-workspace! admin-id {:name "Workplace Workspace", :upstream {:transforms upstream-ids #_[upstream-id]}})))

  (clean-up-ws!*))
