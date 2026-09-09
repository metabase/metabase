(ns metabase.query-permissions.db
  "Application database queries for the query permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private CardCollectionId
  "Rows returned by [[card-collection-id]]."
  (mut/select-keys ::queries.schema/card [:collection_id :card_schema :query_description]))

(mu/defn card-collection-id :- [:maybe CardCollectionId]
  "The `:collection_id` and `:card_schema` of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :collection_id :card_schema] :id card-id))

(mu/defn card-not-in-database :- [:maybe ::queries.schema/card]
  "The Card with `card-id` if it does not belong to the Database with `database-id`, or nil."
  [card-id     :- ::lib.schema.id/card
   database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Card :id card-id :database_id [:!= database-id]))

(mu/defn field-table-ids :- [:maybe [:set ::lib.schema.id/table]]
  "The set of Table ids of the Fields with `field-ids`."
  [field-ids :- [:or [:set ::lib.schema.id/field] [:sequential ::lib.schema.id/field]]]
  (t2/select-fn-set :table_id :model/Field :id [:in field-ids]))

(mu/defn table-id->database-id :- [:map-of ::lib.schema.id/table ms/PositiveInt]
  "A map of Table id to Database id for the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select-pk->fn :db_id :model/Table :id [:in table-ids]))
