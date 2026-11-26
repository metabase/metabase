(ns metabase.query-permissions.db
  "Application database queries for the query permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn cards-with-collection-ids
  "The Cards with `card-ids`, each with its `:id` and `:collection_id`, by id."
  [card-ids :- [:sequential {:min 1} ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn identity [:model/Card :id :collection_id] :id [:in %])
                          card-ids))

(mu/defn card-not-in-database
  "The Card with `card-id` if it does not belong to the Database with `database-id`, or nil."
  [card-id     :- ::lib.schema.id/card
   database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Card :id card-id :database_id [:!= database-id]))

(mu/defn field-table-ids
  "The set of Table ids of the Fields with `field-ids`."
  [field-ids :- [:or [:set ::lib.schema.id/field] [:sequential ::lib.schema.id/field]]]
  (mdb/select-batched-set #(t2/select-fn-set :table_id :model/Field :id [:in %]) field-ids))

(mu/defn field-id->table-id
  "A map of Field id to Table id for the Fields with `field-ids`."
  [field-ids :- [:or [:set ::lib.schema.id/field] [:sequential ::lib.schema.id/field]]]
  (mdb/select-batched-map #(t2/select-pk->fn :table_id :model/Field :id [:in %]) field-ids))

(mu/defn table-id->database-id
  "A map of Table id to Database id for the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (mdb/select-batched-map #(t2/select-pk->fn :db_id :model/Table :id [:in %]) table-ids))
