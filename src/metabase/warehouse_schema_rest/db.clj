(ns metabase.warehouse-schema-rest.db
  "Application database queries for the warehouse schema REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn field-and-target-database-ids
  "The `:source_db_id` and `:target_db_id` of the Fields with `source-field-id` and `target-field-id`."
  [source-field-id target-field-id]
  (t2/query {:select [[:source_t.db_id :source_db_id]
                      [:target_t.db_id :target_db_id]]
             :from   [[(t2/table-name :model/Field) :sf]]
             :join   [[(t2/table-name :model/Table) :source_t] [:= :sf.table_id :source_t.id]
                      [(t2/table-name :model/Field) :tf] [:= :tf.id target-field-id]
                      [(t2/table-name :model/Table) :target_t] [:= :tf.table_id :target_t.id]]
             :where  [:= :sf.id source-field-id]}))

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(defn update-field!
  "Apply `changes` to the Field with `field-id`."
  [field-id changes]
  (t2/update! :model/Field field-id changes))

(defn set-nested-fields-active!
  "Set the active flag of the Fields of the Table with `table-id` whose NFC path matches the SQL LIKE
  `nfc-path-pattern`, returning the number updated."
  [table-id nfc-path-pattern active?]
  (t2/update! :model/Field :table_id table-id :nfc_path [:like nfc-path-pattern] {:active active?}))

(defn hydrate-dimensions
  "Hydrate `:dimensions` onto `field`."
  [field]
  (t2/hydrate field :dimensions))

(defn hydrate-dimensions-and-has-field-values
  "Hydrate `:dimensions` and `:has_field_values` onto `field`."
  [field]
  (t2/hydrate field :dimensions :has_field_values))

(defn hydrate-table
  "Hydrate `:table` onto `field`."
  [field]
  (t2/hydrate field :table))

(defn hydrate-table-and-db
  "Hydrate `:table` with its `:db` onto `field`."
  [field]
  (t2/hydrate field [:table :db]))

(defn dimension-for-field
  "The Dimension of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Dimension :field_id field-id))

(defn insert-dimension!
  "Insert the Dimension `row`."
  [row]
  (t2/insert! :model/Dimension row))

(defn update-dimension!
  "Apply `changes` to the Dimension with `id`."
  [id changes]
  (t2/update! :model/Dimension id changes))

(defn rename-dimension-for-field!
  "Set the name of the Dimension of the Field with `field-id`."
  [field-id dimension-name]
  (t2/update! :model/Dimension :field_id field-id {:name dimension-name}))

(defn delete-dimension!
  "Delete the Dimension with `id`."
  [id]
  (t2/delete! :model/Dimension :id id))

(defn delete-dimensions-for-field!
  "Delete the Dimensions of the Field with `field-id`."
  [field-id]
  (t2/delete! :model/Dimension :field_id field-id))

(defn tables
  "The Tables selected by the Honey SQL `query`."
  [query]
  (t2/select :model/Table query))

(defn tables-by-ids
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn update-table!
  "Apply `changes` to the Table with `table-id`."
  [table-id changes]
  (t2/update! :model/Table table-id changes))

(defn hydrate
  "Hydrate the `hydration` keys onto `instances`."
  [instances hydration]
  (apply t2/hydrate instances hydration))

(defn hydrate-db-pk-field-and-collection
  "Hydrate `:db`, `:pk_field`, and `:collection` onto `table`."
  [table]
  (t2/hydrate table :db :pk_field :collection))

(defn hydrate-fields-dimensions-and-values
  "Hydrate `:fields` with their targets, dimensions, and field values onto `table`."
  [table]
  (t2/hydrate table [:fields [:target :has_field_values] :dimensions :has_field_values]))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn non-destination-database
  "The Database with `database-id` if it is not a routing destination, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id :router_database_id nil))

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn active-unretired-field-ids-for-table
  "The ids of the active, unretired Fields of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-pks-set :model/Field, :table_id table-id, :visibility_type [:not= "retired"], :active true))

(defn field-ids-for-table
  "The ids of the Fields of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-pks-set :model/Field :table_id table-id))

(defn active-fields-targeting
  "The active Fields whose FK target is one of `field-ids`."
  [field-ids]
  (t2/select :model/Field, :fk_target_field_id [:in field-ids], :active true))

(defn delete-field-values-for-fields!
  "Delete the FieldValues of the Fields with `field-ids`."
  [field-ids]
  (t2/delete! (t2/table-name :model/FieldValues) :field_id [:in field-ids]))
