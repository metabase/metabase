(ns metabase.measures.db
  "Application database queries for the measures module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.schema :as measures.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn synced-measures-clause :- [:fn vector?]
  "The clause over the Measure table aliased `alias` selecting the measures of the tables remote sync syncs."
  [alias :- :keyword]
  [:and
   [:= (u/qualified-key alias :archived) false]
   (remote-sync/synced-fk-clause alias :table_id :model/TableUserSettings)])

(mu/defn insert-measure!
  "Insert a Measure and return the inserted instance."
  [creator-id   :- ::lib.schema.id/user
   measure-name :- :string
   description  :- [:maybe :string]
   definition   :- [:maybe ::measures.schema/measure.definition]]
  (t2/insert-returning-instance! :model/Measure
                                 :creator_id  creator-id
                                 :name        measure-name
                                 :description description
                                 :definition  definition))

(mu/defn measure
  "The Measure with `id`, or nil."
  [id :- ::lib.schema.id/measure]
  (t2/select-one :model/Measure :id id))

(mu/defn unarchived-measures
  "The unarchived Measures, in case-insensitive name order."
  []
  (t2/select :model/Measure, :archived false, {:order-by [[:%lower.name :asc]]}))

(mu/defn table-database-ids
  "The set of Database ids of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))

(mu/defn update-measure!
  "Apply `changes` to the Measure with `id`."
  [id      :- ::lib.schema.id/measure
   changes :- (mut/select-keys ::measures.schema/measure.update [:name :description :archived :definition])]
  (t2/update! :model/Measure :id id changes))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn table-perms-columns
  "The Database id, schema, and id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :db_id :schema :id] :id table-id))

(mu/defn set-measure-dimensions!
  "Set the dimensions and dimension mappings of the Measure with `id`."
  [id                 :- ::lib.schema.id/measure
   dimensions         :- [:maybe sequential?]
   dimension-mappings :- [:maybe [:sequential ::measures.schema/measure.dimension-mapping]]]
  (t2/update! :model/Measure :id id {:dimensions dimensions, :dimension_mappings dimension-mappings}))
