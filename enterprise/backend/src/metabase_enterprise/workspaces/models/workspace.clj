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

(defn- with-workspace-database-defaults
  "Fill server-managed columns that are NOT NULL in the DB with their defaults when callers omit them."
  [wsd workspace-id]
  (merge {:database_details {}
          :output_schema    ""}
         wsd
         {:workspace_id workspace-id}))

(defn create-workspace!
  "Create a Workspace and its nested WorkspaceDatabase rows in a single transaction.
  Returns the created Workspace with `:databases` hydrated."
  [{:keys [name databases]}]
  (t2/with-transaction [_conn]
    (let [ws-id (t2/insert-returning-pk! :model/Workspace {:name name})]
      (when (seq databases)
        (t2/insert! :model/WorkspaceDatabase
                    (map #(with-workspace-database-defaults % ws-id) databases)))
      (get-workspace ws-id))))

(defn- reject-initialized-modification!
  "Throw a 409 if any `:initialized` row in `existing` is missing from the incoming
  `:databases` list or would have its `:input_schemas` changed. Initialized rows
  are immutable via the API-facing update path."
  [existing-initialized incoming-by-db-id]
  (doseq [{:keys [database_id input_schemas]} existing-initialized]
    (let [incoming (get incoming-by-db-id database_id)]
      (when (or (nil? incoming)
                (not= (vec input_schemas) (vec (:input_schemas incoming))))
        (throw (ex-info "Cannot modify an initialized workspace_database"
                        {:status-code 409
                         :database_id database_id}))))))

(defn update-workspace!
  "Update a Workspace and reconcile its `WorkspaceDatabase` rows with the provided
  list. `:initialized` rows are immutable: the incoming list must preserve each
  one by `database_id` with matching `:input_schemas`, or a 409 is raised.
  Uninitialized rows are fully replaced by the incoming list."
  [id {:keys [name databases]}]
  (t2/with-transaction [_conn]
    (let [existing         (t2/select :model/WorkspaceDatabase :workspace_id id)
          initialized      (filter #(= :initialized (:status %)) existing)
          uninitialized    (remove #(= :initialized (:status %)) existing)
          incoming-by-db-id (into {} (map (juxt :database_id identity)) databases)
          preserved-db-ids (set (map :database_id initialized))]
      (reject-initialized-modification! initialized incoming-by-db-id)
      (t2/update! :model/Workspace :id id {:name name})
      (when-let [to-delete-ids (seq (map :id uninitialized))]
        (t2/delete! :model/WorkspaceDatabase :id [:in to-delete-ids]))
      (when-let [to-insert (seq (remove #(contains? preserved-db-ids (:database_id %)) databases))]
        (t2/insert! :model/WorkspaceDatabase
                    (map #(with-workspace-database-defaults % id) to-insert)))
      (get-workspace id))))
