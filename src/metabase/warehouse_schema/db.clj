(ns metabase.warehouse-schema.db
  "Application database queries for the warehouse-schema module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration
  methods, and transactions."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

(mu/defn field
  "The ::warehouse-schema.schema/field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(mu/defn fields
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids]))

(mu/defn fields-by-id
  "A map of ID to ::warehouse-schema.schema/field for `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select-fn->fn :id identity :model/Field :id [:in field-ids]))

(mu/defn field-table-id-rows
  "The ID and ::warehouse-schema.schema/table ID of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select [:model/Field :id :table_id] :id [:in field-ids]))

(mu/defn field-table-id
  "The ::warehouse-schema.schema/table ID of the ::warehouse-schema.schema/field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :table_id :model/Field :id field-id))

(mu/defn field-id-by-name
  "The ID of the ::warehouse-schema.schema/field named `field-name` under `parent-id` in the ::warehouse-schema.schema/table with `table-id`, or nil."
  [table-id   :- ::lib.schema.id/table
   parent-id  :- [:maybe ms/PositiveInt]
   field-name :- :string]
  (t2/select-one-pk :model/Field :name field-name :parent_id parent-id :table_id table-id))

(mu/defn field-values-eligibility
  "The columns deciding whether the ::warehouse-schema.schema/field with `field-id` should have FieldValues, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one [:model/Field :base_type :visibility_type :has_field_values :preview_display] :id field-id))

(mu/defn field-ids-for-table
  "The IDs of the Fields of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field {:where [:= :table_id table-id]}))

(mu/defn active-field-ids-for-table
  "The IDs of the active Fields of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id :active true))

(defn- field-order-order-by
  [field-order]
  (case field-order
    :custom       [[:custom_position :asc]]
    :smart        [[[:case
                     (app-db/isa :semantic_type :type/PK)       0
                     (app-db/isa :semantic_type :type/Name)     1
                     (app-db/isa :semantic_type :type/Temporal) 2
                     :else                                     3]
                    :asc]
                   [:%lower.name :asc]]
    :database     [[:database_position :asc]]
    :alphabetical [[:%lower.name :asc]]))

(mu/defn field-ids-for-table-ordered
  "The ids of the Fields of the ::warehouse-schema.schema/table with `table-id`, ordered per `field-order` (`:custom`, `:smart`, `:database`,
  or `:alphabetical`)."
  [table-id    :- ::lib.schema.id/table
   field-order :- [:enum :custom :smart :database :alphabetical]]
  (t2/select [:model/Field :id] :table_id table-id {:order-by (field-order-order-by field-order)}))

(mu/defn active-fields-for-tables
  "The active, unretired Fields of the Tables with `table-ids`, in field order."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field
             :active true
             :table_id [:in table-ids]
             :visibility_type [:not= "retired"]
             {:order-by field-order-rule}))

(mu/defn pk-field-ids-by-table
  "A map of ::warehouse-schema.schema/table ID to the ID of its visible primary key ::warehouse-schema.schema/field for `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select-fn->fn :table_id :id :model/Field
                    :table_id [:in table-ids]
                    :semantic_type (app-db/isa :type/PK)
                    :visibility_type [:not-in ["sensitive" "retired"]]
                    {:from [[(t2/table-name :model/Field) :f]]}))

(mu/defn update-field!
  "Apply `changes` to the ::warehouse-schema.schema/field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- ::warehouse-schema.schema/field.update]
  (t2/update! :model/Field :id field-id changes))

(mu/defn update-field-custom-positions!
  "Set the `custom_position` of each ::warehouse-schema.schema/field in `field-id->position`, returning the number
  updated."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (t2/update! :model/Field :id [:in (keys field-id->position)]
              {:custom_position (into [:case] (mapcat (fn [[id position]] [[:= :id id] position])) field-id->position)}))

(mu/defn clear-fk-targets-to-field!
  "Clear the target, and an FK semantic type, of every ::warehouse-schema.schema/field targeting the
  ::warehouse-schema.schema/field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field]
  (t2/update! :model/Field {:fk_target_field_id field-id :semantic_type :type/FK} {:semantic_type nil})
  (t2/update! :model/Field {:fk_target_field_id field-id} {:fk_target_field_id nil}))

(mu/defn delete-child-fields!
  "Delete the Fields nested under the ::warehouse-schema.schema/field with `parent-id`, returning the number deleted."
  [parent-id :- ms/PositiveInt]
  (t2/delete! :model/Field :parent_id parent-id))

(mu/defn delete-fields-for-table!
  "Delete the Fields of the ::warehouse-schema.schema/table with `table-id`, returning the number deleted."
  [table-id :- ::lib.schema.id/table]
  (t2/delete! :model/Field :table_id table-id))

(mu/defn delete-implicit-actions-for-table!
  "Delete the implicit Actions that write to the Table with `table-id`, returning the number deleted."
  [table-id :- ::lib.schema.id/table]
  (if-let [action-ids (not-empty (t2/select-fn-set :action_id :model/ImplicitAction :table_id table-id))]
    (t2/delete! :model/Action :id [:in action-ids])
    0))

(mu/defn user-renamed-field-names :- [:set :string]
  "The lower-cased names, among `names`, of the Fields of the Table with `table-id` whose display name a user set.
  Uploads use it to leave those Fields alone when appending re-derives display names from the CSV header."
  [table-id :- ::lib.schema.id/table
   names    :- [:set :string]]
  (set
   (t2/select-fn-set (comp u/lower-case-en :name)
                     :model/Field
                     {:select    [:f.name]
                      :from      [[(t2/table-name :model/Field) :f]]
                      :left-join [[(t2/table-name :model/FieldUserSettings) :u] [:= :u.field_id :f.id]]
                      :where     [:and
                                  [:= :f.table_id table-id]
                                  [:in [:lower :f.name] names]
                                  [:not= :u.display_name nil]]})))

(mu/defn field-names-reducible
  "A reducible of the id, name, and display name of every ::warehouse-schema.schema/field, plus its user-set display
  name from FieldUserSettings (if any) as `:user_display_name`."
  []
  (t2/reducible-query
   {:select    [:f.id :f.name :f.display_name [:u.display_name :user_display_name]]
    :from      [[(t2/table-name :model/Field) :f]]
    :left-join [[(t2/table-name :model/FieldUserSettings) :u] [:= :u.field_id :f.id]]}))

(mu/defn set-field-display-name!
  "Set the display name of the ::warehouse-schema.schema/field with `id`, returning the number updated."
  [id           :- ::lib.schema.id/field
   display-name :- :string]
  (t2/update! :model/Field :id id {:display_name display-name}))

;;; -------------------------------------------- FieldUserSettings --------------------------------------------

(mu/defn field-user-settings
  "The FieldUserSettings of the ::warehouse-schema.schema/field with `field-id`, or nil (also for a nil `field-id`, e.g. a ::warehouse-schema.schema/field not yet
  inserted)."
  [field-id :- [:maybe ::lib.schema.id/field]]
  (t2/select-one :model/FieldUserSettings :field_id field-id))

(def ^:private field-user-settings-update-keys
  "The columns an insert or update of a FieldUserSettings accepts."
  [:field_id :created_at :updated_at :semantic_type :description :display_name :visibility_type :fk_target_field_id :has_field_values :effective_type :coercion_strategy :caveats :points_of_interest :json_unfolding :settings :data_sensitivity :custom_position :description_set :semantic_type_set :fk_target_field_id_set])

(mu/defn field-ids-with-user-settings-for-table :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the ::warehouse-schema.schema/table with `table-id` that have a FieldUserSettings row."
  [table-id :- ::lib.schema.id/table]
  (set (t2/select-fn-set :field_id :model/FieldUserSettings
                         {:from  [[(t2/table-name :model/FieldUserSettings) :u]]
                          :join  [[(t2/table-name :model/Field) :f] [:= :f.id :u.field_id]]
                          :where [:= :f.table_id table-id]})))

(mu/defn insert-field-user-settings!
  "Insert one FieldUserSettings map or a sequence of them, returning the number inserted."
  [rows :- [:or (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys) [:sequential (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys)]]]
  (t2/insert! :model/FieldUserSettings rows))

(mu/defn update-field-user-settings!
  "Apply `changes` to the FieldUserSettings of the ::warehouse-schema.schema/field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys)]
  (t2/update! :model/FieldUserSettings :field_id field-id changes))

(mu/defn update-or-insert-field-user-settings!
  "Update the FieldUserSettings of the ::warehouse-schema.schema/field with `field-id` with what `update-fn` returns
  for it, or insert what `update-fn` returns for nil when it has none."
  [field-id  :- ::lib.schema.id/field
   update-fn :- [:=> [:cat [:maybe ::warehouse-schema.schema/field-user-settings]]
                 (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys)]]
  (app-db/update-or-insert! :model/FieldUserSettings {:field_id field-id} update-fn))

(mu/defn field-ids-with-user-settings :- [:set ::lib.schema.id/field]
  "The ids, among `field-ids`, of the Fields that have a FieldUserSettings row."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (set (t2/select-fn-set :field_id :model/FieldUserSettings :field_id [:in field-ids])))

(mu/defn update-field-user-settings-custom-positions!
  "Set the `custom_position` of the FieldUserSettings of each Field in `field-id->position`, returning the number
  updated."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (t2/update! :model/FieldUserSettings :field_id [:in (keys field-id->position)]
              {:custom_position (into [:case] (mapcat (fn [[id position]] [[:= :field_id id] position])) field-id->position)}))

(mu/defn delete-field-user-settings!
  "Delete the FieldUserSettings of the Fields with `field-ids`, returning the number deleted."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (if (seq field-ids)
    (t2/delete! :model/FieldUserSettings :field_id [:in field-ids])
    0))

(mu/defn clear-user-settings-fk-targets-to-field!
  "Unset the user-set FK semantic type and target of every ::warehouse-schema.schema/field targeting the
  ::warehouse-schema.schema/field with `field-id`, by its settings or by its own row, returning the number updated."
  [field-id :- ::lib.schema.id/field]
  (let [changes {:semantic_type nil, :semantic_type_set false, :fk_target_field_id nil, :fk_target_field_id_set false}]
    (+ (t2/update! :model/FieldUserSettings {:fk_target_field_id field-id} changes)
       (t2/update! :model/FieldUserSettings
                   :semantic_type :type/FK
                   :field_id [:in ^:allow-subquery {:select [:id]
                                                    :from   [(t2/table-name :model/Field)]
                                                    :where  [:= :fk_target_field_id field-id]}]
                   changes))))

;;; -------------------------------------------- TableUserSettings --------------------------------------------

(def ^:private table-user-settings-update-keys
  "The columns an insert or update of a TableUserSettings accepts."
  [:table_id :created_at :updated_at :display_name :description :entity_type :visibility_type :caveats
   :points_of_interest :data_layer :data_source :owner_email :owner_user_id :field_order :show_in_getting_started
   :data_authority :is_published :collection_id :description_set
   :visibility_type_set :data_layer_set :data_source_set])

(mu/defn table-user-settings
  "The TableUserSettings of the ::warehouse-schema.schema/table with `table-id`, or nil (also for a nil `table-id`,
  e.g. a ::warehouse-schema.schema/table not yet inserted)."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/TableUserSettings :table_id table-id))

(mu/defn table-ids-with-user-settings :- [:set ::lib.schema.id/table]
  "The ids, among `table-ids`, of the Tables that already have a TableUserSettings row."
  [table-ids :- [:set ::lib.schema.id/table]]
  (set (t2/select-fn-set :table_id :model/TableUserSettings :table_id [:in table-ids])))

(mu/defn update-table-user-settings-for-tables!
  "Apply `changes` to the TableUserSettings of the Tables with `table-ids`, returning the number updated."
  [table-ids :- [:set ::lib.schema.id/table]
   changes   :- (mut/select-keys ::warehouse-schema.schema/table-user-settings.update table-user-settings-update-keys)]
  (t2/update! :model/TableUserSettings :table_id [:in table-ids] changes))

(mu/defn insert-table-user-settings!
  "Insert one TableUserSettings map or a sequence of them, returning the number inserted."
  [rows :- [:or (mut/select-keys ::warehouse-schema.schema/table-user-settings.update table-user-settings-update-keys) [:sequential (mut/select-keys ::warehouse-schema.schema/table-user-settings.update table-user-settings-update-keys)]]]
  (t2/insert! :model/TableUserSettings rows))

(mu/defn update-or-insert-table-user-settings!
  "Update the TableUserSettings of the ::warehouse-schema.schema/table with `table-id` with what `update-fn` returns
  for it, or insert what `update-fn` returns for nil when it has none."
  [table-id  :- ::lib.schema.id/table
   update-fn :- [:=> [:cat [:maybe ::warehouse-schema.schema/table-user-settings]]
                 (mut/select-keys ::warehouse-schema.schema/table-user-settings.update table-user-settings-update-keys)]]
  (app-db/update-or-insert! :model/TableUserSettings {:table_id table-id} update-fn))

(mu/defn update-table-user-settings!
  "Apply `changes` to the TableUserSettings of the ::warehouse-schema.schema/table with `table-id`, returning the
  number updated."
  [table-id :- ::lib.schema.id/table
   changes  :- (mut/select-keys ::warehouse-schema.schema/table-user-settings.update table-user-settings-update-keys)]
  (t2/update! :model/TableUserSettings :table_id table-id changes))

(mu/defn delete-table-user-settings!
  "Delete the TableUserSettings of the Tables with `table-ids`, returning the number deleted."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (if (seq table-ids)
    (t2/delete! :model/TableUserSettings :table_id [:in table-ids])
    0))

;;; ---------------------------------------------- FieldValues ----------------------------------------------

(mu/defn field-values-of-type
  "The FieldValues of `type` with `hash-key` for the ::warehouse-schema.schema/field with `field-id`."
  [field-id :- ::lib.schema.id/field
   type     :- [:enum :full :sandbox :impersonation :linked-filter :advanced]
   hash-key :- [:maybe :string]]
  (t2/select :model/FieldValues :field_id field-id :type type :hash_key hash-key))

(mu/defn full-field-values-for-fields
  "The full FieldValues of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select :model/FieldValues :field_id [:in field-ids] :type :full :hash_key nil))

(mu/defn full-field-values-rows
  "The ::warehouse-schema.schema/field ID and values of the full FieldValues of the ::warehouse-schema.schema/field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select [:model/FieldValues :field_id :values] :field_id field-id :type :full))

(mu/defn full-field-values-for-tables
  "The ::warehouse-schema.schema/field ID, values, and ::warehouse-schema.schema/table ID of the full FieldValues of the normal Fields of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/FieldValues :field_id :values :field.table_id]
             {:join  [[(t2/table-name :model/Field) :field]
                      [:= :metabase_fieldvalues.field_id :field.id]]
              :where [:and
                      [:in :field.table_id table-ids]
                      [:= :field.visibility_type "normal"]
                      [:= :metabase_fieldvalues.type "full"]]}))

(mu/defn full-field-values-with-human-readable-values
  "The values and human-readable values of the full FieldValues of the ::warehouse-schema.schema/field with `field-id` if it has
  human-readable values, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one [:model/FieldValues :values :human_readable_values]
                 {:where [:and
                          [:= :type "full"]
                          [:= :field_id field-id]
                          [:not= :human_readable_values nil]
                          [:not= :human_readable_values "{}"]]}))

(mu/defn field-values-last-used-at
  "The latest `last_used_at` of any FieldValues of the ::warehouse-schema.schema/field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :max-last-used-at [:model/FieldValues [[:max :last_used_at] :max-last-used-at]]
                    {:where [:= :field_id field-id]}))

(mu/defn full-field-values-by-field
  "The `columns` of the full FieldValues of the Fields with `field-ids`."
  [columns   :- [:or :keyword [:sequential :keyword]]
   field-ids :- [:set ::lib.schema.id/field]]
  (t2/select columns :field_id [:in field-ids] :type :full))

(mu/defn dimension-for-field
  "The Dimension of the ::warehouse-schema.schema/field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Dimension :field_id field-id))

(mu/defn dimensions-for-fields
  "The Dimensions of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select :model/Dimension :field_id [:in field-ids]))

(mu/defn update-field-values!
  "Apply `changes` to the FieldValues with `field-values-id`, returning the number updated."
  [field-values-id :- ms/PositiveInt
   changes         :- (mut/select-keys ::warehouse-schema.schema/field-values.update [:has_more_values :values :human_readable_values])]
  (t2/update! :model/FieldValues :id field-values-id changes))

(mu/defn find-or-insert-full-field-values!
  "The full FieldValues of the ::warehouse-schema.schema/field with `field-id`, inserting one with `has-more-values`, `values`, and no
  `human_readable_values` if none exists yet."
  [field-id       :- ::lib.schema.id/field
   has-more-values :- :boolean
   values          :- [:maybe ms/FieldValues]]
  (app-db/select-or-insert! :model/FieldValues {:field_id field-id, :type :full}
                            (constantly {:has_more_values       has-more-values
                                         :values                values
                                         :human_readable_values nil})))

(mu/defn touch-field-values!
  "Stamp `last_used_at` on the FieldValues with `field-values-id`, returning the number updated."
  [field-values-id :- ms/PositiveInt]
  (t2/update! :model/FieldValues :id field-values-id {:last_used_at :%now}))

(mu/defn delete-field-values!
  "Delete the FieldValues with `field-values-ids`, returning the number deleted."
  [field-values-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/FieldValues :id [:in field-values-ids]))

(mu/defn delete-field-values-for-field!
  "Delete every FieldValues of the ::warehouse-schema.schema/field with `field-id`, returning the number deleted."
  [field-id :- ::lib.schema.id/field]
  (t2/delete! :model/FieldValues :field_id field-id))

(mu/defn delete-field-values-of-types!
  "Delete the FieldValues of `types` of the ::warehouse-schema.schema/field with `field-id`, returning the number deleted."
  [field-id :- ::lib.schema.id/field
   types    :- [:set :keyword]]
  (t2/delete! :model/FieldValues :field_id field-id :type [:in types]))

;;; ------------------------------------------------- ::warehouse-schema.schema/table -------------------------------------------------

(mu/defn table
  "The ::warehouse-schema.schema/table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn update-table!
  "Apply `changes` to the ::warehouse-schema.schema/table with `table-id`, returning the number updated."
  [table-id :- ::lib.schema.id/table
   changes  :- ::warehouse-schema.schema/table.update]
  (t2/update! :model/Table :id table-id changes))

(mu/defn update-tables!
  "Apply `changes` to the Tables with `table-ids`, returning the number updated."
  [table-ids :- [:set ::lib.schema.id/table]
   changes   :- ::warehouse-schema.schema/table.update]
  (t2/update! :model/Table :id [:in table-ids] changes))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn table-by-name
  "The ::warehouse-schema.schema/table named `table-name` in `schema` of the ::warehouses.schema/database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/select-one :model/Table :name table-name :db_id database-id :schema schema))

(mu/defn table-name-and-schema
  "The name and schema of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :name :schema] :id table-id))

(mu/defn table-database-id
  "The ::warehouses.schema/database ID of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(defn active-tables-for-database
  "The active Tables of the Database with `database-id`."
  [database-id]
  (t2/select :model/Table :db_id database-id :active true))

(defn active-table-schemas
  "The distinct schemas of the active Tables of the Database with `database-id`, in schema order. When
  `include-hidden?` is false, restricted to Tables with no `visibility_type` (a non-nil value means the Table is
  hidden -- see `metabase.warehouse-schema.models.table/visibility-types`)."
  [database-id include-hidden?]
  (let [clauses (cond-> []
                  (not include-hidden?) (conj [:= :visibility_type nil]))]
    (t2/select-fn-set :schema :model/Table :db_id database-id :active true
                      (merge {:order-by [[:%lower.schema :asc]]}
                             (when clauses
                               {:where (into [:and] clauses)})))))

(defn active-tables-in-schema
  "The active Tables in `schema` of the Database with `database-id`, in display name order."
  [database-id schema]
  (t2/select :model/Table
             :db_id database-id
             :schema schema
             :active true
             {:order-by [[:display_name :asc]]}))

(defn active-visible-tables-in-schema
  "The active, visible Tables in `schema` of the Database with `database-id`, in display name order."
  [database-id schema]
  (t2/select :model/Table
             :db_id database-id
             :schema schema
             :active true
             :visibility_type nil
             {:order-by [[:display_name :asc]]}))

(mu/defn unarchived-segments-for-tables
  "The unarchived Segments of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Segment :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn unarchived-measures-for-tables
  "The unarchived Measures of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Measure :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn unarchived-metric-cards-for-tables
  "The unarchived metric Cards of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Card :table_id [:in table-ids] :archived false :type :metric {:order-by [[:name :asc]]}))

(mu/defn transforms-by-id
  "A map of ID to Transform for `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (t2/select-fn->fn :id identity :model/Transform :id [:in transform-ids]))

(mu/defn table-names-reducible
  "A reducible of the id, name, and display name of every ::warehouse-schema.schema/table, plus the user's own
  display name (`:user_display_name`), if any."
  []
  (t2/reducible-query
   {:select    [:t.id :t.name :t.display_name
                [:u.display_name :user_display_name]]
    :from      [[(t2/table-name :model/Table) :t]]
    :left-join [[(t2/table-name :model/TableUserSettings) :u] [:= :u.table_id :t.id]]}))

(mu/defn set-table-display-name!
  "Set the display name of the ::warehouse-schema.schema/table with `id`, returning the number updated."
  [id           :- ::lib.schema.id/table
   display-name :- :string]
  (t2/update! :model/Table :id id {:display_name display-name}))

;;; ------------------------------------------------ ::warehouses.schema/database ------------------------------------------------

(mu/defn database
  "The ::warehouses.schema/database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one :model/Database :id database-id))

(mu/defn databases-by-id
  "A map of ID to ::warehouses.schema/database for `database-ids`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (t2/select-pk->fn identity :model/Database :id [:in database-ids]))

(mu/defn database-engine
  "The engine of the ::warehouses.schema/database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :engine :model/Database :id database-id))

(mu/defn database-name
  "The name of the ::warehouses.schema/database with `database-id`."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one-fn :name :model/Database :id database-id))

;;; ---------------------------------------------- Other models ----------------------------------------------

(mu/defn collections
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Collection :id [:in collection-ids]))

(mu/defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn cards-with-moderated-status
  "The query-metadata columns of the Cards with `card-ids`, with their latest moderation status."
  [card-ids :- [:or [:set ::lib.schema.id/card] [:sequential ::lib.schema.id/card]]]
  (t2/select :model/Card
             {:select    [:c.id :c.dataset_query :c.result_metadata :c.name
                          :c.description :c.collection_id :c.database_id :c.type
                          :c.source_card_id :c.created_at :c.entity_id :c.card_schema
                          ;; required alongside :card_schema for the Card schema upgrade
                          :c.dimensions :c.dimension_mappings
                          [:r.status :moderated_status]]
              :from      [[:report_card :c]]
              :left-join [[^:allow-subquery {:select   [:moderated_item_id :status]
                                             :from     [:moderation_review]
                                             :where    [:and
                                                        [:= :moderated_item_type "card"]
                                                        [:= :most_recent true]]
                                             :order-by [[:id :desc]]
                                             :limit    1} :r]
                          [:= :r.moderated_item_id :c.id]]
              :where     [:in :c.id card-ids]}))
