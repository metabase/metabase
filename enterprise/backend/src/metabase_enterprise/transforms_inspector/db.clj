(ns metabase-enterprise.transforms-inspector.db
  "Application database queries for the transforms-inspector module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.core :as warehouse-schema]
   [toucan2.core :as t2]))

(mu/defn table-source-rows
  "The ID, name, schema, and Database ID of the Tables with `table-ids`, as source info."
  [table-ids :- [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]
  (t2/select [:model/Table [:id :table-id] [:name :table-name] :schema [:db_id :db-id]] :id [:in table-ids]))

(mu/defn database-engine
  "The engine of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :engine :model/Database :id database-id))

(mu/defn active-fields-for-table
  "The active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field :table_id table-id :active true {:from [(warehouse-schema/field-query)]}))
