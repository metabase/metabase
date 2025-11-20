(ns metabase-enterprise.workspaces.common
  (:require
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.mirroring :as ws.mirroring]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :as api]
   [toucan2.core :as t2]))

(defn- temp-assert-single-transform!
  "A temporary restriction, until we have graph analysis merged."
  [upstream-entities]
  (assert (and (= 1 (count (keys upstream-entities)))
               (= 1 (count (:transforms upstream-entities))))
          "The only contents of the workspace must be a single transform."))

(defn- build-graph
  "Placeholder for our actual dag module, handling at most 1 transform, and not returning all the analysis."
  [upstream]
  (if (not-any? seq (vals upstream))
    {:db_id      nil
     :transforms []
     :inputs     []}
    (do
      (temp-assert-single-transform! upstream)
      (let [transform-id (first (get upstream :transforms))
            ;; NOte: we only support MBQL transforms for now
            transform    (t2/select-one [:model/Transform :id :name :source :target] :id transform-id)
            _            (assert (not-empty transform))
            ;; Note: if there are additional tables being joined, we are not picking them up @_@
            source-id    (get-in transform [:source :query :stages 0 :source-table])
            _            (assert (pos-int? source-id))
            source-table (t2/select-one [:model/Table :id :schema :name] :id source-id)
            _            (assert (not-empty source-table))
            output-table (let [{:keys [schema name]} (:target transform)]
                           ;; TODO (Chris 2025-11-19) Relax downstream assumption that upstream-tx output table exists
                           {:id     (t2/select-one-pk :model/Table :schema schema :name name)
                            :schema schema
                            :name   name})
            db-ids       (vec (sort (distinct (filter pos-int? [(-> transform :source :query :database) (:db_id source-table)]))))
            _            (assert (= 1 (count db-ids)) "All inputs and outputs must belong to the same database.")]
        ;; Graph is based on this.
        ;; https://metaboat.slack.com/archives/C099RKNLP6U/p1763470366995789?thread_ts=1763462819.139739&cid=C099RKNLP6U
        ;; "tables" was renamed to "outputs", to perhaps make it clearer that they are not the input tables.
        {:db_id      (first db-ids)
         :transforms [(select-keys transform [:id :name])]
         :inputs     [source-table]
         :outputs    [output-table]}))))

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
  (temp-assert-single-transform! upstream)
  (let [graph          (build-graph upstream)
        inferred-db-id (:db_id graph)
        _              (when (and maybe-db-id inferred-db-id)
                         (assert (= maybe-db-id inferred-db-id)
                                 "The database_id provided must match that of the upstream entities."))
        db-id          (or inferred-db-id maybe-db-id)
        _              (assert db-id "Was not given and could not infer a database_id for the workspace.")
        database       (api/check-500 (t2/select-one :model/Database :id db-id))
        workspace      (create-workspace-container! creator-id db-id ws-name)
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
              jdbc-spec ((requiring-resolve 'metabase.driver.sql-jdbc.connection/connection-details->spec)
                         driver
                         (:details db))]
          (clojure.java.jdbc/execute! jdbc-spec [(str "DROP SCHEMA \"" schema "\" CASCADE")])))
      (t2/delete! :model/Workspace :id ws-clause)))

  (def upstream-tx-id (t2/select-one-pk :model/Transform :workspace_id nil {:order-by [:id]}))
  (def admin-id (t2/select-one-pk :model/User :is_superuser true {:order-by [:id]}))

  ;; Ensure output table exists
  (#'metabase-enterprise.transforms.execute/run-mbql-transform! (t2/select-one :model/Transform upstream-tx-id))

  (binding [api/*current-user-id* admin-id]
    (create-workspace! admin-id {:name "Workplace Workspace", :upstream {:transforms [upstream-tx-id]}}))

  (clean-up-ws!*))
