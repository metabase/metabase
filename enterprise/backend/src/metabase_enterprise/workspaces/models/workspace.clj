(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/batched-hydrate [:model/Workspace :databases]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (map :id workspaces))]
       (group-by :workspace_id
                 (t2/select :model/WorkspaceDatabase :workspace_id [:in ids]))))
   :id
   {:default []}))

(defn list-workspaces
  "Return every Workspace with its `:databases` hydrated."
  []
  (t2/hydrate (t2/select :model/Workspace {:order-by [[:id :asc]]}) :databases))

(defn get-workspace
  "Return the Workspace with the given id and its `:databases` hydrated, or nil if none exists."
  [id]
  (when-let [ws (t2/select-one :model/Workspace :id id)]
    (t2/hydrate ws :databases)))

(defn create-workspace!
  "Create a Workspace and its nested WorkspaceDatabase rows in a single transaction.
  Returns the created Workspace with `:databases` hydrated."
  [{:keys [name databases]}]
  (t2/with-transaction [_conn]
    (let [ws-id (t2/insert-returning-pk! :model/Workspace {:name name})]
      (when (seq databases)
        (t2/insert! :model/WorkspaceDatabase
                    (map #(assoc % :workspace_id ws-id) databases)))
      (get-workspace ws-id))))

(defn update-workspace!
  "Update a Workspace and fully replace its WorkspaceDatabase rows with the provided ones.
  Returns the updated Workspace with `:databases` hydrated."
  [id {:keys [name databases]}]
  (t2/with-transaction [_conn]
    (t2/update! :model/Workspace :id id {:name name})
    (t2/delete! :model/WorkspaceDatabase :workspace_id id)
    (when (seq databases)
      (t2/insert! :model/WorkspaceDatabase
                  (map #(assoc % :workspace_id id) databases)))
    (get-workspace id)))
