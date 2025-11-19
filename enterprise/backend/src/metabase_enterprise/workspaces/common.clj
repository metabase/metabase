(ns metabase-enterprise.workspaces.common
  (:require
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.mirroring :as ws.mirroring]
   [metabase.api-keys.core :as api-key]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

;; TODO: Delete when we have start using dag.
#_(defn- make-graph-from-stuff [_stuff]
    {})

#_{:clj-kondo/ignore [:unused-private-var]}
(defn- dummy-dag-add-mirrored-entities
  [x]
  x)

(defn- dummy-dag-single-transform->entities-info
  [stuffs]
  (let [transform-id (first (get stuffs :transforms))
        transform (t2/select-one :model/Transform :id transform-id)
        _ (assert (not-empty transform))
        table-id (get-in (t2/select-one :model/Transform :id 1 #_transform-id)
                         [:source :query :stages 0 :source-table])
        _ (assert (pos-int? table-id))
        table (t2/select-one :model/Table :id table-id)
        _ (assert (not-empty table))]
    {:transforms [transform]
     :inputs [table]}))

;; TODO: Generate new metabase user for the workspace
;; TODO: Should we move this to model as per the diagram?
(defn- create-resources
  [user-id database-id workspace-name]
  (let [api-key (api-key/create-api-key-with-new-user!
                 {:key-name (format "API key for Workspace %s" workspace-name)})

        ws      (t2/insert-returning-instance! :model/Workspace
                                               {:name           workspace-name
                                                ;; graph should be added when we have it from `dag` ns and 
                                                ;; adjusted with duplicated entites from `mirroring` ns
                                                #_#_:graph          (make-graph-from-stuff stuffs)
                                                :creator_id     user-id
                                                :database_id    database-id
                                                :api_key_id     (:id api-key)
                                                :execution_user (:user_id api-key)})
        coll    (t2/insert-returning-instance! :model/Collection
                                               {:name         (format "Collection for Workspace %s" workspace-name)
                                                :workspace_id (:id ws)})]
      ;; TODO (Sanya 2025-11-18) - not sure how to transfer this api key to agent
    (log/infof "Generated API key for workspace: %s" (u.secret/expose (:unmasked_key api-key)))
    {:workspace ws
     :collection coll}))

;; TODO internal: test!
(mu/defn create-workspace
  "Create workspace"
  [user-id :- pos-int?
   {:keys [name
           database_id
           stuffs]} :- [:map
                        [:name :string]
                        [:database_id :int]
                        [:stuffs [:map]]]]
  ;; Right now we support single transform
  (assert (= 1 (count (:transforms stuffs))))
  (let [database-id (or database_id
                        (when-let [tx-ids (:transforms stuffs)]
                          (:database (:query (t2/select-one-fn :source [:model/Transform :source] :id [:in tx-ids])))))

        database (t2/select-one :model/Database :id database-id)

        {:keys [workspace
                collection]}
        (create-resources user-id database-id name)

        _ #_:clj-kondo/ignore (def wsx workspace)
        _ #_:clj-kondo/ignore (def collx collection)

        entities-info (dummy-dag-single-transform->entities-info stuffs)

        ;; Creates the new schema database schema
        _ (ws.isolation/ensure-database-isolation! workspace database)

        ;; At the moment we don't need that, but will be useful for decoration of the dag
        ;; with mirrored entiies.
        ;; TODO: divide the following into:
        ;; - create-tables,
        ;; - copy entities.
        _entities-info-with-mirrors (ws.mirroring/mirror-entities! workspace entities-info)]
    (t2/update! :model/Workspace (:id workspace)
                {:collection_id (:id collection)
                 #_#_:graph (dummy-dag-add-mirrored-entities _entities-info-with-mirrors)})
    ;; TBD what this should return.
    (assoc workspace :collection_id (:id collection))))

#_:clj-kondo/ignore
(comment
  (def duped-trans-id 1)

  (try (create-workspace
        1 ;; that's me
        {:name "the best workspace"
         :database_id 2 ;; hardcoded test-data on pg
         :stuffs {:transforms [duped-trans-id]}})
       (catch Throwable e
         (def eee e)
         (throw e)))

  (let [db (t2/select-one :model/Database :id 2) ;; pg test data
        driver (metabase.driver.util/database->driver db)
        jdbc-spec ((requiring-resolve 'metabase.driver.sql-jdbc.connection/connection-details->spec)
                   driver
                   (:details db))
        coll-id (:id collx)
        ws-id (:id wsx)]
    (t2/delete! :model/Collection :id coll-id)
    (t2/delete! :model/Transform :id [:> 1])
    (t2/delete! :model/Workspace :id ws-id)
    (t2/delete! :model/Table :schema (str "mb__isolation_ff4a5_" ws-id))
    (clojure.java.jdbc/execute! jdbc-spec [(str "DROP SCHEMA \"mb__isolation_ff4a5_" ws-id "\" CASCADE")])))
