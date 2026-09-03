(ns metabase.data-studio.db
  "Application database queries for the data studio module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.string :as str]
   [toucan2.core :as t2]))

(defn- table-selectors-where
  "The `:where` clause for the Tables picked out by `selectors`, a map of `:database_ids`, `:schema_ids`,
  and/or `:table_ids`."
  [{:keys [database_ids table_ids schema_ids]}]
  (let [schema-expr (fn [s]
                      (let [[schema-db-id schema-name] (str/split s #"\:")]
                        [:and [:= :db_id (parse-long schema-db-id)] [:= :schema schema-name]]))]
    (cond-> [:or false]
      (seq database_ids) (conj [:in :db_id (sort database_ids)])
      (seq table_ids)    (conj [:in :id    (sort table_ids)])
      (seq schema_ids)   (conj (into [:or] (map schema-expr) (sort schema_ids))))))

(defn fk-remapped-table-ids-for-tables
  "The `:table_id`s reached through external Dimensions from the Tables with `table-ids`, reading the Table id
  of the `input-table-id` column and returning that of the `output-table-id` column, excluding ids already in
  `exclude-table-ids`."
  [input-table-id output-table-id table-ids exclude-table-ids]
  (t2/reducible-query {:select [[output-table-id :table_id]]
                       :from   [[(t2/table-name :model/Dimension) :dim]]
                       :join   [[(t2/table-name :model/Field) :source_field]
                                [:= :dim.field_id :source_field.id]
                                [(t2/table-name :model/Field) :target_field]
                                [:= :dim.human_readable_field_id :target_field.id]]
                       :where  [:and
                                [:= :dim.type "external"]
                                [:in input-table-id table-ids]
                                [:not [:in output-table-id exclude-table-ids]]]}))

(defn fk-remapped-table-ids-for-selectors
  "The `:table_id`s reached through external Dimensions from the Tables picked out by `selectors`, reading the
  Table id of the `input-table-id` column and returning that of the `output-table-id` column, excluding Tables
  also picked out by `selectors`."
  [input-table-id output-table-id selectors]
  (let [where (table-selectors-where selectors)]
    (t2/reducible-query {:select [[output-table-id :table_id]]
                         :from   [[(t2/table-name :model/Dimension) :dim]]
                         :join   [[(t2/table-name :model/Field) :source_field]
                                  [:= :dim.field_id :source_field.id]
                                  [(t2/table-name :model/Field) :target_field]
                                  [:= :dim.human_readable_field_id :target_field.id]]
                         :where  [:and
                                  [:= :dim.type "external"]
                                  [:in input-table-id ^:allow-subquery
                                   {:select [:id] :from [(t2/table-name :model/Table)] :where where}]
                                  [:not [:exists ^:allow-subquery
                                         {:select [1]
                                          :from   [(t2/table-name :model/Table)]
                                          :where  [:and where [:= :id output-table-id]]}]]]})))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn databases
  "The Databases with `database-ids`."
  [database-ids]
  (t2/select :model/Database :id [:in database-ids]))

(defn tables-matching-selectors
  "The Tables picked out by `selectors`, a map of `:database_ids`, `:schema_ids`, and/or `:table_ids`."
  [selectors]
  (t2/select :model/Table {:where (table-selectors-where selectors)}))

(defn tables-matching-selectors-in-id-order
  "The Tables picked out by `selectors`, in id order."
  [selectors]
  (t2/select :model/Table {:where (table-selectors-where selectors), :order-by [[:id]]}))

(defn tables
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn update-tables!
  "Apply `changes` to the Tables with `table-ids`."
  [table-ids changes]
  (t2/update! :model/Table [:in table-ids] changes))

(defn selection-columns-for-selectors
  "Up to `limit` id, database, name, schema, and published flag of the Tables picked out by `selectors`."
  [selectors limit]
  (t2/select [:model/Table :id :db_id :name :display_name :schema :is_published]
             {:where (table-selectors-where selectors), :limit limit}))

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
