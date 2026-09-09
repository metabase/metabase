(ns metabase.parameters.db
  "Application database queries for the parameters module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (hydration definitions still use `toucan2.core`)."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(defn- format-union
  "Workaround for https://github.com/seancorfield/honeysql/issues/451. Wrap the subselects in parens, otherwise it
  will fail on Postgres."
  [_clause exprs]
  (let [[sqls args] (sql/format-expr-list exprs)
        formatted   (str/join " UNION " sqls)]
    (into [formatted] args)))

(sql/register-clause! ::union format-union :union)

(defn- implicit-pk->name-mapping-query
  [field-id mapping-type]
  ^:allow-subquery
  {:select    [[:dest.id :id] [^:allow-raw-sql [:inline mapping-type] :mapping_type]]
   :from      [[:metabase_field :source]]
   :left-join [[:metabase_table :table] [:= :source.table_id :table.id]
               [:metabase_field :dest] [:= :dest.table_id :table.id]]
   :where     [:and
               [:= :source.id field-id]
               (mdb/isa :source.semantic_type :type/PK)
               (mdb/isa :dest.semantic_type :type/Name)]
   :limit     1})

(mu/defn remapped-field :- [:maybe [:map {:closed true} [:id ms/PositiveInt] [:mapping_type :string]]]
  "The id and mapping-type of the Field that `field-id` remaps to via an explicit Field->Field Dimension, or —
  when `allow-implicit-uuid-remapping?` — an implicit FK->PK->Name or PK->Name mapping, or nil."
  [field-id                       :- ::lib.schema.id/field
   allow-implicit-uuid-remapping? :- :boolean]
  (t2/query-one
   {:select [[:mapping.id :id] [:mapping.mapping_type :mapping_type]]
    :from   [[^:allow-subquery
              {::union (into [;; Explicit FK Field->Field remapping
                              ^:allow-subquery
                              {:select [[:dimension.human_readable_field_id :id] [^:allow-raw-sql [:inline "fk->field"] :mapping_type]]
                               :from   [[:dimension :dimension]]
                               :where  [:and
                                        [:= :dimension.field_id field-id]
                                        [:not= :dimension.human_readable_field_id nil]]
                               :limit  1}]
                             (when allow-implicit-uuid-remapping?
                               [;; Implicit FK Field -> PK Field -> [Name] Field remapping
                                (implicit-pk->name-mapping-query
                                 ^:allow-subquery
                                 {:select    [:fk_target_field_id]
                                  :from      [:metabase_field]
                                  :where     [:and
                                              [:= :id field-id]
                                              (mdb/isa :semantic_type :type/FK)]
                                  :limit     1}
                                 "fk->pk->name")
                                ;; Implicit PK Field-> [Name] Field remapping
                                (implicit-pk->name-mapping-query field-id "pk->name")]))}
              :mapping]]
    :limit  1}))

(mu/defn field :- [:maybe ::warehouse-schema.schema/field]
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(mu/defn fields :- [:sequential ::warehouse-schema.schema/field]
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids]))

(def ^:private FieldsFkInfo
  "Rows returned by [[fields-fk-info]]."
  (mut/select-keys ::warehouse-schema.schema/field [:id :fk_target_field_id :semantic_type]))

(mu/defn fields-fk-info :- [:sequential FieldsFkInfo]
  "The id, FK target, and semantic type of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select [:model/Field :id :fk_target_field_id :semantic_type] :id [:in field-ids]))

(mu/defn field-fk-target-field-id :- [:maybe ::lib.schema.id/field]
  "The FK target Field id of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :fk_target_field_id :model/Field field-id))

(mu/defn field-base-type :- [:maybe :keyword]
  "The base type of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :base_type :model/Field :id field-id))

(mu/defn field-name :- [:maybe :string]
  "The name of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :name :model/Field :id field-id))

(mu/defn full-field-values-exist? :- :boolean
  "Whether complete, non-remapped FieldValues of type `full` exist for the Field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/exists? :model/FieldValues
              :field_id field-id, :values [:not= nil], :human_readable_values nil, :has_more_values false
              :type "full"))

(mu/defn advanced-field-values-exist? :- :boolean
  "Whether complete, non-remapped FieldValues of type `advanced` with `hash-key` exist for the Field with `field-id`."
  [field-id :- ::lib.schema.id/field
   hash-key :- :string]
  (t2/exists? :model/FieldValues
              :field_id field-id, :values [:not= nil], :human_readable_values nil, :has_more_values false
              :type "advanced", :hash_key hash-key))

(mu/defn card :- [:maybe ::queries.schema/card]
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn delete-field-values! :- :int
  "Delete the FieldValues with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/FieldValues :id id))

(mu/defn advanced-field-values :- [:maybe ::warehouse-schema.schema/field-values]
  "The advanced FieldValues of the Field with `field-id` and `hash-key`, or nil."
  [field-id :- ::lib.schema.id/field
   hash-key :- :string]
  (t2/select-one :model/FieldValues :field_id field-id, :type :advanced, :hash_key hash-key))

(mu/defn find-or-insert-advanced-field-values! :- ::warehouse-schema.schema/field-values
  "The advanced FieldValues of the Field with `field-id` and `hash-key`, inserting one built by calling
  `insert-fn` if none exists yet."
  [field-id  :- ::lib.schema.id/field
   hash-key  :- :string
   insert-fn :- fn?]
  (mdb/select-or-insert! :model/FieldValues {:field_id field-id, :type :advanced, :hash_key hash-key} insert-fn))

(mu/defn active-name-fields-for-tables :- [:sequential (mut/optional-keys ::warehouse-schema.schema/field)]
  "The `columns` of the active `:type/Name` Fields of the Tables with `table-ids`."
  [columns   :- [:sequential :keyword]
   table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select (into [:model/Field] columns)
             :table_id      [:in table-ids]
             :semantic_type (mdb/isa :type/Name)
             :active        true))

(mu/defn fields-with-columns :- [:sequential (mut/optional-keys ::warehouse-schema.schema/field)]
  "The `columns` of the Fields with `field-ids`."
  [columns   :- [:sequential :keyword]
   field-ids :- [:set ::lib.schema.id/field]]
  (t2/select (into [:model/Field] columns) :id [:in field-ids]))

(def ^:private FkRelationshipsForDatabase
  "Rows returned by [[fk-relationships-for-database]]."
  [:map {:closed true}
   [:f1 ms/PositiveInt]
   [:t1 ms/PositiveInt]
   [:f2 ms/PositiveInt]
   [:t2 ms/PositiveInt]])

(mu/defn fk-relationships-for-database :- [:sequential FkRelationshipsForDatabase]
  "Rows describing FK -> PK Field relationships (`:f1`/`:t1` FK Field/Table ids, `:f2`/`:t2` PK Field/Table ids)
  for active Fields in the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (mdb/query {:select    [[:fk-field.id :f1]
                          [:fk-table.id :t1]
                          [:pk-field.id :f2]
                          [:pk-field.table_id :t2]]
              :from      [[:metabase_field :fk-field]]
              :left-join [[:metabase_table :fk-table]    [:and [:= :fk-field.table_id :fk-table.id]
                                                          :fk-table.active]
                          [:metabase_database :database] [:= :fk-table.db_id :database.id]
                          [:metabase_field :pk-field]    [:and [:= :fk-field.fk_target_field_id :pk-field.id]
                                                          :pk-field.active]]
              :where     [:and
                          [:= :database.id database-id]
                          [:not= :fk-field.fk_target_field_id nil]
                          :fk-field.active]
              :order-by  [[:fk-field.id :desc]
                          [:pk-field.id :desc]]}))
