(ns metabase.data-studio.db
  "Application database queries for the data studio module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

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
                        [:and [:= :db_id (parse-long schema-db-id)] [:= :schema schema-name]]))]
    (cond-> [:or false]
      (seq database_ids) (conj [:in :db_id (sort database_ids)])
      (seq table_ids)    (conj [:in :id    (sort table_ids)])
      (seq schema_ids)   (conj (into [:or] (map schema-expr) (sort schema_ids))))))

(mu/defn fk-remapped-table-ids-for-tables
  "The `:table_id`s reached through external Dimensions from the Tables with `table-ids`, reading the Table id
  of the `input-table-id` column and returning that of the `output-table-id` column, excluding ids already in
  `exclude-table-ids`."
  [input-table-id     :- :keyword
   output-table-id    :- :keyword
   table-ids          :- [:set ::lib.schema.id/table]
   exclude-table-ids  :- [:set ::lib.schema.id/table]]
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

(mu/defn fk-remapped-table-ids-for-selectors
  "The `:table_id`s reached through external Dimensions from the Tables picked out by `selectors`, reading the
  Table id of the `input-table-id` column and returning that of the `output-table-id` column, excluding Tables
  also picked out by `selectors`."
  [input-table-id  :- :keyword
   output-table-id :- :keyword
   selectors       :- TableSelectors]
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

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database database-id))

(mu/defn databases :- [:sequential ::warehouses.schema/database]
  "The Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn tables-matching-selectors :- [:sequential ::warehouse-schema.schema/table]
  "The Tables picked out by `selectors`, a map of `:database_ids`, `:schema_ids`, and/or `:table_ids`."
  [selectors :- TableSelectors]
  (t2/select :model/Table {:where (table-selectors-where selectors)}))

(mu/defn tables-matching-selectors-in-id-order :- [:sequential ::warehouse-schema.schema/table]
  "The Tables picked out by `selectors`, in id order."
  [selectors :- TableSelectors]
  (t2/select :model/Table {:where (table-selectors-where selectors), :order-by [[:id]]}))

(mu/defn tables :- [:sequential ::warehouse-schema.schema/table]
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn update-tables! :- :int
  "Apply `changes` to the Tables with `table-ids`, returning the number updated."
  [table-ids :- [:set ::lib.schema.id/table]
   changes   :- (mut/select-keys ::warehouse-schema.schema/table.update [:data_authority :data_source :data_layer :entity_type :owner_email :owner_user_id])]
  (t2/update! :model/Table [:in table-ids] changes))

(mu/defn selection-columns-for-selectors :- [:sequential (mut/select-keys ::warehouse-schema.schema/table [:id :db_id :name :display_name :schema :is_published])]
  "Up to `limit` id, database, name, schema, and published flag of the Tables picked out by `selectors`."
  [selectors :- TableSelectors
   limit     :- ms/PositiveInt]
  (t2/select [:model/Table :id :db_id :name :display_name :schema :is_published]
             {:where (table-selectors-where selectors), :limit limit}))

(mu/defn selection-columns-for-tables :- [:sequential (mut/select-keys ::warehouse-schema.schema/table [:id :db_id :name :display_name :schema :is_published])]
  "The id, database, name, schema, and published flag of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id :name :display_name :schema :is_published] :id [:in table-ids]))

(mu/defn delete-field-values-for-tables! :- :int
  "Delete the FieldValues of the Fields of the Tables with `table-ids`, returning the number deleted."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/delete! (t2/table-name :model/FieldValues)
              :field_id [:in ^:allow-subquery {:select [:id]
                                               :from   [(t2/table-name :model/Field)]
                                               :where  [:in :table_id table-ids]}]))
