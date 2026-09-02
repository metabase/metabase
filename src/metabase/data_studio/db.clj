(ns metabase.data-studio.db
  "Application database queries for the data studio module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn fk-remapped-table-ids
  "The `:table_id`s reached through external Dimensions from the Tables selected by `tables`, reading the Table id of
  the `input-table-id` column and returning that of the `output-table-id` column, restricted by the Honey SQL
  `not-in-tables` clause."
  [input-table-id output-table-id tables not-in-tables]
  (t2/reducible-query {:select [[output-table-id :table_id]]
                       :from   [[(t2/table-name :model/Dimension) :dim]]
                       :join   [[(t2/table-name :model/Field) :source_field]
                                [:= :dim.field_id :source_field.id]
                                [(t2/table-name :model/Field) :target_field]
                                [:= :dim.human_readable_field_id :target_field.id]]
                       :where  [:and
                                [:= :dim.type "external"]
                                [:in input-table-id tables]
                                not-in-tables]}))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn databases
  "The Databases with `database-ids`."
  [database-ids]
  (t2/select :model/Database :id [:in database-ids]))

(defn tables-where
  "The Tables matching the Honey SQL `where` clause."
  [where]
  (t2/select :model/Table {:where where}))

(defn tables-where-in-id-order
  "The Tables matching the Honey SQL `where` clause, in id order."
  [where]
  (t2/select :model/Table {:where where, :order-by [[:id]]}))

(defn tables
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn update-tables!
  "Apply `changes` to the Tables with `table-ids`."
  [table-ids changes]
  (t2/update! :model/Table [:in table-ids] changes))

(defn selection-columns-for-tables-where
  "Up to `limit` id, database, name, schema, and published flag rows of the Tables matching the Honey SQL `where`
  clause."
  [where limit]
  (t2/select [:model/Table :id :db_id :name :display_name :schema :is_published] {:where where :limit limit}))

(defn selection-columns-for-tables
  "The id, database, name, schema, and published flag of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :db_id :name :display_name :schema :is_published] :id [:in table-ids]))

(defn delete-field-values-for-tables!
  "Delete the FieldValues of the Fields of the Tables with `table-ids`."
  [table-ids]
  (t2/delete! (t2/table-name :model/FieldValues)
              :field_id [:in ^:allow-subquery {:select [:id]
                                               :from   [(t2/table-name :model/Field)]
                                               :where  [:in :table_id table-ids]}]))
