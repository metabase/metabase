(ns metabase.measures.db
  "Application database queries for the measures module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn insert-measure! :- (ms/InstanceOf :model/Measure)
  "Insert a Measure and return the inserted instance."
  [creator-id   :- ms/PositiveInt
   measure-name :- :string
   description  :- [:maybe :string]
   definition   :- :any]
  (t2/insert-returning-instance! :model/Measure
                                 :creator_id  creator-id
                                 :name        measure-name
                                 :description description
                                 :definition  definition))

(mu/defn measure :- [:maybe (ms/InstanceOf :model/Measure)]
  "The Measure with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Measure :id id))

(mu/defn unarchived-measures :- [:sequential (ms/InstanceOf :model/Measure)]
  "The unarchived Measures, in case-insensitive name order."
  []
  (t2/select :model/Measure, :archived false, {:order-by [[:%lower.name :asc]]}))

(mu/defn table-database-ids :- [:maybe [:set ms/PositiveInt]]
  "The set of Database ids of the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))

(mu/defn update-measure! :- :int
  "Apply `changes` to the Measure with `id`."
  [id      :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:name        {:optional true} :string]
               [:description {:optional true} [:maybe :string]]
               [:archived    {:optional true} :boolean]
               [:definition  {:optional true} :any]]]
  (t2/update! :model/Measure id changes))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table :id table-id))

(mu/defn table-perms-columns :- [:maybe (ms/InstanceOf :model/Table)]
  "The Database id, schema, and id of the Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one [:model/Table :db_id :schema :id] :id table-id))

(mu/defn collections :- [:sequential (ms/InstanceOf :model/Collection)]
  "The Collections with `collection-ids`."
  [collection-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Collection :id [:in collection-ids]))

(mu/defn set-measure-dimensions! :- :int
  "Set the dimensions and dimension mappings of the Measure with `id`."
  [id                 :- ms/PositiveInt
   dimensions         :- :any
   dimension-mappings :- :any]
  (t2/update! :model/Measure id {:dimensions dimensions, :dimension_mappings dimension-mappings}))
