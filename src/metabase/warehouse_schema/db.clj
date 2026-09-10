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
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

;;; ---------------------------------------- Fields as users see them ----------------------------------------

(def user-settable-field-columns
  "The Field columns users can set. Their user values live in `metabase_field_user_settings`, never in `metabase_field`."
  #{:semantic_type :description :display_name :visibility_type :has_field_values :effective_type :coercion_strategy
    :fk_target_field_id :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity})

(def field-user-settings-flags
  "The user-settable Field columns that are nullable on the Field and also written by sync, mapped to the
  `metabase_field_user_settings` flag recording that the user made the call: for these a user's NULL beats the sync
  value."
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set})

(mu/defn- field-user-settings-join
  "The `:left-join` entries joining `metabase_field_user_settings` as `settings-alias` to the Field table aliased
  `field-alias`; see [[field-user-settings-column]]."
  [field-alias    :- :keyword
   settings-alias :- :keyword]
  [[(t2/table-name :model/FieldUserSettings) settings-alias]
   [:= (u/qualified-key settings-alias :field_id) (u/qualified-key field-alias :id)]])

(mu/defn- field-user-settings-column
  "Honey SQL expression for the user-settable Field column `column` as users see it: the value in
  `metabase_field_user_settings` (aliased `settings-alias`) when the user set it, else the Field's (aliased
  `field-alias`). A user's NULL counts as set for the [[field-user-settings-flags]] when their flag is true, and for
  `coercion_strategy` whenever the user set `effective_type`. Requires [[field-user-settings-join]]."
  [column         :- (into [:enum] user-settable-field-columns)
   field-alias    :- :keyword
   settings-alias :- :keyword]
  (let [field-column    (u/qualified-key field-alias column)
        settings-column (u/qualified-key settings-alias column)
        flag            (field-user-settings-flags column)]
    (cond
      flag
      [:case [:= (u/qualified-key settings-alias flag) true] settings-column :else field-column]

      (= column :coercion_strategy)
      [:case [:not= (u/qualified-key settings-alias :effective_type) nil] settings-column :else field-column]

      ;; a CASE on the boolean gives every app DB a value its JDBC driver reads back as a boolean or a number
      (= column :json_unfolding)
      [:case [:= [:coalesce settings-column field-column] true] true :else false]

      :else
      [:coalesce settings-column field-column])))

(def ^:private sync-owned-field-columns
  "The columns of `metabase_field` users cannot set."
  (sort (remove user-settable-field-columns (mu/map-schema-keys ::warehouse-schema.schema/field))))

(mu/defn field-query :- [:tuple :map :keyword]
  "The source a query over Fields reads from, for its `:from` or a join: a subquery over `metabase_field` left joined
  to `metabase_field_user_settings`, projecting every Field column with the user-settable ones replaced by the value
  users see.

    (t2/select :model/Field :table_id table-id {:from [(field-query)]})

  By default it stands in under the Field table's own name, so kv-args, column subsets and `:order-by` keep working
  untouched. Pass `:alias` when the query joins something else and has to qualify its columns:

    (t2/select :model/Field {:from  [(field-query {:alias :f})]
                             :join  [[:metabase_table :t] [:= :f.table_id :t.id]]
                             :where [:= :t.db_id database-id]})

  Every query over Fields reads from this -- selecting `metabase_field` directly shows sync's values rather than the
  user's. `{:user-settings? false}` asks for sync's own values instead, which sync needs where it diffs the columns
  it last wrote against the warehouse.

  Application DBs flatten the subquery, so a predicate on a sync-owned column still reaches that column's index."
  ([]
   (field-query nil))

  ([{:keys [alias user-settings?]
     :or   {alias          (t2/table-name :model/Field)
            user-settings? true}} :- [:maybe [:map
                                              [:alias          {:optional true} :keyword]
                                              [:user-settings? {:optional true} :boolean]]]]
   [(if user-settings?
      ^:allow-subquery
      {:select    (into (mapv #(u/qualified-key :f %) sync-owned-field-columns)
                        (map (fn [column] [(field-user-settings-column column :f :u) column]))
                        (sort user-settable-field-columns))
       :from      [[(t2/table-name :model/Field) :f]]
       :left-join (field-user-settings-join :f :u)}
      ^:allow-subquery
      {:select [:f.*]
       :from   [[(t2/table-name :model/Field) :f]]})
    alias]))

(mu/defn field
  "The ::warehouse-schema.schema/field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id {:from [(field-query)]}))

(mu/defn field-in-path
  "The ::warehouse-schema.schema/field named by the last of `field-names` (each nested inside the previous, bottom-most first) under
  `table-id`, or nil. See `metabase.models.db/field-in-path`, which owns the shared query."
  [table-id    :- [:maybe ::lib.schema.id/table]
   field-names :- [:sequential :string]]
  (models.db/field-in-path table-id field-names))

(mu/defn fields
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids] {:from [(field-query)]}))

(mu/defn fields-by-id
  "A map of ID to ::warehouse-schema.schema/field for `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select-fn->fn :id identity :model/Field :id [:in field-ids] {:from [(field-query)]}))

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
  (t2/select-one [:model/Field :base_type :visibility_type :has_field_values :preview_display] :id field-id
                 {:from [(field-query)]}))

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
  (t2/select [:model/Field :id] :table_id table-id {:from     [(field-query)]
                                                    :order-by (field-order-order-by field-order)}))

(mu/defn active-fields-for-tables
  "The active, unretired Fields of the Tables with `table-ids`, in field order."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field
             :active true
             :table_id [:in table-ids]
             :visibility_type [:not= "retired"]
             {:from [(field-query)], :order-by field-order-rule}))

(mu/defn pk-field-ids-by-table
  "A map of ::warehouse-schema.schema/table ID to the ID of its visible primary key ::warehouse-schema.schema/field for `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select-fn->fn :table_id :id :model/Field
                    :table_id [:in table-ids]
                    :semantic_type (app-db/isa :type/PK)
                    :visibility_type [:not-in ["sensitive" "retired"]]
                    {:from [(field-query {:alias :f})]}))

(mu/defn update-field!
  "Apply `changes` to the ::warehouse-schema.schema/field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- (mut/select-keys ::warehouse-schema.schema/field.update [:position :custom_position])]
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
  (t2/select-fn-set (comp u/lower-case-en :name)
                    :model/Field
                    {:select    [:f.name]
                     :from      [[(t2/table-name :model/Field) :f]]
                     :left-join (field-user-settings-join :f :u)
                     :where     [:and
                                 [:= :f.table_id table-id]
                                 [:in [:lower :f.name] names]
                                 [:not= :u.display_name nil]]}))

(mu/defn field-names-reducible
  "A reducible of the id, name, and display name of every ::warehouse-schema.schema/field, plus its user-set display
  name from FieldUserSettings (if any) as `:user_display_name`."
  []
  (t2/reducible-query
   {:select    [:f.id :f.name :f.display_name [:u.display_name :user_display_name]]
    :from      [[(t2/table-name :model/Field) :f]]
    :left-join (field-user-settings-join :f :u)}))

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

(mu/defn user-edited-field-ids-for-table
  "The IDs of the Fields of the ::warehouse-schema.schema/table with `table-id` that have a FieldUserSettings row."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-set :field_id :model/FieldUserSettings
                    {:join  [[:metabase_field :f] [:= :f.id :field_id]]
                     :where [:= :f.table_id table-id]}))

(def ^:private field-user-settings-update-keys
  "The columns an insert or update of a FieldUserSettings accepts."
  [:field_id :created_at :updated_at :semantic_type :description :display_name :visibility_type :fk_target_field_id :has_field_values :effective_type :coercion_strategy :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity :description_set :semantic_type_set :fk_target_field_id_set])

(mu/defn insert-field-user-settings!
  "Insert one FieldUserSettings map or a sequence of them, returning the number inserted."
  [rows :- [:or (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys) [:sequential (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys)]]]
  (t2/insert! :model/FieldUserSettings rows))

(mu/defn update-field-user-settings!
  "Apply `changes` to the FieldUserSettings of the ::warehouse-schema.schema/field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys)]
  (t2/update! :model/FieldUserSettings field-id changes))

(mu/defn clear-user-settings-fk-targets-to-field!
  "Unset the user-set FK semantic type and target of every ::warehouse-schema.schema/field targeting the
  ::warehouse-schema.schema/field with `field-id`, so the sync values show again. Returns the number updated."
  [field-id :- ::lib.schema.id/field]
  (t2/update! :model/FieldUserSettings {:fk_target_field_id field-id}
              {:semantic_type nil, :semantic_type_set false, :fk_target_field_id nil, :fk_target_field_id_set false}))

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
             {:join  [[:metabase_field :field] [:= :metabase_fieldvalues.field_id :field.id]]
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

(mu/defn table
  "The ::warehouse-schema.schema/table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

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
  (t2/select-one-fn :db_id :model/Table table-id))

(mu/defn update-table!
  "Apply `changes` to the ::warehouse-schema.schema/table with `table-id`, returning the number updated."
  [table-id :- ::lib.schema.id/table
   changes  :- (mut/select-keys ::warehouse-schema.schema/table.update [:field_order])]
  (t2/update! :model/Table table-id changes))

(mu/defn unarchived-segments-for-tables
  "The unarchived Segments of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Segment :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn segment-ids-for-table
  "The IDs of the Segments of the ::warehouse-schema.schema/table with `table-id`, excluding archived ones when `skip-archived?`."
  [table-id       :- ::lib.schema.id/table
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Segment {:where [:and [:= :table_id table-id] (when skip-archived? [:not :archived])]}))

(mu/defn unarchived-measures-for-tables
  "The unarchived Measures of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Measure :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn measure-ids-for-table
  "The IDs of the Measures of the ::warehouse-schema.schema/table with `table-id`, excluding archived ones when `skip-archived?`."
  [table-id       :- ::lib.schema.id/table
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Measure {:where [:and [:= :table_id table-id] (when skip-archived? [:not :archived])]}))

(mu/defn unarchived-metric-cards-for-tables
  "The unarchived metric Cards of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Card :table_id [:in table-ids] :archived false :type :metric {:order-by [[:name :asc]]}))

(mu/defn transforms-by-id
  "A map of ID to Transform for `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (t2/select-fn->fn :id identity :model/Transform :id [:in transform-ids]))

(mu/defn table-names-reducible
  "A reducible of the id, name, and display name of every ::warehouse-schema.schema/table."
  []
  (t2/reducible-select [:model/Table :id :name :display_name]))

(mu/defn set-table-display-name!
  "Set the display name of the ::warehouse-schema.schema/table with `id`, returning the number updated."
  [id           :- ::lib.schema.id/table
   display-name :- :string]
  (t2/update! :model/Table id {:display_name display-name}))

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

(mu/defn database-id-by-name
  "The ID of the ::warehouses.schema/database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one-pk :model/Database :name database-name))

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
