(ns metabase.parameters.db
  "Application database queries for the parameters module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (hydration definitions still use `toucan2.core`)."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.app-db.core :as mdb]
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

(defn remapped-field
  "The id and mapping-type of the Field that `field-id` remaps to via an explicit Field->Field Dimension, or —
  when `allow-implicit-uuid-remapping?` — an implicit FK->PK->Name or PK->Name mapping, or nil."
  [field-id allow-implicit-uuid-remapping?]
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

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(defn fields
  "The Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field :id [:in field-ids]))

(defn fields-fk-info
  "The id, FK target, and semantic type of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :fk_target_field_id :semantic_type] :id [:in field-ids]))

(defn field-fk-target-field-id
  "The FK target Field id of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one-fn :fk_target_field_id :model/Field field-id))

(defn field-base-type
  "The base type of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one-fn :base_type :model/Field :id field-id))

(defn field-name
  "The name of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one-fn :name :model/Field :id field-id))

(defn full-field-values-exist?
  "Whether complete, non-remapped FieldValues of type `full` exist for the Field with `field-id`."
  [field-id]
  (t2/exists? :model/FieldValues
              :field_id field-id, :values [:not= nil], :human_readable_values nil, :has_more_values false
              :type "full"))

(defn advanced-field-values-exist?
  "Whether complete, non-remapped FieldValues of type `advanced` with `hash-key` exist for the Field with `field-id`."
  [field-id hash-key]
  (t2/exists? :model/FieldValues
              :field_id field-id, :values [:not= nil], :human_readable_values nil, :has_more_values false
              :type "advanced", :hash_key hash-key))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn delete-field-values!
  "Delete the FieldValues with `id`."
  [id]
  (t2/delete! :model/FieldValues :id id))

(defn advanced-field-values
  "The advanced FieldValues of the Field with `field-id` and `hash-key`, or nil."
  [field-id hash-key]
  (t2/select-one :model/FieldValues :field_id field-id, :type :advanced, :hash_key hash-key))

(defn find-or-insert-advanced-field-values!
  "The advanced FieldValues of the Field with `field-id` and `hash-key`, inserting one built by calling
  `insert-fn` if none exists yet."
  [field-id hash-key insert-fn]
  (mdb/select-or-insert! :model/FieldValues {:field_id field-id, :type :advanced, :hash_key hash-key} insert-fn))

(defn active-name-fields-for-tables
  "The `columns` of the active `:type/Name` Fields of the Tables with `table-ids`."
  [columns table-ids]
  (t2/select (into [:model/Field] columns)
             :table_id      [:in table-ids]
             :semantic_type (mdb/isa :type/Name)
             :active        true))

(defn fields-with-columns
  "The `columns` of the Fields with `field-ids`."
  [columns field-ids]
  (t2/select (into [:model/Field] columns) :id [:in field-ids]))
