(ns metabase.query-permissions.db
  "Application database queries for the query permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn card-collection-id
  "The `:collection_id` and `:card_schema` of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :collection_id :card_schema] :id card-id))

(defn card-not-in-database
  "The Card with `card-id` if it does not belong to the Database with `database-id`, or nil."
  [card-id database-id]
  (t2/select-one :model/Card :id card-id :database_id [:!= database-id]))

(defn field-table-ids
  "The set of Table ids of the Fields with `field-ids`."
  [field-ids]
  (t2/select-fn-set :table_id :model/Field :id [:in field-ids]))

(defn table-id->database-id
  "A map of Table id to Database id for the Tables with `table-ids`."
  [table-ids]
  (t2/select-pk->fn :db_id :model/Table :id [:in table-ids]))
