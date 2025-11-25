(ns metabase-enterprise.workspaces.common
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.mirroring :as ws.mirroring]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :as api]
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

;; TODO (Chris 2025-11-20) Just subsume the rest of this up into ws.dag/path-induced-subgraph
(defn- build-graph
  "Thin wrapper around the dag module, that should probably be absorbed by it."
  [upstream]
  (if (not-any? seq (vals upstream))
    {:db_id      nil
     :transforms []
     :inputs     []
     :outputs    []}
    (let [graph        (ws.dag/path-induced-subgraph upstream)
          db-ids       (when-let [table-ids (seq (keep :id (concat (:inputs graph) (:outputs graph))))]
                         (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))
          _            (assert (= 1 (count db-ids)) "All inputs and outputs must belong to the same database.")]
      ;; One reason this is here, is that I don't want the DAG module to have the single-DWH assumption.
      (assoc graph :db_id (first db-ids)))))

;; TODO: Generate new metabase user for the workspace
;; TODO: Should we move this to model as per the diagram?
(defn- create-workspace-container!
  "Create the workspace and its related collection, user, and api key."
  [creator-id database-id workspace-name]
  ;; TODO (Chris 2025-11-19) Unsure API key name is unique, and remove this (insecure) workaround.
  (let [api-key (let [key-name (format "API key for Workspace %s" workspace-name)]
                  (or (t2/select-one :model/ApiKey :name key-name)
                      (api-key/create-api-key-with-new-user! {:key-name key-name})))
        ;; TODO (Chris 2025-11-19) Associate the api-key user with the workspace as well.
        ws      (t2/insert-returning-instance! :model/Workspace
                                               {:name           workspace-name
                                                :creator_id     creator-id
                                                :database_id    database-id
                                                :api_key_id     (:id api-key)
                                                :execution_user (:user_id api-key)})
        coll    (t2/insert-returning-instance! :model/Collection
                                               {:name         (format "Collection for Workspace %s" workspace-name)
                                                :namespace    "workspace"
                                                :workspace_id (:id ws)})
        ws      (assoc ws :collection_id (:id coll))]
    ;; Set the backlink from the workspace to the collection inside it.
    (t2/update! :model/Workspace (:id ws) {:collection_id (:id coll)})
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

;; TODO (Chris 2025-11-20) We have not added a uniqueness constraint to the db, we should either do that, or remove
;;                         the whole retry song and dance.
(defn- create-workspace-with-unique-name!
  "Create a workspace, retrying with a new unique name if there's a constraint violation."
  [creator-id db-id database ws-name graph max-retries]
  (loop [attempt 1]
    (let [unique-name (generate-unique-workspace-name ws-name)
          result      (try
                        {:workspace (create-workspace-container! creator-id db-id unique-name)}
                        (catch Exception e
                          (if (and (< attempt max-retries) (unique-constraint-violation? e))
                            {:retry true}
                            (throw e))))]
      (if (:retry result)
        (recur (inc attempt))
        (let [workspace (:workspace result)]
          (ws.isolation/ensure-database-isolation! workspace database)
          (let [graph (ws.mirroring/mirror-entities! workspace database graph)]
            (t2/update! :model/Workspace {:id (:id workspace)} {:graph graph})
            (assoc workspace :graph graph)))))))

;; TODO internal: test!
(defn create-workspace!
  "Create workspace"
  [creator-id {ws-name-maybe :name
               maybe-db-id   :database_id
               upstream      :upstream}]
  ;; TODO put this in the malli schema for a request
  (assert (or maybe-db-id (some seq (vals upstream))) "Must provide a database_id unless initial entities are given.")
  (let [ws-name (or ws-name-maybe (str (random-uuid)))
        graph    (build-graph upstream)
        db-id    (or (:db_id graph) maybe-db-id)
        _        (when (and maybe-db-id (:db_id graph))
                   (assert (= maybe-db-id (:db_id graph))
                           "The database_id provided must match that of the upstream entities."))
        _        (assert db-id "Was not given and could not infer a database_id for the workspace.")
        database (api/check-500 (t2/select-one :model/Database :id db-id))]
    (create-workspace-with-unique-name! creator-id db-id database ws-name graph 5)))

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
