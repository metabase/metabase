(ns metabase.measures.db
  "Application database queries for the measures module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.schema :as measures.schema]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(mu/defn insert-measure! :- ::measures.schema/measure
  "Insert a Measure and return the inserted instance."
  [creator-id   :- ::lib.schema.id/user
   measure-name :- :string
   description  :- [:maybe :string]
   definition   :- [:maybe :map]]
  (t2/insert-returning-instance! :model/Measure
                                 :creator_id  creator-id
                                 :name        measure-name
                                 :description description
                                 :definition  definition))

(mu/defn measure :- [:maybe ::measures.schema/measure]
  "The Measure with `id`, or nil."
  [id :- ::lib.schema.id/measure]
  (t2/select-one :model/Measure :id id))

(mu/defn unarchived-measures :- [:sequential ::measures.schema/measure]
  "The unarchived Measures, in case-insensitive name order."
  []
  (t2/select :model/Measure, :archived false, {:order-by [[:%lower.name :asc]]}))

(mu/defn table-database-ids :- [:maybe [:set ::lib.schema.id/database]]
  "The set of Database ids of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))

(mu/defn update-measure! :- :int
  "Apply `changes` to the Measure with `id`."
  [id      :- ::lib.schema.id/measure
   changes :- (mut/select-keys ::measures.schema/measure.update [:name :description :archived :definition])]
  (t2/update! :model/Measure id changes))

(mu/defn table :- [:maybe ::warehouse-schema.schema/table]
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id))

(def ^:private TablePermsColumn
  "Rows returned by [[table-perms-columns]]."
  (mut/select-keys ::warehouse-schema.schema/table [:db_id :schema :id]))

(mu/defn table-perms-columns :- [:maybe TablePermsColumn]
  "The Database id, schema, and id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :db_id :schema :id] :id table-id))

(mu/defn collections :- [:sequential ::collections.schema/collection]
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Collection :id [:in collection-ids]))

(mu/defn set-measure-dimensions! :- :int
  "Set the dimensions and dimension mappings of the Measure with `id`."
  [id                 :- ::lib.schema.id/measure
   dimensions         :- [:maybe sequential?]
   dimension-mappings :- [:maybe [:sequential :map]]]
  (t2/update! :model/Measure id {:dimensions dimensions, :dimension_mappings dimension-mappings}))
