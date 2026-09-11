(ns metabase.query-permissions.db
  "Application database queries for the query permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn card-collection-id
  "The `:collection_id` and `:card_schema` of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :collection_id :card_schema] :id card-id))

(mu/defn card-not-in-database
  "The Card with `card-id` if it does not belong to the Database with `database-id`, or nil."
  [card-id     :- ::lib.schema.id/card
   database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Card :id card-id :database_id [:!= database-id]))

(mu/defn field-table-ids
  "The set of Table ids of the Fields with `field-ids`."
  [field-ids :- [:or [:set ::lib.schema.id/field] [:sequential ::lib.schema.id/field]]]
  (t2/select-fn-set :table_id :model/Field :id [:in field-ids] {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn table-id->database-id
  "A map of Table id to Database id for the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  ;; only db_id is read, which no user can set; see permissions sql.clj's `table-source`. This runs per query
  ;; execution, so the merge would be paid on the hottest path for nothing.
  (t2/select-pk->fn :db_id :model/Table :id [:in table-ids]
                    {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))
