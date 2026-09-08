(ns metabase.query-permissions.db
  "Application database queries for the query permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn card-collection-id :- [:maybe (ms/InstanceOf :model/Card)]
  "The `:collection_id` and `:card_schema` of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one [:model/Card :collection_id :card_schema] :id card-id))

(mu/defn card-not-in-database :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id` if it does not belong to the Database with `database-id`, or nil."
  [card-id     :- ms/PositiveInt
   database-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id :database_id [:!= database-id]))

(mu/defn field-table-ids :- [:maybe [:set ms/PositiveInt]]
  "The set of Table ids of the Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn-set :table_id :model/Field :id [:in field-ids]))

(mu/defn table-id->database-id :- [:map-of ms/PositiveInt ms/PositiveInt]
  "A map of Table id to Database id for the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :db_id :model/Table :id [:in table-ids]))
