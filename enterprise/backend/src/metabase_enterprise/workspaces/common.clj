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
                        [:database_id :int]
                        [:stuffs [:map]]]]
  (let [api-key (api-key/create-api-key-with-new-user!
                 {:key-name (format "API key for Workspace %s" name)})
        ws      (t2/insert-returning-instance! :model/Workspace
                                               {:name           name
                                                :graph          (make-graph-from-stuff stuffs)
                                                :creator_id     user-id
                                                :database_id    database_id
                                                :api_key_id     (:id api-key)
                                                :execution_user (:user_id api-key)})
        coll    (t2/insert-returning-instance! :model/Collection
                                               {:name         (format "Collection for Workspace %s" name)
                                                :namespace    :workspaces
                                                :workspace_id (:id ws)})]
    ;; TODO (Sanya 2025-11-18) - not sure how to transfer this api key to agent
    (log/infof "Generated API key for workspace: %s" (u.secret/expose (:unmasked_key api-key)))
    (t2/update! :model/Workspace (:id ws) {:collection_id (:id coll)})
    (assoc ws :collection_id (:id coll))))
