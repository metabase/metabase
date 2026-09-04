(ns metabase.typed-schemas.db
  "Application database queries for the typed schemas module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(defn destination-database-ids
  "The ids among `database-ids` of Databases that are routing destinations."
  [database-ids]
  (t2/select-fn-set :id :model/Database :id [:in database-ids] :router_database_id [:not= nil]))

(defn- scope-filter-clause
  "Compiles a resolved scope into a Honey SQL where-clause conjunct: a nil scope means unscoped (no clause), an
  empty scope matches nothing."
  [scope-ids column]
  (when scope-ids
    (if (seq scope-ids)
      [:in column scope-ids]
      ;; no row has id -1: a resolved-but-empty scope matches no rows
      [:= column -1])))

(defn cards-ordered-by-name
  "The readable, non-archived Cards of `card-type` among `database-ids` and/or `collection-ids` (either nil for
  unscoped), in name then id order."
  [card-type database-ids collection-ids]
  (t2/select :model/Card
             {:where    [:and
                         [:= :type (name card-type)]
                         [:= :archived false]
                         (collection/visible-collection-filter-clause :collection_id)
                         (scope-filter-clause database-ids :database_id)
                         (scope-filter-clause collection-ids :collection_id)]
              :order-by [[:name :asc] [:id :asc]]}))

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

(defn active-tables-in-scope
  "The active Tables among `database-ids` and/or `table-ids` (either nil for unscoped), in name then id order."
  [database-ids table-ids]
  (t2/select :model/Table
             {:where    [:and [:= :active true]
                         (scope-filter-clause database-ids :db_id)
                         (scope-filter-clause table-ids :id)]
              :order-by [[:name :asc] [:id :asc]]}))

(defn published-library-tables-in-collections
  "The active, published Tables in `collection-ids` (nil for unscoped), in name then id order."
  [collection-ids]
  (t2/select :model/Table
             {:where    [:and
                         [:= :active true]
                         [:= :is_published true]
                         (scope-filter-clause collection-ids :collection_id)]
              :order-by [[:name :asc] [:id :asc]]}))

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
