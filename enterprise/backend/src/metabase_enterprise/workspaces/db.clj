(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic."
  (:require
   [metabase-enterprise.workspaces.models.workspace]
   [metabase-enterprise.workspaces.models.workspace-table-remapping]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.workspaces.schema :as ws.schema]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace/keep-me)
(comment metabase-enterprise.workspaces.models.workspace-table-remapping/keep-me)

(mu/defn database :- [:maybe [:map [:id ::lib.schema.id/database] [:engine :keyword]]]
  "The Database with `db-id`, or nil."
  [db-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id db-id))

(mu/defn databases-and-settings :- [:sequential [:map
                                                 [:id       ::lib.schema.id/database]
                                                 [:settings [:maybe :map]]]]
  "The id and settings of every Database."
  []
  (t2/select [:model/Database :id :settings]))

;;; Workspaces

(mu/defn workspace :- [:maybe ::ws.schema/workspace]
  "The Workspace with `workspace-id`, or nil."
  [workspace-id :- ::ws.schema/workspace-id]
  (t2/select-one :model/Workspace :id workspace-id))

(mu/defn workspaces :- [:sequential ::ws.schema/workspace]
  "Every Workspace, oldest first."
  []
  (t2/select :model/Workspace {:order-by [[:id :asc]]}))

(mu/defn create-workspace! :- ::ws.schema/workspace
  "Insert a Workspace named `ws-name` created by `creator-id` and return it."
  [ws-name    :- ::lib.schema.common/non-blank-string
   creator-id :- pos-int?]
  (t2/insert-returning-instance! :model/Workspace {:name ws-name, :creator_id creator-id}))

(mu/defn update-workspace! :- :int
  "Apply `changes` to the Workspace with `workspace-id`. Returns the number of rows updated."
  [workspace-id :- ::ws.schema/workspace-id
   changes      :- [:map]]
  (t2/update! :model/Workspace workspace-id changes))

(mu/defn workspace-remapping-count :- :int
  "How many table remappings the Workspace with `workspace-id` still holds."
  [workspace-id :- ::ws.schema/workspace-id]
  (t2/count :model/WorkspaceTableRemapping :workspace_id workspace-id))

(mu/defn delete-workspace! :- :int
  "Delete the Workspace with `workspace-id`. Returns rows deleted.

  Throws when the workspace still holds remappings: the `workspace_id` foreign key is RESTRICT, because a remapping
  row is the only record of the warehouse table it names. Drop those tables and unmap them first — see
  [[workspace-remapping-count]] to check."
  [workspace-id :- ::ws.schema/workspace-id]
  (t2/delete! :model/Workspace :id workspace-id))

;;; Table remappings
;;;
;;; Every lookup is scoped by `workspace-id` as well as `db-id`: the same canonical table is remapped
;;; independently in each workspace, so a query that omitted the workspace would match an arbitrary
;;; one of them.

(mu/defn remappings-for-db :- [:sequential ::ws.schema/workspace-table-remapping]
  "Every remapping of the Database with `db-id` in the Workspace with `workspace-id`."
  [workspace-id :- ::ws.schema/workspace-id
   db-id        :- ::lib.schema.id/database]
  (t2/select :model/WorkspaceTableRemapping :workspace_id workspace-id :db_id db-id))

(mu/defn remapping-for-source :- [:maybe ::ws.schema/workspace-table-remapping]
  "The remapping in the Workspace with `workspace-id` whose canonical table is `table-name` in `schema` on the
  Database with `db-id`, or nil."
  [workspace-id :- ::ws.schema/workspace-id
   db-id        :- ::lib.schema.id/database
   schema       :- [:maybe :string]
   table-name   :- ::lib.schema.common/non-blank-string]
  (t2/select-one :model/WorkspaceTableRemapping
                 :workspace_id workspace-id :db_id db-id :from_schema schema :from_table table-name))

(mu/defn remapping-for-target :- [:maybe ::ws.schema/workspace-table-remapping]
  "The remapping in the Workspace with `workspace-id` whose workspace table is `table-name` in `schema` on the
  Database with `db-id`, or nil."
  [workspace-id :- ::ws.schema/workspace-id
   db-id        :- ::lib.schema.id/database
   schema       :- [:maybe :string]
   table-name   :- ::lib.schema.common/non-blank-string]
  (t2/select-one :model/WorkspaceTableRemapping
                 :workspace_id workspace-id :db_id db-id :to_schema schema :to_table table-name))

(mu/defn remapping :- [:maybe ::ws.schema/workspace-table-remapping]
  "The remapping with `remapping-id`, or nil."
  [remapping-id :- pos-int?]
  (t2/select-one :model/WorkspaceTableRemapping remapping-id))

(mu/defn update-or-insert-remapping! :- pos-int?
  "Update the remapping in the Workspace with `workspace-id` whose canonical table is `table-name` in `schema` on the
  Database with `db-id`, or insert it, with `update-fn` as in [[metabase.app-db.core/update-or-insert!]]. Returns the
  remapping's id.

  The lookup map matches the `(db_id, workspace_id, from_schema, from_table)` unique constraint, so a concurrent
  first run of the same target in the same workspace updates rather than inserting a duplicate."
  [workspace-id :- ::ws.schema/workspace-id
   db-id        :- ::lib.schema.id/database
   schema       :- [:maybe :string]
   table-name   :- ::lib.schema.common/non-blank-string
   update-fn    :- fn?]
  (app-db/update-or-insert! :model/WorkspaceTableRemapping
                            {:workspace_id workspace-id
                             :db_id        db-id
                             :from_schema  schema
                             :from_table   table-name}
                            update-fn))

(mu/defn delete-remapping-for-source! :- :int
  "Delete the remapping in the Workspace with `workspace-id` whose canonical table is `table-name` in `schema` on the
  Database with `db-id`. Returns the number of rows deleted."
  [workspace-id :- ::ws.schema/workspace-id
   db-id        :- ::lib.schema.id/database
   schema       :- [:maybe :string]
   table-name   :- ::lib.schema.common/non-blank-string]
  (t2/delete! :model/WorkspaceTableRemapping
              :workspace_id workspace-id :db_id db-id :from_schema schema :from_table table-name))
