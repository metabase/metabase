(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::status-table
  [:enum :workspace_database :workspace_schema])

(mr/def ::staleness
  "When a row of a status table reads as failed: its status is one of `:in-flight` and it was last updated more than
  `:minutes` ago by the app DB's clock, the clock that wrote `updated_at`."
  [:map {:closed true}
   [:in-flight [:set {:min 1} :keyword]]
   [:minutes   ms/PositiveInt]])

(defn- stale-cutoff
  [minutes]
  (h2x/add-interval-honeysql-form (mdb/db-type) (mi/now) (- minutes) :minute))

(defn- stale-column
  "`:stale`, 1 when the row reads as failed by `staleness` and 0 otherwise."
  [{:keys [in-flight minutes]}]
  [[:case
    [:and [:in :status (mapv name in-flight)] [:< :updated_at (stale-cutoff minutes)]] [:inline 1]
    :else [:inline 0]]
   :stale])

(defn- workspace-database-columns
  "Every `workspace_database` column but `database_details`, which holds the workspace user's password, and
  `lock_token`, plus the `:stale` flag."
  [staleness]
  [:model/WorkspaceDatabase :id :workspace_id :database_id :isolation_id :status :created_at :updated_at
   (stale-column staleness)])

(defn- workspace-schema-columns
  "Every `workspace_schema` column but `lock_token`, plus the `:stale` flag."
  [staleness]
  [:model/WorkspaceSchema :id :workspace_database_id :main_schema :scratch_namespace :status :error :created_at
   :updated_at (stale-column staleness)])

;;; ------------------------------------------------- Database -------------------------------------------------

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id [:auto/param database-id]))

(mu/defn databases
  "`:id`, `:name` and `:engine` of the Databases with ids in `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select [:model/Database :id :name :engine] :id [:in database-ids]))

;;; --------------------------------------------------- User ---------------------------------------------------

(mu/defn users
  "`:id`, `:email`, `:first_name`, `:last_name` and `:common_name` of the Users with ids in `user-ids`."
  [user-ids :- [:sequential ms/PositiveInt]]
  (t2/select [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

;;; ------------------------------------------------- Workspace ------------------------------------------------

(mu/defn insert-workspace!
  "Insert a Workspace and return its id."
  [workspace-name :- ms/NonBlankString
   creator-id     :- [:maybe ms/PositiveInt]]
  (t2/insert-returning-pk! :model/Workspace {:name workspace-name, :creator_id creator-id}))

(mu/defn workspaces-page
  "Up to `limit` Workspaces, or all of them when `limit` is nil, after skipping `offset`, in id order."
  [limit  :- [:maybe ms/PositiveInt]
   offset :- ms/IntGreaterThanOrEqualToZero]
  (t2/select :model/Workspace (cond-> {:order-by [[:id :asc]]
                                       :offset   offset}
                                limit (assoc :limit limit))))

(mu/defn workspace
  "The Workspace with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Workspace :id [:auto/param id]))

(mu/defn rename-workspace!
  "Set the name of the Workspace with `id`, returning the number of rows updated."
  [id             :- ms/PositiveInt
   workspace-name :- ms/NonBlankString]
  (t2/update! :model/Workspace :id [:auto/param id] {:name workspace-name}))

(mu/defn delete-workspace!
  "Delete the Workspace with `id`, and with it its WorkspaceDatabases and WorkspaceSchemas, returning the number of
  Workspaces deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Workspace :id [:auto/param id]))

(mu/defn workspace-count
  "The number of Workspaces."
  []
  (t2/count :model/Workspace))

;;; --------------------------------------------- Workspace database ----------------------------------------------

(mu/defn insert-workspace-database!
  "Insert a WorkspaceDatabase and return it."
  [row :- [:map {:closed true}
           [:workspace_id     ms/PositiveInt]
           [:database_id      ::lib.schema.id/database]
           [:isolation_id     :string]
           [:database_details ms/DatabaseDetails]
           [:status           :keyword]
           [:lock_token       :string]]]
  (t2/insert-returning-instance! :model/WorkspaceDatabase row))

(mu/defn workspace-database
  "The WorkspaceDatabase with `id`, `:database_details` included, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/WorkspaceDatabase :id [:auto/param id]))

(mu/defn workspace-database-without-details
  "The WorkspaceDatabase with `id` without its `:database_details` or `:lock_token`, with `:stale` by `staleness`,
  or nil."
  [id        :- ms/PositiveInt
   staleness :- ::staleness]
  (t2/select-one (workspace-database-columns staleness) :id [:auto/param id]))

(mu/defn workspace-databases-of-workspaces
  "The WorkspaceDatabases of the Workspaces with ids in `workspace-ids`, without their `:database_details` or
  `:lock_token`, with `:stale` by `staleness`, in id order."
  [workspace-ids :- [:sequential ms/PositiveInt]
   staleness     :- ::staleness]
  (t2/select (workspace-database-columns staleness) :workspace_id [:in workspace-ids] {:order-by [[:id :asc]]}))

(mu/defn delete-workspace-database!
  "Delete the WorkspaceDatabase with `id`, and with it its WorkspaceSchemas, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/WorkspaceDatabase :id [:auto/param id]))

(mu/defn take-status!
  "Set the status of the row of `table` with `id` to `to` and its lock token to `new-token`, but only while its status
  is one of `from`, or one of `stale-from` last updated more than `stale-minutes` ago by the app DB's clock. Returns
  the number of rows updated, 0 or 1. One UPDATE statement, so of two concurrent callers only one updates the row."
  [table         :- ::status-table
   id            :- ms/PositiveInt
   from          :- [:set {:min 1} :keyword]
   stale-from    :- [:set :keyword]
   stale-minutes :- ms/PositiveInt
   to            :- :keyword
   new-token     :- :string]
  ;; A raw UPDATE rather than t2/update! on the model: Toucan's before-update hook selects the matching rows first
  ;; and this must stay a single statement.
  (t2/query-one {:update table
                 :set    {:status [:auto/param (name to)], :lock_token [:auto/param new-token], :updated_at (mi/now)}
                 :where  [:and
                          [:= :id [:auto/param id]]
                          [:or
                           [:in :status (mapv name from)]
                           ;; Toucan compiles an empty `stale-from` to false
                           [:and
                            [:in :status (mapv name stale-from)]
                            [:< :updated_at (stale-cutoff stale-minutes)]]]]}))

(mu/defn change-status!
  "Set the status of the row of `table` with `id` to `to` and its lock token to `new-token`, but only while its status
  is one of `from` and its lock token is `token`. Returns the number of rows updated, 0 or 1."
  [table     :- ::status-table
   id        :- ms/PositiveInt
   token     :- :string
   from      :- [:set {:min 1} :keyword]
   to        :- :keyword
   new-token :- :string]
  (t2/query-one {:update table
                 :set    {:status [:auto/param (name to)], :lock_token [:auto/param new-token], :updated_at (mi/now)}
                 :where  [:and
                          [:= :id [:auto/param id]]
                          [:= :lock_token [:auto/param token]]
                          [:in :status (mapv name from)]]}))

(mu/defn touch-lock!
  "Set `updated_at` of the row of `table` with `id` to now while its lock token is `token`. Returns the number of rows
  updated, 0 or 1."
  [table :- ::status-table
   id    :- ms/PositiveInt
   token :- :string]
  (t2/query-one {:update table
                 :set    {:updated_at (mi/now)}
                 :where  [:and
                          [:= :id [:auto/param id]]
                          [:= :lock_token [:auto/param token]]]}))

(mu/defn live-workspaces-of-database
  "`:id` and `:name` of every Workspace with a WorkspaceDatabase on the Database with `database-id`, in id order."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Workspace :id :name]
             {:where    [:in :id ^:allow-subquery {:select [:workspace_id]
                                                   :from   [:workspace_database]
                                                   :where  [:= :database_id [:auto/param database-id]]}]
              :order-by [[:id :asc]]}))

;;; ---------------------------------------------- Workspace schema -----------------------------------------------

(mu/defn insert-workspace-schema!
  "Insert a WorkspaceSchema and return it."
  [row :- [:map {:closed true}
           [:workspace_database_id ms/PositiveInt]
           [:main_schema           :string]
           [:scratch_namespace     :string]
           [:status                :keyword]
           [:lock_token            :string]]]
  (t2/insert-returning-instance! :model/WorkspaceSchema row))

(mu/defn set-scratch-namespace!
  "Set the `scratch_namespace` of the WorkspaceSchema with `id`, returning the number of rows updated."
  [id                :- ms/PositiveInt
   scratch-namespace :- :string]
  (t2/update! :model/WorkspaceSchema :id [:auto/param id] {:scratch_namespace scratch-namespace}))

(mu/defn workspace-schema
  "The WorkspaceSchema with `id` without its `:lock_token`, with `:stale` by `staleness`, or nil."
  [id        :- ms/PositiveInt
   staleness :- ::staleness]
  (t2/select-one (workspace-schema-columns staleness) :id [:auto/param id]))

(mu/defn workspace-schemas-of-workspace-databases
  "The WorkspaceSchemas of the WorkspaceDatabases with ids in `workspace-database-ids`, without their `:lock_token`,
  with `:stale` by `staleness`, in id order."
  [workspace-database-ids :- [:sequential ms/PositiveInt]
   staleness              :- ::staleness]
  (t2/select (workspace-schema-columns staleness) :workspace_database_id [:in workspace-database-ids]
             {:order-by [[:id :asc]]}))

;;; ------------------------------------------ Provisioning connection -------------------------------------------

(mu/defn provisioning-connection
  "The WorkspaceProvisioningConnection of the Database with `database-id`, `:details` included, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/WorkspaceProvisioningConnection :database_id [:auto/param database-id]))

(mu/defn lock-provisioning-connection!
  "Lock the WorkspaceProvisioningConnection row of the Database with `database-id` until the current transaction ends,
  and return its `database_id`, or nil when there is none. Reads the table rather than the model, so the lock never
  depends on decrypting `details`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :database_id :workspace_provisioning_connection
                    :database_id [:auto/param database-id]
                    {:for :update}))

(mu/defn save-provisioning-connection!
  "Insert or replace the WorkspaceProvisioningConnection of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   details     :- ms/DatabaseDetails
   updated-by  :- [:maybe ms/PositiveInt]]
  (mdb/update-or-insert! :model/WorkspaceProvisioningConnection {:database_id database-id}
                         (constantly {:database_id database-id, :details details, :updated_by updated-by})))

(mu/defn delete-provisioning-connection!
  "Delete the WorkspaceProvisioningConnection of the Database with `database-id`, returning the number deleted."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/WorkspaceProvisioningConnection :database_id [:auto/param database-id]))
