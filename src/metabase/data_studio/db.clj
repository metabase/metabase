(ns metabase.data-studio.db
  "Application database queries for the data studio module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.string :as str]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private TableSelectors
  "A map of `:database_ids`, `:schema_ids`, and/or `:table_ids` picking out a set of Tables."
  [:map {:closed true}
   [:database_ids {:optional true} [:or [:set ::lib.schema.id/database] [:sequential ::lib.schema.id/database]]]
   [:schema_ids   {:optional true} [:or [:set :string] [:sequential :string]]]
   [:table_ids    {:optional true} [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]])

(defn- table-selectors-where
  "The `:where` clause for the Tables picked out by `selectors`, a map of `:database_ids`, `:schema_ids`,
  and/or `:table_ids`."
  [{:keys [database_ids table_ids schema_ids]}]
  (let [schema-expr (fn [s]
                      (let [[schema-db-id schema-name] (str/split s #"\:")]
                        (t2/fragment [:and [:= :db_id (parse-long schema-db-id)] [:= :schema schema-name]])))]
    (t2/fragment [:or
                  false
                  (when (seq database_ids)
                    (t2/fragment [:in :db_id (sort database_ids)]))
                  (when (seq table_ids)
                    (t2/fragment [:in :id (sort table_ids)]))
                  (when (seq schema_ids)
                    (reduce (fn [acc s] (t2/fragment [:or acc (schema-expr s)])) nil (sort schema_ids)))])))

(defn- input-field-join
  "The condition joining the input Field of a remapping Dimension, given the Table id column `input-table-id`."
  [input-table-id]
  (case input-table-id
    :source_field/table_id (t2/fragment [:= :dim.field_id :input_field.id])
    :target_field/table_id (t2/fragment [:= :dim.human_readable_field_id :input_field.id])))

(defn- output-field-join
  "The condition joining the output Field of a remapping Dimension, given the Table id column `output-table-id`."
  [output-table-id]
  (case output-table-id
    :source_field/table_id (t2/fragment [:= :dim.field_id :output_field.id])
    :target_field/table_id (t2/fragment [:= :dim.human_readable_field_id :output_field.id])))

(mu/defn fk-remapped-table-ids-for-tables
  "The `:table_id`s reached through external Dimensions from the Tables with `table-ids`, reading the Table id
  of the `input-table-id` column and returning that of the `output-table-id` column, excluding ids already in
  `exclude-table-ids`."
  [input-table-id     :- :keyword
   output-table-id    :- :keyword
   table-ids          :- [:set ::lib.schema.id/table]
   exclude-table-ids  :- [:set ::lib.schema.id/table]]
  (let [input-join  (input-field-join input-table-id)
        output-join (output-field-join output-table-id)]
    (t2/reducible-query {:select [[:output_field.table_id :table_id]]
                         :from   [[(t2/table-name :model/Dimension) :dim]]
                         :join   [[(t2/table-name :model/Field) :input_field] input-join
                                  [(t2/table-name :model/Field) :output_field] output-join]
                         :where  [:and
                                  [:= :dim.type "external"]
                                  [:in :input_field.table_id table-ids]
                                  [:not [:in :output_field.table_id exclude-table-ids]]]})))

(mu/defn fk-remapped-table-ids-for-selectors
  "The `:table_id`s reached through external Dimensions from the Tables picked out by `selectors`, reading the
  Table id of the `input-table-id` column and returning that of the `output-table-id` column, excluding Tables
  also picked out by `selectors`."
  [input-table-id  :- :keyword
   output-table-id :- :keyword
   selectors       :- TableSelectors]
  (let [where       (table-selectors-where selectors)
        input-join  (input-field-join input-table-id)
        output-join (output-field-join output-table-id)]
    (t2/reducible-query {:select [[:output_field.table_id :table_id]]
                         :from   [[(t2/table-name :model/Dimension) :dim]]
                         :join   [[(t2/table-name :model/Field) :input_field] input-join
                                  [(t2/table-name :model/Field) :output_field] output-join]
                         :where  [:and
                                  [:= :dim.type "external"]
                                  [:in :input_field.table_id ^:allow-subquery
                                   {:select [:id] :from [(t2/table-name :model/Table)] :where where}]
                                  [:not [:exists ^:allow-subquery
                                         {:select [1]
                                          :from   [(t2/table-name :model/Table)]
                                          :where  [:and where [:= :id :output_field.table_id]]}]]]})))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn databases
  "The Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn tables-matching-selectors
  "The Tables picked out by `selectors`, a map of `:database_ids`, `:schema_ids`, and/or `:table_ids`."
  [selectors :- TableSelectors]
  (t2/select :model/Table {:where (table-selectors-where selectors)}))

(mu/defn tables-matching-selectors-in-id-order
  "The Tables picked out by `selectors`, in id order."
  [selectors :- TableSelectors]
  (t2/select :model/Table {:where (table-selectors-where selectors), :order-by [[:id]]}))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn selection-columns-for-selectors
  "Up to `limit` id, database, name, schema, and published flag of the Tables picked out by `selectors`."
  [selectors :- TableSelectors
   limit     :- ms/PositiveInt]
  (t2/select [:model/Table :id :db_id :name :display_name :schema :is_published]
             {:where (table-selectors-where selectors), :limit limit}))

(mu/defn selection-columns-for-tables
  "The id, database, name, schema, and published flag of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id :name :display_name :schema :is_published] :id [:in table-ids]))

(mu/defn delete-field-values-for-tables!
  "Delete the FieldValues of the Fields of the Tables with `table-ids`, returning the number deleted."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/delete! (t2/table-name :model/FieldValues)
              :field_id [:in ^:allow-subquery {:select [:id]
                                               :from   [(t2/table-name :model/Field)]
                                               :where  [:in :table_id table-ids]}]))
