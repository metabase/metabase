(ns metabase.measures.queries
  "Application database queries for the measures module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn insert-measure!
  "Insert a Measure and return the inserted instance."
  [creator-id measure-name description definition]
  (t2/insert-returning-instance! :model/Measure
                                 :creator_id  creator-id
                                 :name        measure-name
                                 :description description
                                 :definition  definition))

(defn hydrate-creator
  "Hydrate `:creator` onto `measure`."
  [measure]
  (t2/hydrate measure :creator))

(defn hydrate-creator-and-definition-description
  "Hydrate `:creator` and `:definition_description` onto `measures`."
  [measures]
  (t2/hydrate measures :creator :definition_description))

(defn hydrate-table
  "Hydrate `:table` onto `measures`."
  [measures]
  (t2/hydrate measures :table))

(defn measure
  "The Measure with `id`, or nil."
  [id]
  (t2/select-one :model/Measure :id id))

(defn unarchived-measures
  "The unarchived Measures, in case-insensitive name order."
  []
  (t2/select :model/Measure, :archived false, {:order-by [[:%lower.name :asc]]}))

(defn table-database-ids
  "The set of Database ids of the Tables with `table-ids`."
  [table-ids]
  (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))

(defn update-measure!
  "Apply `changes` to the Measure with `id`."
  [id changes]
  (t2/update! :model/Measure id changes))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn table-perms-columns
  "The Database id, schema, and id of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one [:model/Table :db_id :schema :id] :id table-id))

(defn collections
  "The Collections with `collection-ids`."
  [collection-ids]
  (t2/select :model/Collection :id [:in collection-ids]))

(defn set-measure-dimensions!
  "Set the dimensions and dimension mappings of the Measure with `id`."
  [id dimensions dimension-mappings]
  (t2/update! :model/Measure id {:dimensions dimensions, :dimension_mappings dimension-mappings}))
