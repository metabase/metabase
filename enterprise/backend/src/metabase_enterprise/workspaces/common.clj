(ns metabase-enterprise.workspaces.common
  (:require
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
  (let [api-key (let [key-name (format "API key for Workspace %s" name)]
                  ;; TODO remove assumption that workspace name is unique, or enforce it
                  (or (t2/select-one :model/ApiKey :name key-name)
                      (api-key/create-api-key-with-new-user! {:key-name key-name})))
        db-id   (or database_id
                    (when-let [tx-ids (:transforms stuffs)]
                      (:database (:query (t2/select-one-fn :source [:model/Transform :source] :id [:in tx-ids])))))
        ws      (t2/insert-returning-instance! :model/Workspace
                                               {:name           name
                                                :graph          (make-graph-from-stuff stuffs)
                                                :creator_id     user-id
                                                :database_id    db-id
                                                :api_key_id     (:id api-key)
                                                :execution_user (:user_id api-key)})
        coll    (t2/insert-returning-instance! :model/Collection
                                               {:name         (format "Collection for Workspace %s" name)
                                                :workspace_id (:id ws)})]
    ;; TODO (Sanya 2025-11-18) - not sure how to transfer this api key to agent
    #_(log/infof "Generated API key for workspace: %s" (u.secret/expose (:unmasked_key api-key)))
    (t2/update! :model/Workspace (:id ws) {:collection_id (:id coll)})
    (assoc ws :database_id db-id :collection_id (:id coll))))
