(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::status
  [:enum :unprovisioned :provisioning :provisioned :deprovisioning])

(mr/def ::workspace-database.insert
  [:map {:closed true}
   [:workspace_id     ms/PositiveInt]
   [:database_id      ::lib.schema.id/database]
   [:input_schemas    [:sequential :string]]
   [:database_details ms/DatabaseDetails]
   [:output_namespace :string]
   [:status           {:optional true} ::status]])

;;; ------------------------------------------------- Database -------------------------------------------------

(mu/defn database-id->database
  "Map of id to Database for the ids in `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select-pk->fn identity :model/Database :id [:in database-ids]))

(mu/defn active-table-schemas
  "The set of schemas of the active Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-fn-set :schema :model/Table :db_id database-id :active true))

;;; ------------------------------------------------- Workspace ------------------------------------------------

(mu/defn workspace
  "The Workspace with `workspace-id`, or nil."
  [workspace-id :- ms/PositiveInt]
  (t2/select-one :model/Workspace :id workspace-id))

(mu/defn workspace-by-name
  "The lowest-id Workspace named `workspace-name`, or nil."
  [workspace-name :- :string]
  (t2/select-one :model/Workspace :name workspace-name {:order-by [[:id :asc]]}))

(mu/defn workspaces
  "Every Workspace, ordered by id."
  []
  (t2/select :model/Workspace {:order-by [[:id :asc]]}))

(mu/defn insert-workspace!
  "Insert a Workspace and return its id."
  [workspace-name :- :string
   creator-id     :- [:maybe ::lib.schema.id/user]]
  (t2/insert-returning-pk! :model/Workspace {:name workspace-name :creator_id creator-id}))

(mu/defn update-workspace-name!
  "Rename the Workspace with `workspace-id`."
  [workspace-id   :- ms/PositiveInt
   workspace-name :- :string]
  (t2/update! :model/Workspace :id workspace-id {:name workspace-name}))

(mu/defn delete-workspace!
  "Delete the Workspace with `workspace-id`."
  [workspace-id :- ms/PositiveInt]
  (t2/delete! :model/Workspace :id workspace-id))

(mu/defn creators
  "The Users with ids in `user-ids`, with the columns a Workspace's `:creator` exposes."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select [:model/User :id :first_name :last_name :email :common_name] :id [:in user-ids]))

;;; --------------------------------------------- WorkspaceDatabase --------------------------------------------

(mu/defn workspace-databases
  "The WorkspaceDatabases of the Workspace with `workspace-id`."
  [workspace-id :- ms/PositiveInt]
  (t2/select :model/WorkspaceDatabase :workspace_id workspace-id))

(mu/defn workspace-databases-of-workspaces
  "The WorkspaceDatabases of the Workspaces with ids in `workspace-ids`."
  [workspace-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/WorkspaceDatabase :workspace_id [:in workspace-ids]))

(mu/defn insert-workspace-databases!
  "Insert `rows`."
  [rows :- [:sequential ::workspace-database.insert]]
  (t2/insert! :model/WorkspaceDatabase rows))

(mu/defn delete-workspace-databases!
  "Delete the WorkspaceDatabases with ids in `workspace-database-ids`."
  [workspace-database-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/WorkspaceDatabase :id [:in workspace-database-ids]))

(mu/defn workspace-has-active-databases?
  "Whether the Workspace with `workspace-id` has a WorkspaceDatabase that is not `:unprovisioned`."
  [workspace-id :- ms/PositiveInt]
  (t2/exists? :model/WorkspaceDatabase :workspace_id workspace-id :status [:not= :unprovisioned]))

(mu/defn database-has-active-workspace-databases?
  "Whether the Database with `database-id` has a WorkspaceDatabase that is not `:unprovisioned`."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/WorkspaceDatabase :database_id database-id :status [:not= :unprovisioned]))

(mu/defn delete-unprovisioned-workspace-databases-of-database!
  "Delete the `:unprovisioned` WorkspaceDatabases of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/WorkspaceDatabase :database_id database-id :status :unprovisioned))

;;; ---------------------------------------------- TableRemapping ----------------------------------------------

(mu/defn table-remappings
  "Every TableRemapping, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

(mu/defn delete-all-table-remappings!
  "Delete every TableRemapping."
  []
  (t2/delete! :model/TableRemapping))
