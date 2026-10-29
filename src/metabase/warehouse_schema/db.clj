(ns metabase.warehouse-schema.db
  "Application database queries for the warehouse-schema module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration
  methods, and transactions."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.db :as models.db]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

(mu/defn field :- [:maybe ::warehouse-schema.schema/field]
  "The ::warehouse-schema.schema/field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id [:auto/param field-id] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn field-in-path
  "The ::warehouse-schema.schema/field named by the last of `field-names` (each nested inside the previous, bottom-most first) under
  `table-id`, or nil. See `metabase.models.db/field-in-path`, which owns the shared query."
  [table-id    :- [:maybe ::lib.schema.id/table]
   field-names :- [:sequential :string]]
  (models.db/field-in-path table-id field-names))

(mu/defn fields
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn fields-by-id
  "A map of ID to ::warehouse-schema.schema/field for `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select-fn->fn :id identity :model/Field :id [:in field-ids] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn field-table-id-rows
  "The ID and ::warehouse-schema.schema/table ID of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select [:model/Field :id :table_id] :id [:in field-ids] {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn field-id-by-name
  "The ID of the ::warehouse-schema.schema/field named `field-name` under `parent-id` in the ::warehouse-schema.schema/table with `table-id`, or nil."
  [table-id   :- ::lib.schema.id/table
   parent-id  :- [:maybe ms/PositiveInt]
   field-name :- :string]
  (t2/select-one-pk :model/Field :name field-name :parent_id parent-id :table_id table-id {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn field-ids-for-table
  "The IDs of the Fields of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]
                                   :where [:= :table_id table-id]}))

(mu/defn active-field-ids-for-table
  "The IDs of the active Fields of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id :active true {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

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
  (t2/select [:model/Field :id] :table_id table-id {:from     [(warehouse-schema-overlay/field-query)]
                                                    :order-by (field-order-order-by field-order)}))

(mu/defn active-fields-for-tables
  "The active, unretired Fields of the Tables with `table-ids`, in field order."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field
             :active true
             :table_id [:in table-ids]
             :visibility_type [:not= "retired"]
             {:from [(warehouse-schema-overlay/field-query)]
              :order-by field-order-rule}))

(mu/defn pk-field-ids-by-table
  "A map of ::warehouse-schema.schema/table ID to the ID of its visible primary key ::warehouse-schema.schema/field for `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select-fn->fn :table_id :id :model/Field
                    :table_id [:in table-ids]
                    :semantic_type (app-db/isa :type/PK)
                    :visibility_type [:not-in ["sensitive" "retired"]]
                    {:from [(warehouse-schema-overlay/field-query {:alias :f})]}))

(mu/defn update-field!
  "Apply `changes` to the ::warehouse-schema.schema/field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- (mut/select-keys ::warehouse-schema.schema/field.update [:position])]
  (t2/update! :model/Field field-id changes))

(mu/defn clear-fk-targets-to-field!
  "Clear the FK semantic type and target of every ::warehouse-schema.schema/field targeting the ::warehouse-schema.schema/field with `field-id`, returning the number
  updated."
  [field-id :- ::lib.schema.id/field]
  (t2/update! :model/Field {:fk_target_field_id field-id} {:semantic_type nil, :fk_target_field_id nil}))

(mu/defn delete-child-fields!
  "Delete the Fields nested under the ::warehouse-schema.schema/field with `parent-id`, returning the number deleted."
  [parent-id :- ms/PositiveInt]
  (t2/delete! :model/Field :parent_id parent-id))

(mu/defn delete-fields-for-table!
  "Delete the Fields of the ::warehouse-schema.schema/table with `table-id`, returning the number deleted."
  [table-id :- ::lib.schema.id/table]
  (t2/delete! :model/Field :table_id table-id))

(mu/defn user-renamed-field-names :- [:set :string]
  "The lower-cased names, among `names`, of the Fields of the Table with `table-id` whose display name a user set.
  Uploads use it to leave those Fields alone when appending re-derives display names from the CSV header."
  [table-id :- ::lib.schema.id/table
   names    :- [:set :string]]
  (set
   (t2/select-fn-set (comp u/lower-case-en :name)
                     :model/Field
                     {:select    [:f.name]
                      :from      [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false})]
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
    :from      [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false})]
    :left-join [[(t2/table-name :model/FieldUserSettings) :u] [:= :u.field_id :f.id]]}))

(mu/defn set-field-display-name!
  "Set the display name of the ::warehouse-schema.schema/field with `id`, returning the number updated."
  [id           :- ::lib.schema.id/field
   display-name :- :string]
  (t2/update! :model/Field id {:display_name display-name}))

;;; -------------------------------------------- FieldUserSettings --------------------------------------------

(mu/defn field-user-settings
  "The FieldUserSettings of the ::warehouse-schema.schema/field with `field-id`, or nil (also for a nil `field-id`, e.g. a ::warehouse-schema.schema/field not yet
  inserted)."
  [field-id :- [:maybe ::lib.schema.id/field]]
  (t2/select-one :model/FieldUserSettings :field_id field-id))

(mu/defn field-user-settings-exist?
  "Whether the ::warehouse-schema.schema/field with `field-id` has a FieldUserSettings row."
  [field-id :- ::lib.schema.id/field]
  (t2/exists? :model/FieldUserSettings field-id))

(def ^:private field-user-settings-update-keys
  "The columns an insert or update of a FieldUserSettings accepts."
  [:field_id :created_at :updated_at :semantic_type :description :display_name :visibility_type :fk_target_field_id :has_field_values :effective_type :coercion_strategy :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity :custom_position :description_set :semantic_type_set :fk_target_field_id_set])

(mu/defn field-ids-with-user-settings-for-table :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the ::warehouse-schema.schema/table with `table-id` that have a FieldUserSettings row."
  [table-id :- ::lib.schema.id/table]
  (set (t2/select-fn-set :field_id :model/FieldUserSettings
                         {:from  [[(t2/table-name :model/FieldUserSettings) :u]]
                          :join  [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false}) [:= :f.id :u.field_id]]
                          :where [:= :f.table_id table-id]})))

(mu/defn dimension-ids-for-table :- [:set ::lib.schema.id/dimension]
  "The ids of the Dimensions of the Fields of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (set (t2/select-pks-set :model/Dimension
                          {:from  [[(t2/table-name :model/Dimension) :d]]
                           :join  [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false}) [:= :f.id :d.field_id]]
                           :where [:= :f.table_id table-id]})))

(mu/defn field-user-settings-for-tables
  "The FieldUserSettings of the Fields of `table-ids`, each with its Field's `:table_id`, in Field name order."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/FieldUserSettings
             {:select   [:u.* [:f.table_id :table_id] [:f.name :field_name]]
              :from     [[(t2/table-name :model/FieldUserSettings) :u]]
              :join     [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false}) [:= :f.id :u.field_id]]
              :where    [:in :f.table_id table-ids]
              :order-by [[:f.name :asc]]}))

(mu/defn insert-field-user-settings!
  "Insert one FieldUserSettings map or a sequence of them, returning the number inserted."
  [rows :- [:or (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys) [:sequential (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys)]]]
  (t2/insert! :model/FieldUserSettings rows))

(mu/defn update-field-user-settings!
  "Apply `changes` to the FieldUserSettings of the ::warehouse-schema.schema/field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys)]
  (t2/update! :model/FieldUserSettings field-id changes))

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
  "Delete the FieldUserSettings of the ::warehouse-schema.schema/field with `field-id`, returning the number deleted."
  [field-id :- ::lib.schema.id/field]
  (t2/delete! :model/FieldUserSettings :field_id field-id))

(mu/defn clear-user-settings-fk-targets-to-field!
  "Unset the user-set FK semantic type and target of every ::warehouse-schema.schema/field targeting the
  ::warehouse-schema.schema/field with `field-id`, so the sync values show again. Returns the number updated."
  [field-id :- ::lib.schema.id/field]
  (t2/update! :model/FieldUserSettings {:fk_target_field_id field-id}
              {:semantic_type nil, :semantic_type_set false, :fk_target_field_id nil, :fk_target_field_id_set false}))

;;; -------------------------------------------- TableUserSettings --------------------------------------------

(def ^:private table-user-settings-update-keys
  "The columns an insert or update of a TableUserSettings accepts."
  [:table_id :created_at :updated_at :display_name :description :entity_type :visibility_type :caveats
   :points_of_interest :data_layer :data_source :owner_email :owner_user_id :field_order :show_in_getting_started
   :data_authority :is_published :collection_id :description_set
   :visibility_type_set :caveats_set :points_of_interest_set :data_layer_set :data_source_set])

(mu/defn table-user-settings
  "The TableUserSettings of the ::warehouse-schema.schema/table with `table-id`, or nil (also for a nil `table-id`,
  e.g. a ::warehouse-schema.schema/table not yet inserted)."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/TableUserSettings :table_id table-id))

(mu/defn table-user-settings-exist?
  "Whether the ::warehouse-schema.schema/table with `table-id` has a TableUserSettings row."
  [table-id :- ::lib.schema.id/table]
  (t2/exists? :model/TableUserSettings table-id))

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

(mu/defn update-table-user-settings!
  "Apply `changes` to the TableUserSettings of the ::warehouse-schema.schema/table with `table-id`, returning the
  number updated."
  [table-id :- ::lib.schema.id/table
   changes  :- (mut/select-keys ::warehouse-schema.schema/table-user-settings.update table-user-settings-update-keys)]
  (t2/update! :model/TableUserSettings table-id changes))

(mu/defn delete-table-user-settings!
  "Delete the TableUserSettings of the ::warehouse-schema.schema/table with `table-id`, returning the number deleted."
  [table-id :- ::lib.schema.id/table]
  (t2/delete! :model/TableUserSettings :table_id table-id))

(mu/defn delete-field-user-settings-for-table!
  "Delete the FieldUserSettings of the Fields of the ::warehouse-schema.schema/table with `table-id`, returning the
  number deleted."
  [table-id :- ::lib.schema.id/table]
  (t2/delete! :model/FieldUserSettings
              {:where [:exists ^:allow-subquery
                       {:select 1
                        :from   [[(t2/table-name :model/Field) :f]]
                        :where  [:and [:= :f.id :field_id] [:= :f.table_id table-id]]}]}))

(mu/defn table-user-settings-for-tables
  "The TableUserSettings of the Tables with `table-ids`, or every TableUserSettings when nil."
  [table-ids :- [:maybe [:sequential ::lib.schema.id/table]]]
  (if table-ids
    (t2/select :model/TableUserSettings :table_id [:in table-ids])
    (t2/select :model/TableUserSettings)))

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
             {:join  [(warehouse-schema-overlay/field-query {:alias :field})
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
  (t2/update! :model/FieldValues field-values-id changes))

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
  (t2/update! :model/FieldValues field-values-id {:last_used_at :%now}))

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

(mu/defn table :- [:maybe ::warehouse-schema.schema/table]
  "The ::warehouse-schema.schema/table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id [:auto/param table-id] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]
  (t2/select :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table-by-name
  "The ::warehouse-schema.schema/table named `table-name` in `schema` of the ::warehouses.schema/database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/select-one :model/Table :name table-name :db_id database-id :schema schema {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn active-tables-for-database
  "The active Tables of the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/select :model/Table :db_id [:auto/param database-id] :active true {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn active-table-schemas
  "The distinct schemas of the active Tables of the Database with `database-id`, in schema order, restricted to Tables with no `visibility_type` (a non-nil value means the Table is hidden -- see `metabase.warehouse-schema.models.table/visibility-types`) unless `include-hidden?`."
  [{:keys [database-id include-hidden?]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:include-hidden? :boolean]]]
  (let [clauses (cond-> []
                  (not include-hidden?) (conj [:= :visibility_type nil]))]
    (t2/select-fn-set :schema :model/Table :db_id [:auto/param database-id] :active true
                      (merge {:from     [(warehouse-schema-overlay/table-query)]
                              :order-by [[:%lower.schema :asc]]}
                             (when clauses
                               {:where (into [:and] clauses)})))))

(mu/defn active-tables-in-schema
  "The active Tables in `schema` of the Database with `database-id`, in display name order."
  [{:keys [database-id schema]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema [:maybe :string]]]]
  (t2/select :model/Table
             :db_id [:auto/param database-id]
             :schema schema
             :active true
             {:from     [(warehouse-schema-overlay/table-query)]
              :order-by [[:display_name :asc]]}))

(mu/defn active-visible-tables-in-schema
  "The active, visible Tables in `schema` of the Database with `database-id`, in display name order."
  [{:keys [database-id schema]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema [:maybe :string]]]]
  (t2/select :model/Table
             :db_id [:auto/param database-id]
             :schema schema
             :active true
             :visibility_type nil
             {:from     [(warehouse-schema-overlay/table-query)]
              :order-by [[:display_name :asc]]}))

(mu/defn table-names-reducible
  "A reducible of the id, name, and display name of every ::warehouse-schema.schema/table, plus the user's own
  display name (`:user_display_name`), if any."
  []
  (t2/reducible-query
   {:select    [:t.id :t.name :t.display_name
                [:u.display_name :user_display_name]]
    :from      [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})]
    :left-join [[(t2/table-name :model/TableUserSettings) :u] [:= :u.table_id :t.id]]}))

(mu/defn set-table-display-name!
  "Set the display name of the ::warehouse-schema.schema/table with `id`, returning the number updated."
  [id           :- ::lib.schema.id/table
   display-name :- :string]
  (t2/update! :model/Table id {:display_name display-name}))

;;; ------------------------------------------------ ::warehouses.schema/database ------------------------------------------------

(mu/defn databases-by-id
  "A map of ID to ::warehouses.schema/database for `database-ids`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (t2/select-pk->fn identity :model/Database :id [:in database-ids]))

(mu/defn database-id-by-name
  "The ID of the ::warehouses.schema/database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one-pk :model/Database :name database-name))

;;; ---------------------------------------------- Other models ----------------------------------------------

;;; ------------------------------------------ Reads for other modules ------------------------------------------

(mu/defn fields-by-ids
  "The Fields with `field-ids`, restricted to `columns` when given, with user settings applied unless `user-settings?` is false."
  [{:keys [field-ids columns user-settings?]}
   :- [:map {:closed true}
       [:field-ids ::warehouse-schema.schema/field-ids]
       [:columns {:optional true} ::warehouse-schema.schema/columns]
       [:user-settings? {:optional true} :boolean]]]
  (t2/select (if columns (into [:model/Field] columns) :model/Field)
             :id [:in field-ids]
             {:from [(warehouse-schema-overlay/field-query {:user-settings? (not (false? user-settings?))})]}))

(mu/defn tables-by-ids
  "The Tables with `table-ids`, restricted to `columns` when given, with user settings applied unless `user-settings?` is false."
  [{:keys [table-ids columns user-settings?]}
   :- [:map {:closed true}
       [:table-ids ::warehouse-schema.schema/table-ids]
       [:columns {:optional true} ::warehouse-schema.schema/columns]
       [:user-settings? {:optional true} :boolean]]]
  (t2/select (if columns (into [:model/Table] columns) :model/Table)
             :id [:in table-ids]
             {:from [(warehouse-schema-overlay/table-query {:user-settings? (not (false? user-settings?))})]}))

(mu/defn database-ids-of-tables :- [:set ::lib.schema.id/database]
  "The ids of the Databases of the Tables with `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select-fn-set :db_id :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn table-id->database-id :- [:map-of ::lib.schema.id/table ::lib.schema.id/database]
  "A map of Table id to Database id for the Tables with `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select-pk->fn :db_id :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn database-id-of-table :- [:maybe ::lib.schema.id/database]
  "The id of the Database of the Table with `table-id`, or nil."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select-one-fn :db_id :model/Table :id [:auto/param table-id] {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn database-id-of-segment :- [:maybe ::lib.schema.id/database]
  "The id of the Database of the Table of the Segment with `segment-id`, or nil."
  [{:keys [segment-id]} :- [:map {:closed true} [:segment-id ::lib.schema.id/segment]]]
  (t2/select-one-fn :db_id :model/Table
                    {:select [:t.db_id]
                     :from   [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})]
                     :join   [[:segment :m] [:= :t.id :m.table_id]]
                     :where  [:= :m.id [:auto/param segment-id]]}))

(mu/defn table-locations-of-databases
  "The id, Database id, and schema of the Tables of the Databases with `database-ids`, only the active ones when `active?`."
  [{:keys [database-ids active?]}
   :- [:map {:closed true}
       [:database-ids [:sequential ::lib.schema.id/database]]
       [:active? {:optional true} :boolean]]]
  (t2/select [:model/Table :id :db_id :schema]
             {:from  [(warehouse-schema-overlay/table-query {:user-settings? false})]
              :where [:and
                      [:in :db_id database-ids]
                      (when active? [:= :active true])]}))

(mu/defn active-tables-of-databases
  "The active Tables of the Databases with `database-ids`, in database then case-insensitive display name order."
  [{:keys [database-ids]} :- [:map {:closed true} [:database-ids [:sequential ::lib.schema.id/database]]]]
  (t2/select :model/Table
             :db_id  [:in database-ids]
             :active true
             {:from     [(warehouse-schema-overlay/table-query)]
              :order-by [[:db_id :asc] [:%lower.display_name :asc]]}))

(mu/defn table-ids-of-database :- [:set ::lib.schema.id/table]
  "The ids of the Tables of the Database with `database-id`, only the active ones when `active?`."
  [{:keys [database-id active?]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:active? {:optional true} :boolean]]]
  (t2/select-pks-set :model/Table
                     {:from  [(warehouse-schema-overlay/table-query {:user-settings? false})]
                      :where [:and
                              [:= :db_id [:auto/param database-id]]
                              (when active? [:= :active true])]}))

(mu/defn pk-fields-of-tables
  "The primary-key Fields of the Tables with `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select :model/Field :table_id [:in table-ids] :semantic_type (app-db/isa :type/PK)
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn database-has-fields? :- :boolean
  "Whether any Field belongs to a Table of the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/exists? :model/Field
              :table_id [:in ^:allow-subquery {:from   [(warehouse-schema-overlay/table-query {:user-settings? false})]
                                               :select [:id]
                                               :where  [:= :db_id [:auto/param database-id]]}]
              {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn active-tables-matching-names
  "The active Tables of the Database with `database-id` matching one of `tables` (each a map of `:table` and optional `:schema`), by case-insensitive name and schema."
  [{:keys [database-id tables]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:tables [:sequential [:map {:closed true}
                              [:table :string]
                              [:schema {:optional true} [:maybe :string]]]]]]]
  (t2/select :model/Table
             {:from  [(warehouse-schema-overlay/table-query)]
              :where [:and
                      [:= :db_id [:auto/param database-id]]
                      [:= :active true]
                      (into [:or]
                            (map (fn [{:keys [schema table]}]
                                   (let [table-lower (u/lower-case-en table)]
                                     (if schema
                                       [:and
                                        [:= [:lower :name] [:auto/param table-lower]]
                                        [:= [:lower :schema] [:auto/param (u/lower-case-en schema)]]]
                                       [:= [:lower :name] [:auto/param table-lower]]))))
                            tables)]}))

(mu/defn active-visible-tables-of-database
  "The `columns` of the active, unhidden Tables of the Database with `database-id`, restricted to `table-ids` and `limit` rows when given."
  [{:keys [database-id columns table-ids limit]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:columns ::warehouse-schema.schema/columns]
       [:table-ids {:optional true} ::warehouse-schema.schema/table-ids]
       [:limit {:optional true} ms/PositiveInt]]]
  (t2/select (into [:model/Table] columns)
             (cond-> {:from  [(warehouse-schema-overlay/table-query)]
                      :where [:and
                              [:= :db_id [:auto/param database-id]]
                              [:= :active true]
                              [:= :visibility_type nil]
                              (when table-ids [:in :id table-ids])]}
               limit (assoc :limit limit))))

(mu/defn active-table-summaries-of-database
  "The id, names, schema, Database id, and description of the active Tables of the Database with `database-id`, ordered by schema and name."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
             :db_id database-id
             :active true
             {:from     [(warehouse-schema-overlay/table-query)]
              :order-by [[:%lower.schema :asc] [:%lower.name :asc]]}))

(mu/defn active-table-summaries-in-schema
  "The id, names, schema, Database id, and description of the active Tables in `schema` of the Database with `database-id`, ordered by name."
  [{:keys [database-id schema]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema [:maybe :string]]]]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
             :db_id database-id
             :schema schema
             :active true
             {:from     [(warehouse-schema-overlay/table-query)]
              :order-by [[:%lower.name :asc]]}))

(mu/defn field-id->table-id :- [:map-of ::lib.schema.id/field ::lib.schema.id/table]
  "A map of Field id to Table id for `field-ids`."
  [{:keys [field-ids]} :- [:map {:closed true} [:field-ids ::warehouse-schema.schema/field-ids]]]
  (t2/select-fn->fn :id :table_id [:model/Field :id :table_id] :id [:in field-ids]
                    {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn table-ids-of-fields :- [:set ::lib.schema.id/table]
  "The ids of the Tables of the Fields with `field-ids`."
  [{:keys [field-ids]} :- [:map {:closed true} [:field-ids ::warehouse-schema.schema/field-ids]]]
  (t2/select-fn-set :table_id :model/Field :id [:in field-ids]
                    {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn field-names-of-table
  "The names of the Fields of the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select-fn-vec :name [:model/Field :name] :table_id [:auto/param table-id]
                    {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn field-id-names-of-table
  "The id and name of the Fields of the Table with `table-id`, restricted to those named in `field-names` when given."
  [{:keys [table-id field-names]}
   :- [:map {:closed true}
       [:table-id ::lib.schema.id/table]
       [:field-names {:optional true} [:or [:set :string] [:sequential :string]]]]]
  (t2/select [:model/Field :id :name]
             {:from  [(warehouse-schema-overlay/field-query {:user-settings? false})]
              :where [:and
                      [:= :table_id [:auto/param table-id]]
                      (when field-names [:in :name field-names])]}))

(mu/defn json-field-names-with-unfolding-disabled
  "The names of the JSON Fields of the Table with `table-id` that have JSON unfolding disabled."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select-fn-set :name [:model/Field :name]
                    :table_id [:auto/param table-id]
                    :base_type :type/JSON
                    :json_unfolding false
                    {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn unpublished-table-names :- [:set :string]
  "The names of the unpublished Tables among `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select-fn-set :name [:model/Table :name] :id [:in table-ids] :is_published false
                    {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table-id-schema-rows-excluding
  "The id and schema of the Tables of the Database with `database-id` other than `excluded-table-ids`."
  [{:keys [database-id excluded-table-ids]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:excluded-table-ids [:sequential ::lib.schema.id/table]]]]
  (t2/select [:model/Table :id :schema]
             {:from  [(warehouse-schema-overlay/table-query {:user-settings? false})]
              :where [:and
                      [:= :db_id [:auto/param database-id]]
                      [:not [:in :id excluded-table-ids]]]}))

(mu/defn table-locations-of-database
  "The id, Database id, and schema of the Tables of the Database with `database-id`, restricted to `schema` when the key is given."
  [{:keys [database-id schema] :as opts}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema {:optional true} [:maybe :string]]]]
  (t2/select [:model/Table :id :db_id :schema]
             {:from  [(warehouse-schema-overlay/table-query {:user-settings? false})]
              :where [:and
                      [:= :db_id [:auto/param database-id]]
                      (when (contains? opts :schema) [:= :schema schema])]}))

(mu/defn tables-in-schema
  "The Tables in `schema` of the Database with `database-id`."
  [{:keys [database-id schema]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema [:maybe :string]]]]
  (t2/select :model/Table :db_id [:auto/param database-id] :schema schema {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn sibling-tables
  "The active, unhidden Tables in `schema` of the Database with `database-id` other than the Table with `table-id`."
  [{:keys [database-id schema table-id]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema [:maybe :string]]
       [:table-id [:maybe ::lib.schema.id/table]]]]
  (t2/select :model/Table
             :db_id database-id
             :schema schema
             :id [:not= table-id]
             :visibility_type nil
             :active true
             {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn candidate-tables-with-field-stats
  "The active, unhidden Tables of the Database with `database-id` (restricted to `schema` when given) that have fields other than primary and foreign keys, each with its field count and whether it is list-like."
  [{:keys [database-id schema]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema {:optional true} [:maybe :string]]]]
  (t2/select [:model/Table :id :schema :display_name :entity_type :db_id
              [:ts.count :num-fields]
              [[:and
                [:>= :ts.count 2]
                [:= :ts.count_non_pks 1]]
               :list-like?]]
             {:from       [(warehouse-schema-overlay/table-query)]
              :inner-join [[^:allow-subquery
                            {:select   [:f.table_id
                                        [:%count.* :count]
                                        [[:count [:case
                                                  [:or
                                                   [:not= :semantic_type "type/PK"]
                                                   [:= :f.semantic_type nil]]
                                                  [:inline 1]
                                                  :else
                                                  [:inline nil]]]
                                         :count_non_pks]
                                        [[:count [:case
                                                  [:in :f.semantic_type ["type/PK" "type/FK"]]
                                                  [:inline 1]
                                                  :else
                                                  [:inline nil]]]
                                         :count_pks_and_fks]]
                             :from     [(warehouse-schema-overlay/field-query {:alias :f})]
                             :where    [:= :f.active true]
                             :group-by [:f.table_id]}
                            :ts]
                           [:and
                            [:= :ts.table_id :id]
                            [:> :ts.count 0]
                            [:!= :ts.count :ts.count_pks_and_fks]]]
              :where      (cond-> [:and
                                   [:= :db_id [:auto/param database-id]]
                                   [:= :visibility_type nil]
                                   [:= :active true]]
                            schema (conj [:= :schema [:auto/param schema]]))}))

(mu/defn fields-targeting
  "The Fields whose foreign key targets the Field with `field-id`."
  [{:keys [field-id]} :- [:map {:closed true} [:field-id ::lib.schema.id/field]]]
  (t2/select :model/Field :fk_target_field_id [:auto/param field-id] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn fk-fields-of-tables
  "The foreign key Fields of the Tables with `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select :model/Field :fk_target_field_id [:not= nil] :table_id [:in table-ids] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn active-fk-fields-of-table
  "The active foreign key Fields of the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select :model/Field :table_id [:auto/param table-id] :fk_target_field_id [:not= nil] :active true
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn fk-target-field-ids-of-table :- [:set ::lib.schema.id/field]
  "The ids of the Fields targeted by the active foreign key Fields of the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select-fn-set :fk_target_field_id :model/Field :table_id [:auto/param table-id] :fk_target_field_id [:not= nil] :active true
                    {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn table-ids-of-fields-targeting :- [:set ::lib.schema.id/table]
  "The ids of the Tables of the active Fields whose foreign key targets one of `field-ids`."
  [{:keys [field-ids]} :- [:map {:closed true} [:field-ids ::warehouse-schema.schema/field-ids]]]
  (t2/select-fn-set :table_id :model/Field :fk_target_field_id [:in field-ids] :active true
                    {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn visible-previewable-fields-of-tables
  "The active, normal-visibility Fields with preview display of the Tables with `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select :model/Field :table_id [:in table-ids] :visibility_type "normal" :preview_display true :active true
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn other-visible-fields-of-table
  "The active, normal-visibility Fields of the Table with `table-id` other than the Field with `field-id`."
  [{:keys [table-id field-id]}
   :- [:map {:closed true}
       [:table-id [:maybe ::lib.schema.id/table]]
       [:field-id [:maybe ::lib.schema.id/field]]]]
  (t2/select :model/Field :table_id table-id :id [:not= field-id] :visibility_type "normal" :active true
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn table-of-transform
  "The Table written by the Transform with `transform-id`, or nil."
  [{:keys [transform-id]} :- [:map {:closed true} [:transform-id [:maybe ::lib.schema.id/transform]]]]
  (t2/select-one :model/Table :transform_id transform-id {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn active-field-names-of-table
  "The names of the active Fields of the Table with `table-id`, in position order."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select-fn-vec :name [:model/Field :name :position] :table_id [:auto/param table-id] :active true
                    {:from     [(warehouse-schema-overlay/field-query {:user-settings? false})]
                     :order-by [[:position :asc]]}))

(mu/defn tables-matching-refs
  "The id, Database id, schema, and name of the Tables matching one of `refs`, each a `[database-id schema table-name]` tuple."
  [{:keys [refs]}
   :- [:map {:closed true} [:refs [:sequential [:tuple ms/PositiveInt [:maybe :string] :string]]]]]
  (t2/select [:model/Table :id :db_id :schema :name]
             {:from  [(warehouse-schema-overlay/table-query {:user-settings? false})]
              :where (into [:or]
                           (map (fn [[db-id schema table-name]]
                                  [:and
                                   [:= :db_id [:auto/param db-id]]
                                   (if (some? schema) [:= :schema [:auto/param schema]] [:is :schema nil])
                                   [:= :name [:auto/param table-name]]]))
                           refs)}))

(mu/defn active-visible-tables-of-databases
  "The active, unhidden Tables of the Databases with `database-ids`, in schema then display name order."
  [{:keys [database-ids]} :- [:map {:closed true} [:database-ids [:sequential ::lib.schema.id/database]]]]
  (t2/select :model/Table :active true :db_id [:in database-ids] :visibility_type nil
             {:from     [(warehouse-schema-overlay/table-query)]
              :order-by [[:%lower.schema :asc] [:%lower.display_name :asc]]}))

(mu/defn active-visible-table-schema-rows
  "The Database id, schema, and published flag of the active, unhidden Tables of the Databases with `database-ids`."
  [{:keys [database-ids]} :- [:map {:closed true} [:database-ids [:sequential ::lib.schema.id/database]]]]
  (t2/select [:model/Table :db_id :schema :is_published] :db_id [:in database-ids] :active true :visibility_type nil
             {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn tables-matching-name-pattern
  "Up to `limit` id, Database id, schema, and name rows of the active, unhidden Tables of the Database with `database-id` whose lower-cased name matches the SQL LIKE `like-pattern`, in name order, only published ones when `published-only?`."
  [{:keys [database-id like-pattern limit published-only?]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:like-pattern [:or :string vector?]]
       [:limit ms/PositiveInt]
       [:published-only? :boolean]]]
  (t2/select [:model/Table :id :db_id :schema :name]
             {:from     [(warehouse-schema-overlay/table-query)]
              :where    [:and
                         [:= :db_id [:auto/param database-id]]
                         [:= :active true]
                         [:like :%lower.name like-pattern]
                         [:= :visibility_type nil]
                         (when published-only? [:= :is_published true])]
              :order-by [[:%lower.name :asc]]
              :limit    limit}))

(mu/defn fields-matching-name-pattern
  "Up to `limit` name, type, id, and Table rows of the active, non-sensitive Fields of active Tables of the Database with `database-id` whose lower-cased name matches the SQL LIKE `like-pattern`, in field then Table name order, only Fields of published Tables when `published-only?`."
  [{:keys [database-id like-pattern limit published-only?]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:like-pattern [:or :string vector?]]
       [:limit ms/PositiveInt]
       [:published-only? :boolean]]]
  (t2/select [:model/Field :name :base_type :semantic_type :id :table_id [:table.name :table_name]]
             :metabase_field.active true
             :%lower.metabase_field/name [:like like-pattern]
             :metabase_field.visibility_type [:not-in ["sensitive" "retired"]]
             :table.db_id [:auto/param database-id]
             {:from       [(warehouse-schema-overlay/field-query)]
              :order-by   [[[:lower :metabase_field.name] :asc]
                           [[:lower :table.name] :asc]]
              :inner-join [(warehouse-schema-overlay/table-query {:alias :table})
                           [:and
                            :table.active
                            [:= :table.id :metabase_field.table_id]
                            (when published-only? :table.is_published)]]
              :limit      limit}))

(mu/defn non-sensitive-fields-of-tables
  "The id, names, Table id, and types of the non-sensitive, non-retired Fields of the Tables with `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select [:model/Field :id :name :display_name :table_id :base_type :semantic_type]
             :table_id [:in table-ids]
             :visibility_type [:not-in ["sensitive" "retired"]]
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn field-exists? :- :boolean
  "Whether the Field with `field-id` exists."
  [{:keys [field-id]} :- [:map {:closed true} [:field-id ::lib.schema.id/field]]]
  (t2/exists? :model/Field :id [:auto/param field-id] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn field-name->id-of-table :- [:map-of :string ::lib.schema.id/field]
  "A map of name to id of the active Fields of the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select-fn->fn :name :id [:model/Field :name :id] :table_id [:auto/param table-id] :active true
                    {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn upload-table-exists? :- :boolean
  "Whether any uploaded Table exists."
  []
  (t2/exists? :model/Table :is_upload true {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn recent-view-table-rows
  "The id, names, Database id, active flag, visibility, and Database sync status and name of the Tables with `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids [:sequential ms/PositiveInt]]]]
  (t2/select [:model/Table :id :name :db_id :active :display_name
              [:metabase_database.initial_sync_status :initial-sync-status]
              [:visibility_type :visibility_type]
              [:metabase_database.name :database-name]]
             {:from      [(warehouse-schema-overlay/table-query)]
              :where     [:in :metabase_table.id table-ids]
              :left-join [:metabase_database [:= :metabase_database.id :metabase_table.db_id]]}))

(mu/defn table-exists? :- :boolean
  "Whether the Table with `table-id` exists."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/exists? :model/Table :id [:auto/param table-id] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn visible-tables-for-recent-views
  "The not-hidden Tables among `table-ids`, with their Database name, id, and sync status."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids [:sequential ::lib.schema.id/table]]]]
  (t2/select :model/Table
             {:select    [:t.id :t.name :t.description :t.display_name :t.active :t.visibility_type :t.schema
                          [:db.name :database-name]
                          [:db.id :db_id]
                          [:db.initial_sync_status :initial-sync-status]]
              :from      [(warehouse-schema-overlay/table-query {:alias :t})]
              :where     [:and
                          [:or [:= :visibility_type nil] [:!= :visibility_type "hidden"]]
                          [:in :t.id table-ids]]
              :left-join [[:metabase_database :db] [:= :db.id :t.db_id]]}))

(mu/defn table-with-writability-exists? :- :boolean
  "Whether the Database with `database-id` has a Table whose `is_writable` flag is `writable?` (nil for unknown)."
  [{:keys [database-id writable?]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:writable? [:maybe :boolean]]]]
  (t2/exists? :model/Table :db_id [:auto/param database-id] :is_writable writable? {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn full-field-values-without-extras-exist? :- :boolean
  "Whether the Field with `field-id` has full FieldValues with values, no human-readable values, and no more values."
  [{:keys [field-id]} :- [:map {:closed true} [:field-id ::lib.schema.id/field]]]
  (t2/exists? :model/FieldValues :field_id [:auto/param field-id], :values [:not= nil], :human_readable_values nil, :has_more_values false :type "full"))

(mu/defn advanced-field-values-without-extras-exist? :- :boolean
  "Whether the Field with `field-id` has advanced FieldValues with `hash-key` with values, no human-readable values, and no more values."
  [{:keys [field-id hash-key]}
   :- [:map {:closed true}
       [:field-id ::lib.schema.id/field]
       [:hash-key :string]]]
  (t2/exists? :model/FieldValues :field_id [:auto/param field-id], :values [:not= nil], :human_readable_values nil, :has_more_values false :type "advanced", :hash_key [:auto/param hash-key]))

(mu/defn advanced-field-values
  "The advanced FieldValues of the Field with `field-id` with `hash-key`, or nil."
  [{:keys [field-id hash-key]}
   :- [:map {:closed true}
       [:field-id ::lib.schema.id/field]
       [:hash-key :string]]]
  (t2/select-one :model/FieldValues :field_id [:auto/param field-id], :type :advanced, :hash_key [:auto/param hash-key]))

(mu/defn active-name-fields-of-tables
  "The `columns` of the active Fields of the Tables with `table-ids` that have the name semantic type."
  [{:keys [columns table-ids]}
   :- [:map {:closed true}
       [:columns ::warehouse-schema.schema/columns]
       [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select (into [:model/Field] columns)
             :table_id [:in table-ids]
             :semantic_type (app-db/isa :type/Name)
             :active true
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn active-visible-table-ids-by-name :- [:set ::lib.schema.id/table]
  "The ids of the active, non-technical Tables of the Database with `database-id` whose lower-cased name is one of `table-names`."
  [{:keys [database-id table-names]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:table-names [:sequential :string]]]]
  (t2/select-pks-set :model/Table
                     {:from  [(warehouse-schema-overlay/table-query)]
                      :where [:and
                              [:= :db_id [:auto/param database-id]]
                              [:in [:lower :name] (into #{} (map u/lower-case-en) table-names)]
                              [:= :active true]
                              [:or
                               [:= :visibility_type nil]
                               [:not-in :visibility_type ["hidden" "technical" "cruft"]]]]}))

(mu/defn nullable-fields-with-fingerprints
  "The id, nullability, and fingerprint of the database-nullable Fields among `field-ids`."
  [{:keys [field-ids]} :- [:map {:closed true} [:field-ids ::warehouse-schema.schema/field-ids]]]
  (t2/select [:model/Field :id :database_is_nullable :fingerprint] :id [:in field-ids] :database_is_nullable true
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn active-tables-by-ids
  "The active Tables among `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select :model/Table :id [:in table-ids] :active true {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn active-visible-fields-of-tables
  "The id, name, Table id, and position of the active Fields of the Tables with `table-ids` that are not hidden, sensitive, or retired, in position order."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select [:model/Field :id :name :table_id :position]
             :table_id [:in table-ids]
             :active true
             :visibility_type [:not-in ["hidden" "sensitive" "retired"]]
             {:from     [(warehouse-schema-overlay/field-query)]
              :order-by [[:position :asc] [:id :asc]]}))

(mu/defn- sync-tables-clause
  "Honey SQL clause matching the Tables aliased `table-alias` that take part in sync: active, with no `visibility_type` as users see it."
  [table-alias :- :keyword]
  [:and
   [:= (u/qualified-key table-alias :active) true]
   [:= (warehouse-schema-overlay/table-user-visibility-type table-alias) nil]])

(mu/defn table-without-user-settings
  "The Table with `table-id` as sync sees it, or nil."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id [:maybe ::lib.schema.id/table]]]]
  (t2/select-one :model/Table :id [:auto/param table-id] {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn table-in-database
  "The Table with `table-id` in the Database with `database-id` as sync sees it, or nil."
  [{:keys [database-id table-id]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:table-id ::lib.schema.id/table]]]
  (t2/select-one :model/Table :db_id [:auto/param database-id] :id [:auto/param table-id]
                 {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn table-by-database-and-name
  "The Table named `table-name` in the Database with `database-id` as sync sees it, or nil."
  [{:keys [database-id table-name]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:table-name :string]]]
  (t2/select-one :model/Table :db_id [:auto/param database-id] :name [:auto/param table-name]
                 {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn table-by-schema-and-name
  "The Table named `table-name` in `schema` of the Database with `database-id` as sync sees it, or nil."
  [{:keys [database-id schema table-name]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema [:maybe :string]]
       [:table-name :string]]]
  (t2/select-one :model/Table :db_id [:auto/param database-id] :name [:auto/param table-name] :schema schema
                 {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn inactive-table-by-schema-and-name
  "The inactive Table named `table-name` in `schema` of the Database with `database-id` as sync sees it, or nil."
  [{:keys [database-id schema table-name]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema [:maybe :string]]
       [:table-name :string]]]
  (t2/select-one :model/Table :db_id [:auto/param database-id] :schema schema :name [:auto/param table-name] :active false
                 {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn active-table-id-by-name
  "The id of the active Table named `table-name` in the Database with `database-id`, or nil."
  [{:keys [database-id table-name]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:table-name :string]]]
  (t2/select-one-pk :model/Table :db_id [:auto/param database-id] :name [:auto/param table-name] :active true
                    {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn active-tables-by-lower-name-and-schema
  "The active Tables of the Database with `database-id` whose lower-cased name is `lower-name` and lower-cased schema is `lower-schema`."
  [{:keys [database-id lower-name lower-schema]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:lower-name :string]
       [:lower-schema [:maybe :string]]]]
  (t2/select :model/Table :db_id [:auto/param database-id] :%lower.name [:auto/param lower-name] :%lower.schema lower-schema :active true
             {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn tables-to-archive
  "The inactive, unarchived, non-transform-target Tables of the Database with `database-id` deactivated more than `amount` `unit`s (e.g. `-14 :day`) before the app DB's now."
  [{:keys [database-id amount unit]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:amount :int]
       [:unit :keyword]]]
  (t2/select :model/Table
             :db_id database-id
             :active false
             :archived_at nil
             :transform_target false
             :deactivated_at [:< (h2x/add-interval-honeysql-form (app-db/db-type) :%now amount unit)]
             {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn table-schemas-reducible
  "A reducible of the schema of every Table of the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/reducible-select [:model/Table :schema] :db_id [:auto/param database-id]
                       {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn active-table-ids-reducible
  "A reducible of the id of every active Table of the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/reducible-select [:model/Table :id] :db_id [:auto/param database-id] :active true
                       {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn active-table-count :- :int
  "The number of active Tables of the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/count :model/Table :db_id [:auto/param database-id] :active true
            {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn sync-table-ids
  "The ids of the Tables of the Database with `database-id` that take part in sync."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/select-fn-vec :id :model/Table :db_id [:auto/param database-id]
                    {:from  [(warehouse-schema-overlay/table-query {:user-settings? false})]
                     :where (sync-tables-clause :metabase_table)}))

(mu/defn sync-tables-count :- :int
  "The number of Tables of the Database with `database-id` that take part in sync."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/count :model/Table :db_id [:auto/param database-id]
            {:from  [(warehouse-schema-overlay/table-query {:user-settings? false})]
             :where (sync-tables-clause :metabase_table)}))

(mu/defn sync-tables-reducible
  "A reducible of the Tables of the Database with `database-id` that take part in sync, restricted to `schema-names` and `table-names` when non-empty, in schema then name order."
  [{:keys [database-id schema-names table-names]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:schema-names {:optional true} [:maybe [:or [:set [:maybe :string]] [:sequential [:maybe :string]]]]]
       [:table-names {:optional true} [:maybe [:or [:set :string] [:sequential :string]]]]]]
  (t2/reducible-select :model/Table :db_id [:auto/param database-id]
                       {:from     [(warehouse-schema-overlay/table-query {:user-settings? false})]
                        :where    [:and
                                   (sync-tables-clause :metabase_table)
                                   (when (seq schema-names) [:in :schema schema-names])
                                   (when (seq table-names) [:in :name table-names])]
                        :order-by [[:schema :asc] [:name :asc]]}))

(mu/defn sync-tables-by-earliest-analyzed-reducible
  "A reducible of the Tables of the Database with `database-id` that take part in sync, ordered by the earliest `last_analyzed` of their Fields."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/reducible-select :model/Table
                       {:select    [:t.*]
                        :from      [(warehouse-schema-overlay/table-query {:user-settings? false :alias :t})]
                        :left-join [[^:allow-subquery
                                     {:select   [:table_id [[:min :last_analyzed] :earliest_last_analyzed]]
                                      :from     [(warehouse-schema-overlay/field-query)]
                                      :group-by [:table_id]}
                                     :sub]
                                    [:= :t.id :sub.table_id]]
                        :where     [:and
                                    (sync-tables-clause :t)
                                    [:= :t.db_id [:auto/param database-id]]]
                        :order-by  [[:sub.earliest_last_analyzed :asc]]}))

(mu/defn fields-for-field-values
  "The columns needed to scan FieldValues of the Fields with `field-ids`, as users see them."
  [{:keys [field-ids]} :- [:map {:closed true} [:field-ids ::warehouse-schema.schema/field-ids]]]
  (t2/select [:model/Field :name :id :base_type :effective_type :coercion_strategy :semantic_type :visibility_type :table_id :has_field_values]
             :id [:in field-ids]
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn active-fields-metadata-of-table
  "The sync metadata columns of the active Fields of the Table with `table-id`, in field order."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select [:model/Field :name :database_type :base_type :effective_type :coercion_strategy :semantic_type :parent_id :id :description :database_position :nfc_path :database_is_auto_increment :database_required :database_default :database_is_generated :database_is_nullable :database_is_pk :database_partitioned :json_unfolding :position :preview_display]
             :table_id [:auto/param table-id] :active true
             {:from     [(warehouse-schema-overlay/field-query {:user-settings? false})]
              :order-by field-order-rule}))

(mu/defn normal-fields-of-table
  "Up to `limit` active, normal-visibility Fields of the Table with `table-id`, ordered by id."
  [{:keys [table-id limit]}
   :- [:map {:closed true}
       [:table-id ::lib.schema.id/table]
       [:limit ms/PositiveInt]]]
  (t2/select :model/Field :table_id [:auto/param table-id] :active true :visibility_type "normal"
             {:from     [(warehouse-schema-overlay/field-query)]
              :order-by [[:id :asc]]
              :limit    limit}))

(mu/defn inactive-fields-by-lower-name
  "The inactive Fields of the Table with `table-id` and `parent-id` whose lower-cased name is in `lower-names`."
  [{:keys [table-id parent-id lower-names]}
   :- [:map {:closed true}
       [:table-id ::lib.schema.id/table]
       [:parent-id [:maybe ms/PositiveInt]]
       [:lower-names [:sequential :string]]]]
  (t2/select :model/Field :table_id [:auto/param table-id] :%lower.name [:in lower-names] :parent_id parent-id :active false
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn incomplete-analysis-fields-of-table
  "The active, non-sensitive Fields of the Table with `table-id` fingerprinted at `fingerprint-version` but not yet analyzed."
  [{:keys [table-id fingerprint-version]}
   :- [:map {:closed true}
       [:table-id ::lib.schema.id/table]
       [:fingerprint-version :int]]]
  (t2/select :model/Field :table_id [:auto/param table-id] :active true :visibility_type [:not-in ["sensitive" "retired"]]
             :fingerprint_version [:auto/param fingerprint-version] :last_analyzed nil
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn name-field-count-of-table :- :int
  "The number of active, non-sensitive Fields of the Table with `table-id` that have the name semantic type."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/count :model/Field :table_id [:auto/param table-id] :active true :visibility_type [:not-in ["sensitive" "retired"]] :semantic_type :type/Name
            {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn top-level-field-ids-by-name
  "The ids of the top-level Fields of the Table with `table-id` named in `field-names`."
  [{:keys [table-id field-names]}
   :- [:map {:closed true}
       [:table-id ::lib.schema.id/table]
       [:field-names [:sequential :string]]]]
  (t2/select-pks-vec :model/Field :name [:in field-names] :table_id [:auto/param table-id] :parent_id nil
                     {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn indexed-field-ids-of-table :- [:set ::lib.schema.id/field]
  "The ids of the indexed Fields of the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select-pks-set :model/Field :table_id [:auto/param table-id] :database_indexed true
                     {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn indexed-top-level-field-ids-of-database :- [:set ::lib.schema.id/field]
  "The ids of the indexed top-level Fields of the Tables of the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/select-pks-set :model/Field
                     {:from [(warehouse-schema-overlay/field-query)]}
                     :table_id [:in ^:allow-subquery {:select [[:t.id]]
                                                      :from   [(warehouse-schema-overlay/table-query {:alias :t})]
                                                      :where  [:= :t.db_id [:auto/param database-id]]}]
                     :parent_id nil
                     :database_indexed true))

(mu/defn tables-by-schema-and-name-reducible
  "A reducible of the Tables with `table-ids` as sync sees them, in schema then name order."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/reducible-select :model/Table :id [:in table-ids]
                       {:from     [(warehouse-schema-overlay/table-query {:user-settings? false})]
                        :order-by [[:schema :asc] [:name :asc]]}))

(mu/defn field-values-exist? :- :boolean
  "Whether the Field with `field-id` has any FieldValues."
  [{:keys [field-id]} :- [:map {:closed true} [:field-id ::lib.schema.id/field]]]
  (t2/exists? :model/FieldValues :field_id [:auto/param field-id]))

(mu/defn advanced-field-values-count-before :- :int
  "The number of FieldValues of `types` for the Field with `field-id` created more than `max-age-days` days ago."
  [{:keys [field-id types max-age-days]}
   :- [:map {:closed true}
       [:field-id ::lib.schema.id/field]
       [:types [:set :keyword]]
       [:max-age-days :int]]]
  (t2/count :model/FieldValues :field_id [:auto/param field-id] :type [:in types]
            :created_at [:< (h2x/add-interval-honeysql-form (app-db/db-type) :%now (- max-age-days) :day)]))

(mu/defn published-table-ids-in-collection :- [:set ::lib.schema.id/table]
  "The ids of the published Tables in the Collection with `collection-id`, excluding archived ones when `skip-archived?`."
  [{:keys [collection-id skip-archived?]}
   :- [:map {:closed true}
       [:collection-id [:maybe ::lib.schema.id/collection]]
       [:skip-archived? [:maybe :boolean]]]]
  (t2/select-pks-set :model/Table
                     {:from  [(warehouse-schema-overlay/table-query)]
                      :where [:and
                              [:= :collection_id collection-id]
                              [:= :is_published true]
                              (when skip-archived? [:= :archived_at nil])]}))

(mu/defn published-table-ids-in-collections :- [:set ::lib.schema.id/table]
  "The ids of the published Tables in the Collections with `collection-ids`."
  [{:keys [collection-ids]}
   :- [:map {:closed true}
       [:collection-ids [:or [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]]]
  (t2/select-pks-set :model/Table :collection_id [:in collection-ids] :is_published true
                     {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn published-table-count-in-collections :- :int
  "The number of published Tables in the Collections with `collection-ids`."
  [{:keys [collection-ids]} :- [:map {:closed true} [:collection-ids [:set ::lib.schema.id/collection]]]]
  (t2/count :model/Table
            {:from  [(warehouse-schema-overlay/table-query)]
             :where [:and
                     [:= :is_published true]
                     [:in :collection_id collection-ids]]}))

(mu/defn published-table-exists-in-collections? :- :boolean
  "Whether any published Table is in the Collections with `collection-ids`."
  [{:keys [collection-ids]} :- [:map {:closed true} [:collection-ids [:sequential ::lib.schema.id/collection]]]]
  (t2/exists? :model/Table :is_published true :collection_id [:in collection-ids]
              {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn active-fields-of-table
  "The active Fields of the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select :model/Field :table_id [:auto/param table-id] :active true {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn field-display-name-rows-by-lower-name
  "The id, name, and display name of the Fields of the Table with `table-id` whose lower-cased name is in `lower-names`."
  [{:keys [table-id lower-names]}
   :- [:map {:closed true}
       [:table-id ::lib.schema.id/table]
       [:lower-names [:sequential :string]]]]
  (t2/select [:model/Field :id :name :display_name]
             {:from  [(warehouse-schema-overlay/field-query {:user-settings? false})]
              :where [:and
                      [:= :table_id [:auto/param table-id]]
                      [:in [:lower :name] lower-names]]}))

(mu/defn pk-fields-of-table
  "The active primary-key Fields of the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select :model/Field :table_id [:auto/param table-id] :semantic_type :type/PK :active true
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn fields-of-table-named
  "The Fields of the Table with `table-id` named in `field-names`."
  [{:keys [table-id field-names]}
   :- [:map {:closed true}
       [:table-id ::lib.schema.id/table]
       [:field-names [:sequential :string]]]]
  (t2/select :model/Field :table_id [:auto/param table-id] :name [:in field-names]
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn active-fields-of-table-in-position-order
  "The active Fields of the Table with `table-id`, in position order."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select :model/Field :table_id [:auto/param table-id] :active true
             {:from     [(warehouse-schema-overlay/field-query)]
              :order-by [[:position]]}))

(mu/defn field-requirements-by-name
  "A map of name to the name, required flag, and base type of the Fields of the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select-fn->fn :name identity [:model/Field :name :database_required :base_type] :table_id [:auto/param table-id]
                    {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn field-values-of-fields
  "The values of the FieldValues of the Fields with `field-ids`."
  [{:keys [field-ids]} :- [:map {:closed true} [:field-ids ::warehouse-schema.schema/field-ids]]]
  (t2/select-fn-vec :values :model/FieldValues :field_id [:in field-ids]))

(mu/defn published-table-ids :- [:set ::lib.schema.id/table]
  "The ids of the published Tables among `table-ids`."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select-pks-set :model/Table :id [:in table-ids] :is_published true {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table-ids-of-fields-remapped-to :- [:set ::lib.schema.id/table]
  "The ids of the Tables of the Fields remapped through a Dimension to one of `field-ids`."
  [{:keys [field-ids]} :- [:map {:closed true} [:field-ids ::warehouse-schema.schema/field-ids]]]
  (t2/select-fn-set :table_id [:model/Field :metabase_field.table_id]
                    {:from  [(warehouse-schema-overlay/field-query {:user-settings? false})]
                     :join  [:dimension [:= :dimension.field_id :metabase_field.id]]
                     :where [:in :dimension.human_readable_field_id field-ids]}))

(mu/defn internal-dimension-exists? :- :boolean
  "Whether the Field with `field-id` has an internal Dimension."
  [{:keys [field-id]} :- [:map {:closed true} [:field-id ::lib.schema.id/field]]]
  (t2/exists? :model/Dimension :field_id [:auto/param field-id] :type "internal"))

(mu/defn active-fk-to-fields-exist? :- :boolean
  "Whether any active Field of an active Table has a foreign key targeting one of `field-ids`."
  [{:keys [field-ids]} :- [:map {:closed true} [:field-ids ::warehouse-schema.schema/field-ids]]]
  (t2/exists? :model/Field
              {:from  [(warehouse-schema-overlay/field-query)]
               :join  [(warehouse-schema-overlay/table-query {:user-settings? false})
                       [:= :metabase_field.table_id :metabase_table.id]]
               :where [:and
                       [:in :metabase_field.fk_target_field_id field-ids]
                       [:= :metabase_field.active true]
                       [:= :metabase_table.active true]]}))

(mu/defn active-tables-by-ids-in-name-order
  "The active Tables among `table-ids`, in name then id order."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select :model/Table
             {:from     [(warehouse-schema-overlay/table-query)]
              :where    [:and
                         [:= :active true]
                         [:in :id table-ids]]
              :order-by [[:name :asc] [:id :asc]]}))

(mu/defn published-table-locations
  "The id, Database id, and schema of every published Table."
  []
  (t2/select [:model/Table :id :db_id :schema]
             {:from  [(warehouse-schema-overlay/table-query)]
              :where [:= :is_published true]}))

(mu/defn library-tables-in-collections
  "The id, names, and description of the active, published Tables in the Collections with `collection-ids`, restricted to the Table with `table-id` when given."
  [{:keys [collection-ids table-id]}
   :- [:map {:closed true}
       [:collection-ids [:sequential ::lib.schema.id/collection]]
       [:table-id {:optional true} [:maybe ::lib.schema.id/table]]]]
  (t2/select [:model/Table :id :name :display_name :description]
             {:from  [(warehouse-schema-overlay/table-query)]
              :where [:and
                      [:in :collection_id collection-ids]
                      [:= :is_published true]
                      [:= :active true]
                      (when table-id [:= :id table-id])]}))

(mu/defn curated-tables-reducible
  "A reducible of the id and curation columns of the active Tables that are published or authoritative."
  []
  (t2/reducible-select [:model/Table :id :is_published :data_layer :data_authority]
                       {:from  [(warehouse-schema-overlay/table-query)]
                        :where [:and
                                [:= :active true]
                                [:or
                                 [:= :is_published true]
                                 [:= :data_authority "authoritative"]]]}))

(mu/defn table-ids-with-user-settings-among :- [:vector ::lib.schema.id/table]
  "The ids, among `table-ids`, of the Tables that have a TableUserSettings row."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids [:sequential ::lib.schema.id/table]]]]
  (t2/select-fn-vec :table_id :model/TableUserSettings {:select [:table_id] :where [:in :table_id table-ids]}))

(mu/defn field-ids-with-user-settings-of-tables :- [:vector ::lib.schema.id/field]
  "The ids of the Fields of the Tables with `table-ids` that have a FieldUserSettings row."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids [:sequential ::lib.schema.id/table]]]]
  (t2/select-fn-vec :field_id :model/FieldUserSettings
                    {:select [:u.field_id]
                     :from   [[(t2/table-name :model/FieldUserSettings) :u]]
                     :join   [(warehouse-schema-overlay/field-query {:alias :f :user-settings? false}) [:= :f.id :u.field_id]]
                     :where  [:in :f.table_id table-ids]}))

(mu/defn field-ids-with-dimensions-of-tables :- [:vector ::lib.schema.id/field]
  "The ids of the Fields of the Tables with `table-ids` that have a Dimension."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids [:sequential ::lib.schema.id/table]]]]
  (t2/select-fn-vec :field_id :model/Dimension
                    {:select [:d.field_id]
                     :from   [[(t2/table-name :model/Dimension) :d]]
                     :join   [(warehouse-schema-overlay/field-query {:alias :f :user-settings? false}) [:= :f.id :d.field_id]]
                     :where  [:in :f.table_id table-ids]}))

(mu/defn non-upload-active-tables-of-database
  "The active Tables of the Database with `database-id` that were not uploaded."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/select :model/Table :db_id [:auto/param database-id] :active true :is_upload false
             {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn active-upload-tables
  "The active uploaded Tables, in name order."
  []
  (t2/select :model/Table :active true :is_upload true
             {:from     [(warehouse-schema-overlay/table-query)]
              :order-by [[:name :asc]]}))

(mu/defn active-tables-of-database-columns
  "The `columns` of the active Tables of the Database with `database-id`, restricted to `table-ids` and `schema` when those keys are given (an empty `schema` matches nil and empty-string schemas)."
  [{:keys [columns database-id table-ids schema] :as opts}
   :- [:map {:closed true}
       [:columns ::warehouse-schema.schema/columns]
       [:database-id ::lib.schema.id/database]
       [:table-ids {:optional true} ::warehouse-schema.schema/table-ids]
       [:schema {:optional true} [:maybe :string]]]]
  (t2/select :model/Table
             {:from   [(warehouse-schema-overlay/table-query)]
              :select columns
              :where  (cond-> [:and
                               [:= :db_id [:auto/param database-id]]
                               [:= :active true]]
                        (contains? opts :table-ids) (conj [:in :id table-ids])
                        (contains? opts :schema)    (conj (if (= schema "")
                                                            [:or [:= :schema nil] [:= :schema ""]]
                                                            [:= :schema schema])))}))

(mu/defn active-fields-of-tables-in-field-order
  "The active Fields of the Tables with `table-ids`, in field order."
  [{:keys [table-ids]} :- [:map {:closed true} [:table-ids ::warehouse-schema.schema/table-ids]]]
  (t2/select :model/Field
             {:from     [(warehouse-schema-overlay/field-query)]
              :where    [:and
                         [:in :table_id table-ids]
                         [:= :active true]]
              :order-by field-order-rule}))

(mu/defn active-fields-by-ids
  "The active Fields among `field-ids`."
  [{:keys [field-ids]} :- [:map {:closed true} [:field-ids ::warehouse-schema.schema/field-ids]]]
  (t2/select :model/Field
             {:from  [(warehouse-schema-overlay/field-query)]
              :where [:and
                      [:in :id field-ids]
                      [:= :active true]]}))

(mu/defn top-level-fields-metadata
  "The id, names, types, and position of the active top-level Fields of the Table with `table-id`, in database position order."
  [{:keys [table-id]} :- [:map {:closed true} [:table-id ::lib.schema.id/table]]]
  (t2/select [:model/Field :id :name :base_type :effective_type :semantic_type :database_type :database_position]
             :table_id [:auto/param table-id]
             :active true
             :parent_id nil
             :nfc_path nil
             {:from     [(warehouse-schema-overlay/field-query)]
              :order-by [[:database_position :asc]]}))

(mu/defn tables-excluding-database
  "The id, names, collection, curation columns, visibility, and Database id of the active Tables outside the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/select [:model/Table :id :name :collection_id :is_published :visibility_type :db_id :data_layer :data_authority]
             :active true
             :db_id [:not= database-id]
             {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn tables-of-database-named
  "The Tables of the Database with `database-id` named in `table-names`."
  [{:keys [database-id table-names]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:table-names [:or [:set :string] [:sequential :string]]]]]
  (t2/select :model/Table :db_id [:auto/param database-id] :name [:in table-names]
             {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn tables-of-database-in-id-order
  "The id, name, schema, and active flag of the Tables of the Database with `database-id`, in id order."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/select [:model/Table :id :name :schema :active] :db_id [:auto/param database-id]
             {:from     [(warehouse-schema-overlay/table-query {:user-settings? false})]
              :order-by [[:id :asc]]}))

(mu/defn public-schema-active-table-exists? :- :boolean
  "Whether the Database with `database-id` has an active Table in the public schema."
  [{:keys [database-id]} :- [:map {:closed true} [:database-id ::lib.schema.id/database]]]
  (t2/exists? :model/Table :db_id [:auto/param database-id] :schema "public" :active true
              {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn transforms-by-id
  "A map of ID to Transform for `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (t2/select-fn->fn :id identity :model/Transform :id [:in transform-ids]))
