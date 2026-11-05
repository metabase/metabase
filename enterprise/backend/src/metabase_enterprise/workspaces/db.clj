(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private workspace-database-columns
  "Every `workspace_database` column but `database_details`, which holds the workspace user's password."
  [:model/WorkspaceDatabase :id :workspace_id :database_id :isolation_id :status :created_at :updated_at])

;;; ------------------------------------------------- Database -------------------------------------------------

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id [:auto/param database-id]))

;;; ------------------------------------------------- Workspace ------------------------------------------------

(mu/defn insert-workspace!
  "Insert a Workspace and return its id."
  [workspace-name :- ms/NonBlankString
   creator-id     :- [:maybe ms/PositiveInt]]
  (t2/insert-returning-pk! :model/Workspace {:name workspace-name, :creator_id creator-id}))

(mu/defn workspaces-page
  "Up to `limit` Workspaces after skipping `offset`, in id order."
  [limit  :- ms/PositiveInt
   offset :- ms/IntGreaterThanOrEqualToZero]
  (t2/select :model/Workspace {:order-by [[:id :asc]]
                               :limit    limit
                               :offset   offset}))

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
           [:status           :keyword]]]
  (t2/insert-returning-instance! :model/WorkspaceDatabase row))

(mu/defn workspace-database
  "The WorkspaceDatabase with `id`, `:database_details` included, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/WorkspaceDatabase :id [:auto/param id]))

(mu/defn workspace-database-without-details
  "The WorkspaceDatabase with `id` without its `:database_details`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one workspace-database-columns :id [:auto/param id]))

(mu/defn workspace-databases-of-workspaces
  "The WorkspaceDatabases of the Workspaces with ids in `workspace-ids`, without their `:database_details`, in id
  order."
  [workspace-ids :- [:sequential ms/PositiveInt]]
  (t2/select workspace-database-columns :workspace_id [:in workspace-ids] {:order-by [[:id :asc]]}))

(mu/defn update-workspace-database-status!
  "Set the status of the WorkspaceDatabase with `id` to `to`, but only while its status is one of `from`, or one of
  `stale-from` with an `updated_at` before `stale-before`. Returns the number of rows updated, 0 or 1. One UPDATE
  statement, so of two concurrent callers from the same status only one updates the row."
  [id           :- ms/PositiveInt
   from         :- [:set :keyword]
   stale-from   :- [:set :keyword]
   stale-before :- (ms/InstanceOfClass java.time.OffsetDateTime)
   to           :- :keyword]
  ;; A raw UPDATE rather than t2/update! on the model: Toucan's before-update hook selects the matching rows first
  ;; and this must stay a single statement.
  (t2/query-one {:update :workspace_database
                 :set    {:status [:auto/param (name to)], :updated_at (mi/now)}
                 :where  [:and
                          [:= :id [:auto/param id]]
                          [:or
                           [:in :status (mapv name from)]
                           (if (seq stale-from)
                             [:and
                              [:in :status (mapv name stale-from)]
                              [:< :updated_at [:auto/param stale-before]]]
                             false)]]}))

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
           [:status                :keyword]]]
  (t2/insert-returning-instance! :model/WorkspaceSchema row))

(mu/defn set-scratch-namespace!
  "Set the `scratch_namespace` of the WorkspaceSchema with `id`, returning the number of rows updated."
  [id                :- ms/PositiveInt
   scratch-namespace :- :string]
  (t2/update! :model/WorkspaceSchema :id [:auto/param id] {:scratch_namespace scratch-namespace}))

(mu/defn workspace-schemas-of-workspace-databases
  "The WorkspaceSchemas of the WorkspaceDatabases with ids in `workspace-database-ids`, in id order."
  [workspace-database-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/WorkspaceSchema :workspace_database_id [:in workspace-database-ids] {:order-by [[:id :asc]]}))

;;; ------------------------------------------ Provisioning connection -------------------------------------------

(mu/defn provisioning-connection
  "The WorkspaceProvisioningConnection of the Database with `database-id`, `:details` included, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/WorkspaceProvisioningConnection :database_id [:auto/param database-id]))

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
