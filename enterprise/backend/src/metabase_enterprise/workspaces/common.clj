(ns metabase-enterprise.workspaces.common
  (:require
   [metabase-enterprise.workspaces.copying :as ws.copying]
   [metabase.api-keys.core :as api-key]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

(defn make-graph-from-stuff [_stuff]
  {})

(mu/defn create-workspace
  "Create workspace"
  [user-id :- pos-int?
   {:keys [name
           database_id
           stuffs]} :- [:map
                        [:name :string]
                        [:database_id {:optional true} :int]
                        [:stuffs [:map]]]]
  (let [api-key nil #_(let [key-name (format "API key for Workspace %s" name)]
                    ;; TODO remove assumption that workspace name is unique, or enforce it -- lbrdnk: later,
                    ;; in my branch I've seen failure to create the key.
                        (or (t2/select-one :model/ApiKey :name key-name)
                            (api-key/create-api-key-with-new-user! {:key-name key-name})))
        db-id   (or database_id
                    (when-let [tx-ids (:transforms stuffs)]
                      (:database (:query (t2/select-one-fn :source [:model/Transform :source] :id [:in tx-ids])))))
        ws      @(def wsx (t2/insert-returning-instance! :model/Workspace
                                                         {:name           name
                                                          :graph          (make-graph-from-stuff stuffs)
                                                          :creator_id     user-id
                                                          :database_id    db-id
                                                          :api_key_id     nil #_(:id api-key)
                                                          :execution_user nil #_(:user_id api-key)}))
        ;; mock copy tx -- no handled by the mirror-xxx code
        #_#__       (when-let [tx-id (first (:transforms stuffs))]
                      (t2/insert! :model/Transform
                                  (-> (t2/select-one :model/Transform tx-id)
                                      (dissoc :id)
                                      (dissoc :entity_id)
                                      (assoc :workspace_id (:id ws)))))

        coll    @(def collx (t2/insert-returning-instance! :model/Collection
                                                           {:name         (format "Collection for Workspace %s" name)
                                                            :workspace_id (:id ws)}))
        ;; supporting single mbql transform with a source table, stuffs format solidified yet
        transform-id (first (get stuffs #_"transforms" :transforms))
        transform (t2/select-one :model/Transform :id transform-id)
        _ (assert (not-empty transform))
        ;; following should be perfomed by the dag module
        table-id (get-in (t2/select-one :model/Transform :id 1 #_transform-id)
                         [:source :query :stages 0 :source-table])
        _ (assert (pos-int? table-id))
        table (t2/select-one :model/Table :id table-id)
        _ (assert (not-empty table))
        ;; Following should contain entites-info as per `ws.copying/mirror-entities!` args
        create-res (ws.copying/mirror-entities! ws
                                                {:transforms [transform]
                                                 :inputs [table]})
        ;; Question is what specifically we want to be adding to return of this fn
        ;; for now the single new transforms id
        ;;
        ;; not needed now
        new-transform-id (get-in create-res [:transforms 0 :mirror :transform :id])]
    ;; TODO (Sanya 2025-11-18) - not sure how to transfer this api key to agent
    #_(log/infof "Generated API key for workspace: %s" (u.secret/expose (:unmasked_key api-key)))
    (t2/update! :model/Workspace (:id ws) {:collection_id (:id coll)})
    (assoc ws
           :collection_id (:id coll)
           ;; not needed -- handled by workspace_id on fe
           #_#_:demo_transform_id new-transform-id)))

(comment
  (def duped-trans-id 1)

  (try (create-workspace
        1 ;; that's me
        {:name "the best workspace"
                     ;; hardcoded test-data on pg
         :database_id 2
         :stuffs {:transforms [duped-trans-id]}})
       (catch Throwable e
         (def eee e)
         (throw e)))

  ;; to destroy
  (def destr teeest)
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