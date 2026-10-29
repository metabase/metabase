(ns metabase.parameters.db
  "Application database queries for the parameters module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (hydration definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
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
   :from      [(warehouse-schema-overlay/field-query {:alias :source})]
   :left-join [[:metabase_table :table] [:= :source.table_id :table.id]
               (warehouse-schema-overlay/field-query {:alias :dest}) [:= :dest.table_id :table.id]]
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
                                          :from   [(warehouse-schema-overlay/field-query)]
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

(mu/defn delete-field-values!
  "Delete the FieldValues with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/FieldValues :id id))

(mu/defn find-or-insert-advanced-field-values!
  "The advanced FieldValues of the Field with `field-id` and `hash-key`, inserting one built by calling
  `insert-fn` if none exists yet."
  [field-id  :- ::lib.schema.id/field
   hash-key  :- :string
   insert-fn :- fn?]
  (mdb/select-or-insert! :model/FieldValues {:field_id field-id, :type :advanced, :hash_key hash-key} insert-fn))

(mu/defn fk-relationships-for-database
  "Rows describing FK -> PK Field relationships (`:f1`/`:t1` FK Field/Table ids, `:f2`/`:t2` PK Field/Table ids)
  for active Fields in the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (mdb/query {:select    [[:fk-field.id :f1]
                          [:fk-table.id :t1]
                          [:pk-field.id :f2]
                          [:pk-field.table_id :t2]]
              :from      [(warehouse-schema-overlay/field-query {:alias :fk-field})]
              :left-join [[:metabase_table :fk-table]    [:and [:= :fk-field.table_id :fk-table.id]
                                                          :fk-table.active]
                          [:metabase_database :database] [:= :fk-table.db_id :database.id]
                          (warehouse-schema-overlay/field-query {:alias :pk-field}) [:and [:= :fk-field.fk_target_field_id :pk-field.id]
                                                                                     :pk-field.active]]
              :where     [:and
                          [:= :database.id database-id]
                          [:not= :fk-field.fk_target_field_id nil]
                          :fk-field.active]
              :order-by  [[:fk-field.id :desc]
                          [:pk-field.id :desc]]}))
