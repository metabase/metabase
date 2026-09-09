(ns metabase-enterprise.upload-management.db
  "Application database queries for the upload-management module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn attached-dwh-database-id
  "The ID of the attached data warehouse Database, or nil."
  []
  (t2/select-one-fn :id :model/Database :is_attached_dwh true))

(mu/defn non-upload-tables-for-database
  "The active Tables of the Database with `database-id` that were not uploaded."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/Table :db_id database-id :active true :is_upload false))

(mu/defn upload-tables
  "The active uploaded Tables, ordered by name."
  []
  (t2/select :model/Table :active true :is_upload true {:order-by [[:name :asc]]}))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table table-id))
