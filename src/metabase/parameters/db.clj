(ns metabase.parameters.db
  "Application database queries for the parameters module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (hydration definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- nested
  "Wrap a subselect in parens so it can be used as a `:union` arm. Each arm here has its own `:limit`, which Postgres
  rejects unless the arm is parenthesized."
  [query]
  ^:allow-subquery {:nest query})

(def ^:private mapping-type-code->name
  "Each `:union` arm in [[remapped-field]] tags its row with the kind of remapping it found. The tag is a small integer
  rather than the name itself because only numbers get spliced into the SQL as literals -- a string would become a `?`
  parameter, and H2 cannot work out the type of a parameter that sits in the same position in every arm of a `UNION`."
  {1 "fk->field"
   2 "fk->pk->name"
   3 "pk->name"})

(def ^:private mapping-type-name->code
  (into {} (map (fn [[code mapping-type]] [mapping-type code])) mapping-type-code->name))

(defn- implicit-pk->name-mapping-query
  [field-id mapping-type]
  ^:allow-subquery
  {:select    [[:dest.id :id] [(mapping-type-name->code mapping-type) :mapping_type]]
   :from      [[(t2/table-name :model/Field) :source]]
   :left-join [[:metabase_table :table] [:= :source.table_id :table.id]
               [(t2/table-name :model/Field) :dest] [:= :dest.table_id :table.id]]
   :where     [:and
               [:= :source.id field-id]
               (mdb/isa :source.semantic_type :type/PK)
               (mdb/isa :dest.semantic_type :type/Name)]
   :limit     1})

(mu/defn remapped-field
  "The id and mapping-type of the Field that `field-id` remaps to via an explicit Field->Field Dimension, or —
  when `allow-implicit-uuid-remapping?` — an implicit FK->PK->Name or PK->Name mapping, or nil."
  [field-id                       :- ::lib.schema.id/field
   allow-implicit-uuid-remapping? :- :boolean]
  (some-> (t2/query-one
           {:select [[:mapping.id :id] [:mapping.mapping_type :mapping_type]]
            :from   [[^:allow-subquery
                      {:union (into [;; Explicit FK Field->Field remapping
                                     (nested
                                      ^:allow-subquery
                                      {:select [[:dimension.human_readable_field_id :id]
                                                [(mapping-type-name->code "fk->field") :mapping_type]]
                                       :from   [[:dimension :dimension]]
                                       :where  [:and
                                                [:= :dimension.field_id field-id]
                                                [:not= :dimension.human_readable_field_id nil]]
                                       :limit  1})]
                                    (when allow-implicit-uuid-remapping?
                                      [;; Implicit FK Field -> PK Field -> [Name] Field remapping
                                       (nested
                                        (implicit-pk->name-mapping-query
                                         ^:allow-subquery
                                         {:select [:fk_target_field_id]
                                          :from   [(t2/table-name :model/Field)]
                                          :where  [:and
                                                   [:= :id field-id]
                                                   (mdb/isa :semantic_type :type/FK)]
                                          :limit  1}
                                         "fk->pk->name"))
                                       ;; Implicit PK Field-> [Name] Field remapping
                                       (nested (implicit-pk->name-mapping-query field-id "pk->name"))]))}
                      :mapping]]
            :limit  1})
          (update :mapping_type mapping-type-code->name)))

(mu/defn field
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(mu/defn fields
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (mdb/select-batched #(t2/select :model/Field :id [:in %]) field-ids))

(mu/defn table-database-ids :- [:map-of ::lib.schema.id/table ::lib.schema.id/database]
  "The Database id of each of the Tables with `table-ids`, by Table id."
  [table-ids :- [:set ::lib.schema.id/table]]
  (mdb/select-batched-map #(t2/select-pk->fn :db_id :model/Table :id [:in [:auto/param %]]) table-ids))

(mu/defn fields-fk-info
  "The id, FK target, and semantic type of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (mdb/select-batched #(t2/select [:model/Field :id :fk_target_field_id :semantic_type] :id [:in %]) field-ids))

(mu/defn field-fk-target-field-id
  "The FK target Field id of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :fk_target_field_id :model/Field :id field-id))

(mu/defn field-base-type
  "The base type of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :base_type :model/Field :id field-id))

(mu/defn field-name
  "The name of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :name :model/Field :id field-id))

(mu/defn full-field-values-exist?
  "Whether complete, non-remapped FieldValues of type `full` exist for the Field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/exists? :model/FieldValues
              :field_id field-id, :values [:not= nil], :human_readable_values nil, :has_more_values false
              :type "full"))

(mu/defn advanced-field-values-exist?
  "Whether complete, non-remapped FieldValues of type `advanced` with `hash-key` exist for the Field with `field-id`."
  [field-id :- ::lib.schema.id/field
   hash-key :- :string]
  (t2/exists? :model/FieldValues
              :field_id field-id, :values [:not= nil], :human_readable_values nil, :has_more_values false
              :type "advanced", :hash_key hash-key))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn advanced-field-values
  "The advanced FieldValues of the Field with `field-id` and `hash-key`, or nil."
  [field-id :- ::lib.schema.id/field
   hash-key :- :string]
  (t2/select-one :model/FieldValues :field_id field-id, :type :advanced, :hash_key hash-key))

(mu/defn advanced-field-values-of-fields
  "The advanced FieldValues of the Fields with `field-ids` whose hash key is one of `hash-keys`, by descending id."
  [field-ids :- [:sequential ::lib.schema.id/field]
   hash-keys :- [:sequential :string]]
  (->> (mdb/select-batched (fn [field-ids]
                             (mdb/select-batched #(t2/select :model/FieldValues :field_id [:in field-ids], :type :advanced, :hash_key [:in %]
                                                             {:order-by [[:id :desc]]})
                                                 hash-keys))
                           field-ids)
       (sort-by :id #(compare %2 %1))
       vec))

(mu/defn active-name-fields-for-tables
  "The `columns` of the active `:type/Name` Fields of the Tables with `table-ids`."
  [columns   :- [:sequential :keyword]
   table-ids :- [:sequential ::lib.schema.id/table]]
  (mdb/select-batched #(t2/select (into [:model/Field] columns)
                                  :table_id      [:in %]
                                  :semantic_type (mdb/isa :type/Name)
                                  :active        true)
                      table-ids))

(mu/defn fields-with-columns
  "The `columns` of the Fields with `field-ids`."
  [columns   :- [:sequential :keyword]
   field-ids :- [:set ::lib.schema.id/field]]
  (mdb/select-batched #(t2/select (into [:model/Field] columns) :id [:in %]) field-ids))

(mu/defn fk-relationships-for-database
  "Rows describing FK -> PK Field relationships (`:f1`/`:t1` FK Field/Table ids, `:f2`/`:t2` PK Field/Table ids)
  for active Fields in the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (mdb/query {:select    [[:fk-field.id :f1]
                          [:fk-table.id :t1]
                          [:pk-field.id :f2]
                          [:pk-field.table_id :t2]]
              :from      [[(t2/table-name :model/Field) :fk-field]]
              :left-join [[:metabase_table :fk-table]    [:and [:= :fk-field.table_id :fk-table.id]
                                                          :fk-table.active]
                          [:metabase_database :database] [:= :fk-table.db_id :database.id]
                          [(t2/table-name :model/Field) :pk-field] [:and [:= :fk-field.fk_target_field_id :pk-field.id]
                                                                    :pk-field.active]]
              :where     [:and
                          [:= :database.id database-id]
                          [:not= :fk-field.fk_target_field_id nil]
                          :fk-field.active]
              :order-by  [[:fk-field.id :desc]
                          [:pk-field.id :desc]]}))
