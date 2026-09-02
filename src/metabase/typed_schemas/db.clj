(ns metabase.typed-schemas.db
  "Application database queries for the typed schemas module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn destination-database-ids
  "The ids among `database-ids` of Databases that are routing destinations."
  [database-ids]
  (t2/select-fn-set :id :model/Database :id [:in database-ids] :router_database_id [:not= nil]))

(defn cards-ordered-by-name
  "The Cards matching the Honey SQL `where` clause, in name then id order."
  [where]
  (t2/select :model/Card {:where where, :order-by [[:name :asc] [:id :asc]]}))

(defn field-ids-and-table-ids
  "The id and Table id of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :table_id] :id [:in field-ids]))

(defn card-dimensions
  "The dimensions and dimension mappings of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :dimensions :dimension_mappings] :id card-id))

(defn table-names
  "The id, name, and display name of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :name :display_name] :id [:in table-ids]))

(defn model-actions
  "The id, model id, name, and type of the unarchived non-HTTP Actions of the model Cards with `model-ids`."
  [model-ids]
  (t2/select [:model/Action :id :model_id :name :type]
             :model_id [:in model-ids]
             :archived false
             :type [:not= "http"]))

(defn field-table-id
  "The Table id of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one-fn :table_id :model/Field :id field-id))

(defn tables-ordered-by-name
  "The Tables matching the Honey SQL `where` clause, in name then id order."
  [where]
  (t2/select :model/Table {:where where, :order-by [[:name :asc] [:id :asc]]}))

(defn measure-definition
  "The definition of the Measure with `measure-id`, or nil."
  [measure-id]
  (t2/select-one-fn :definition :model/Measure :id measure-id))

(defn measure-definitions
  "The id and definition of the Measures with `measure-ids`."
  [measure-ids]
  (t2/select [:model/Measure :id :definition] :id [:in measure-ids]))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn databases-named
  "The Databases named `database-name`."
  [database-name]
  (t2/select :model/Database :name database-name))

(defn collections
  "The Collections with `collection-ids`."
  [collection-ids]
  (t2/select :model/Collection :id [:in collection-ids]))

(defn collections-by-entity-ids
  "The Collections with `entity-ids`."
  [entity-ids]
  (t2/select :model/Collection :entity_id [:in entity-ids]))
