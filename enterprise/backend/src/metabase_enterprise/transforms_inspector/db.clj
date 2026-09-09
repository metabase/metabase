(ns metabase-enterprise.transforms-inspector.db
  "Application database queries for the transforms-inspector module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn table-source-rows
  "The ID, name, schema, and Database ID of the Tables with `table-ids`, as source info."
  [table-ids]
  (t2/select [:model/Table [:id :table-id] [:name :table-name] :schema [:db_id :db-id]] :id [:in table-ids]))

(defn database-engine
  "The engine of the Database with `database-id`."
  [database-id]
  (t2/select-one-fn :engine :model/Database :id database-id))

(defn active-fields-for-table
  "The active Fields of the Table with `table-id`."
  [table-id]
  (t2/select :model/Field :table_id table-id :active true))
