(ns metabase-enterprise.workspaces.common
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.mirroring :as ws.mirroring]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :as api]
   [toucan2.core :as t2]))

(defn- unique-workspace-name
  "Generate a unique workspace name by appending (N) if the name already exists."
  [base-name]
  (if-not (t2/exists? :model/Workspace :name base-name)
    base-name
    (let [;; Strip existing (N) suffix if present
          stripped-name (str/replace base-name #"\s*\(\d+\)$" "")
          ;; Find all existing workspaces with this base name pattern
          existing      (t2/select-fn-set :name :model/Workspace
                                          :name [:like (str stripped-name " (%")])
          ;; Extract numbers from existing names
          numbers       (keep (fn [name]
                                (when-let [[_ n] (re-find #"\((\d+)\)$" name)]
                                  (parse-long n)))
                              existing)
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

;; TODO internal: test!
(defn create-workspace!
  "Create workspace"
  [creator-id {ws-name     :name
               maybe-db-id :database_id
               upstream    :upstream}]
  ;; TODO put this in the malli schema for a request
  (assert (or maybe-db-id (some seq (vals upstream))) "Must provide a database_id unless initial entities are given.")
  (let [graph          (build-graph upstream)
        inferred-db-id (:db_id graph)
        _              (when (and maybe-db-id inferred-db-id)
                         (assert (= maybe-db-id inferred-db-id)
                                 "The database_id provided must match that of the upstream entities."))
        db-id          (or inferred-db-id maybe-db-id)
        _              (assert db-id "Was not given and could not infer a database_id for the workspace.")
        database       (api/check-500 (t2/select-one :model/Database :id db-id))
        unique-name    (unique-workspace-name ws-name)
        workspace      (create-workspace-container! creator-id db-id unique-name)
        ;; Creates the new schema database schema
        _              (ws.isolation/ensure-database-isolation! workspace database)
        graph          (ws.mirroring/mirror-entities! workspace database graph)
        _              (t2/update! :model/Workspace {:id (:id workspace)} {:graph graph})
        workspace      (assoc workspace :graph graph)]
    workspace))

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
