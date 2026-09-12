(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic."
  (:require
   [metabase-enterprise.workspaces.models.workspace-table-remapping]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.workspaces.schema :as ws.schema]
   [toucan2.core :as t2]))

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

(mu/defn remappings-for-db :- [:sequential ::ws.schema/workspace-table-remapping]
  "Every remapping of the Database with `db-id`."
  [db-id :- ::lib.schema.id/database]
  (t2/select :model/WorkspaceTableRemapping :db_id db-id))

(mu/defn remapping-for-source :- [:maybe ::ws.schema/workspace-table-remapping]
  "The remapping of the Database with `db-id` whose canonical table is `table-name` in `schema`, or nil."
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (t2/select-one :model/WorkspaceTableRemapping :db_id db-id :from_schema schema :from_table table-name))

(mu/defn remapping-for-target :- [:maybe ::ws.schema/workspace-table-remapping]
  "The remapping of the Database with `db-id` whose workspace table is `table-name` in `schema`, or nil."
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (t2/select-one :model/WorkspaceTableRemapping :db_id db-id :to_schema schema :to_table table-name))

(mu/defn remapping :- [:maybe ::ws.schema/workspace-table-remapping]
  "The remapping with `remapping-id`, or nil."
  [remapping-id :- pos-int?]
  (t2/select-one :model/WorkspaceTableRemapping remapping-id))

(mu/defn update-or-insert-remapping! :- pos-int?
  "Update the remapping of the Database with `db-id` whose canonical table is `table-name` in `schema`, or insert
  it, with `update-fn` as in [[metabase.app-db.core/update-or-insert!]]. Returns the remapping's id."
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string
   update-fn  :- fn?]
  (app-db/update-or-insert! :model/WorkspaceTableRemapping
                            {:db_id db-id, :from_schema schema, :from_table table-name}
                            update-fn))

(mu/defn delete-remapping-for-source! :- :int
  "Delete the remapping of the Database with `db-id` whose canonical table is `table-name` in `schema`. Returns the
  number of rows deleted."
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (t2/delete! :model/WorkspaceTableRemapping :db_id db-id :from_schema schema :from_table table-name))
