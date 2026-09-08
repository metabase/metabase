(ns metabase-enterprise.upload-management.db
  "Application database queries for the upload-management module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn attached-dwh-database-id :- [:maybe ms/PositiveInt]
  "The ID of the attached data warehouse Database, or nil."
  []
  (t2/select-one-fn :id :model/Database :is_attached_dwh true))

(mu/defn non-upload-tables-for-database :- [:sequential (ms/InstanceOf :model/Table)]
  "The active Tables of the Database with `database-id` that were not uploaded."
  [database-id :- ms/PositiveInt]
  (t2/select :model/Table :db_id database-id :active true :is_upload false))

(mu/defn upload-tables :- [:sequential (ms/InstanceOf :model/Table)]
  "The active uploaded Tables, ordered by name."
  []
  (t2/select :model/Table :active true :is_upload true {:order-by [[:name :asc]]}))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table table-id))
