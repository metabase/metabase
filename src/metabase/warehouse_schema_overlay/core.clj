(ns metabase.warehouse-schema-overlay.core
  "Sources for queries over Fields and Tables: [[field-query]] and [[table-query]] merge each row with the values
  in its user-settings table."
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def user-settable-field-columns
  "The Field columns users can set. Their user values live in `metabase_field_user_settings`, never in `metabase_field`."
  #{:semantic_type :description :display_name :visibility_type :has_field_values :effective_type :coercion_strategy
    :fk_target_field_id :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity
    :custom_position})

(def field-user-settings-flags
  "The user-settable Field columns sync also writes, mapped to the flag that says the user set the column, NULL
  included."
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set})

(def field-columns
  "Every column of `metabase_field`. Spelled out rather than read from `:metabase.warehouse-schema.schema/field`,
  which lives in a module above this one; `metabase.warehouse-schema-overlay.core-test` fails if the two drift."
  #{:active :base_type :caveats :coercion_strategy :created_at :custom_position :data_sensitivity :database_default
    :database_indexed :database_is_auto_increment :database_is_generated :database_is_nullable :database_is_pk
    :database_partitioned :database_position :database_required :database_type :description
    :dimension_interestingness :display_name :effective_type :fingerprint :fingerprint_version :fk_target_field_id
    :has_field_values :id :is_defective_duplicate :json_unfolding :last_analyzed :name :nfc_path :parent_id
    :points_of_interest :position :preview_display :semantic_type :settings :table_id :unique_field_helper
    :updated_at :visibility_type})

(def ^:private sync-owned-field-columns
  "The columns of `metabase_field` users cannot set."
  (sort (remove user-settable-field-columns field-columns)))

(mu/defn- field-user-settings-join
  "The `:left-join` entries joining `metabase_field_user_settings` as `settings-alias` to the Field table aliased
  `field-alias`; see [[field-user-settings-column]]."
  [field-alias    :- :keyword
   settings-alias :- :keyword]
  [[(t2/table-name :model/FieldUserSettings) settings-alias]
   [:= (u/qualified-key settings-alias :field_id) (u/qualified-key field-alias :id)]])

(mu/defn- field-user-set-condition
  "Honey SQL test for whether the user set `column`, or nil when a non-NULL value says so itself."
  [column         :- (into [:enum] user-settable-field-columns)
   settings-alias :- :keyword]
  (if-let [flag (field-user-settings-flags column)]
    [:= (u/qualified-key settings-alias flag) true]
    (when (= column :coercion_strategy)
      [:not= (u/qualified-key settings-alias :effective_type) nil])))

(mu/defn- field-user-settings-column
  "Honey SQL expression for `column` as users see it: the user value when set, else the Field's."
  [column         :- (into [:enum] user-settable-field-columns)
   field-alias    :- :keyword
   settings-alias :- :keyword]
  (let [field-column    (u/qualified-key field-alias column)
        settings-column (u/qualified-key settings-alias column)]
    (if-let [condition (field-user-set-condition column settings-alias)]
      [:case condition settings-column :else field-column]
      (if (= column :json_unfolding)
        [:case [:= [:coalesce settings-column field-column] true] true :else false]
        [:coalesce settings-column field-column]))))

(mu/defn field-query :- [:tuple :any :keyword]
  "The source a query over Fields reads from: `metabase_field` merged with the user values. `:alias` names it for
  joins; `{:user-settings? false}` gives sync's own values."
  ([]
   (field-query nil))

  ([{:keys [alias user-settings?]
     :or   {alias          (t2/table-name :model/Field)
            user-settings? true}} :- [:maybe [:map {:closed true, :probe/id "src/metabase/warehouse_schema_overlay/core.clj:75"}
                                              [:alias          {:optional true} :keyword]
                                              [:user-settings? {:optional true} :boolean]]]]
   [(if user-settings?
      ^:allow-subquery
      {:select    (into (mapv #(u/qualified-key :f %) sync-owned-field-columns)
                        (map (fn [column] [(field-user-settings-column column :f :u) column]))
                        (sort user-settable-field-columns))
       :from      [[(t2/table-name :model/Field) :f]]
       :left-join (field-user-settings-join :f :u)}
      (t2/table-name :model/Field))
    alias]))

(def user-settable-table-columns
  "The Table columns users can set. Their user values live in `metabase_table_user_settings`, never in
  `metabase_table`."
  #{:display_name :description :entity_type :visibility_type :caveats :points_of_interest :data_layer :data_source
    :owner_email :owner_user_id :field_order :show_in_getting_started :data_authority :is_published :collection_id})

(def table-user-settings-flags
  "The user-settable Table columns a user can clear, mapped to the flag that says the user set the column, NULL
  included."
  {:description        :description_set
   :visibility_type    :visibility_type_set
   :caveats            :caveats_set
   :points_of_interest :points_of_interest_set
   :data_layer         :data_layer_set
   :data_source        :data_source_set})

(def table-columns
  "Every column of `metabase_table`. Spelled out rather than read from `:metabase.warehouse-schema.schema/table`,
  which lives in a module above this one; `metabase.warehouse-schema-overlay.core-test` fails if the two drift."
  #{:active :archived_at :caveats :collection_id :created_at :data_authority :data_layer :data_source
    :database_require_filter :db_id :deactivated_at :description :display_name :entity_type :estimated_row_count
    :field_order :id :initial_sync_status :is_defective_duplicate :is_published :is_upload :is_writable :name
    :owner_email :owner_user_id :points_of_interest :schema :show_in_getting_started :transform_id :transform_target
    :unique_table_helper :updated_at :view_count :visibility_type})

(def ^:private sync-owned-table-columns
  "The columns of `metabase_table` users cannot set."
  (sort (remove user-settable-table-columns table-columns)))

(mu/defn- table-user-settings-join
  "The `:left-join` entries joining `metabase_table_user_settings` as `settings-alias` to the Table table aliased
  `table-alias`; see [[table-user-settings-column]]."
  [table-alias    :- :keyword
   settings-alias :- :keyword]
  [[(t2/table-name :model/TableUserSettings) settings-alias]
   [:= (u/qualified-key settings-alias :table_id) (u/qualified-key table-alias :id)]])

(mu/defn- table-user-set-condition
  "Honey SQL test for whether the user set `column`, or nil when a non-NULL value says so itself; `collection_id`
  follows `is_published`."
  [column         :- (into [:enum] user-settable-table-columns)
   settings-alias :- :keyword]
  (if-let [flag (table-user-settings-flags column)]
    [:= (u/qualified-key settings-alias flag) true]
    (when (= column :collection_id)
      [:not= (u/qualified-key settings-alias :is_published) nil])))

(mu/defn- table-user-settings-column
  "Honey SQL expression for `column` as users see it: the user value when set, else the Table's."
  [column         :- (into [:enum] user-settable-table-columns)
   table-alias    :- :keyword
   settings-alias :- :keyword]
  (let [table-column    (u/qualified-key table-alias column)
        settings-column (u/qualified-key settings-alias column)]
    (if-let [condition (table-user-set-condition column settings-alias)]
      [:case condition settings-column :else table-column]
      (if (#{:show_in_getting_started :is_published} column)
        [:case [:= [:coalesce settings-column table-column] true] true :else false]
        [:coalesce settings-column table-column]))))

(mu/defn table-query :- [:tuple :any :keyword]
  "The source a query over Tables reads from: `metabase_table` merged with the user values, with the options of
  [[field-query]]."
  ([]
   (table-query nil))

  ([{:keys [alias user-settings?]
     :or   {alias          (t2/table-name :model/Table)
            user-settings? true}} :- [:maybe [:map {:closed true, :probe/id "src/metabase/warehouse_schema_overlay/core.clj:156"}
                                              [:alias          {:optional true} :keyword]
                                              [:user-settings? {:optional true} :boolean]]]]
   [(if user-settings?
      ^:allow-subquery
      {:select    (into (mapv #(u/qualified-key :t %) sync-owned-table-columns)
                        (map (fn [column] [(table-user-settings-column column :t :u) column]))
                        (sort user-settable-table-columns))
       :from      [[(t2/table-name :model/Table) :t]]
       :left-join (table-user-settings-join :t :u)}
      (t2/table-name :model/Table))
    alias]))
