(ns metabase.query-permissions.db
  "Application database queries for the query permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn field-table-ids
  "The set of Table ids of the Fields with `field-ids`."
  [field-ids :- [:or [:set ::lib.schema.id/field] [:sequential ::lib.schema.id/field]]]
  (t2/select-fn-set :table_id :model/Field :id [:in field-ids] {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn table-id->database-id
  "A map of Table id to Database id for the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select-pk->fn :db_id :model/Table :id [:in table-ids]
                    {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))
