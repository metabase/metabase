(ns metabase.warehouse-schema.user-settings
  "The user-settable columns of Fields and Tables, and how their settings rows say which ones a user set."
  (:require
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]))

(def user-settable-field-columns
  "The Field columns users can set, whose values `metabase_field` holds while `metabase_field_user_settings` records
  which ones a user set."
  #{:semantic_type :description :display_name :visibility_type :has_field_values :effective_type :coercion_strategy
    :fk_target_field_id :caveats :points_of_interest :json_unfolding :settings :data_sensitivity :custom_position
    :is_grain :attribute_scd_type :facets})

(def field-set-flags
  "The user-settable Field columns sync also writes, and `attribute_scd_type`, mapped to the flag that says the user set
  the column, NULL included. `is_grain` and `facets` have no flag: `false` and `[]` record a user's none, and a NULL
  leaves the column to sync."
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set
   :attribute_scd_type :attribute_scd_type_set})

(mu/defn user-set-field-columns :- [:set (into [:enum] user-settable-field-columns)]
  "The columns the FieldUserSettings row `settings` says a user set; `coercion_strategy` follows `effective_type`."
  [settings :- [:maybe ::warehouse-schema.schema/field-user-settings]]
  (into #{}
        (filter (fn [column]
                  (cond
                    (field-set-flags column)            (true? (get settings (field-set-flags column)))
                    (= column :coercion_strategy) (some? (:effective_type settings))
                    :else                         (some? (get settings column)))))
        user-settable-field-columns))

(def settings-only-table-columns
  "The user-settable Table columns only `metabase_table_user_settings` holds."
  #{:is_published :collection_id})

(def user-settable-table-columns
  "The Table columns users can set, whose values `metabase_table` holds, all but [[settings-only-table-columns]],
  while `metabase_table_user_settings` records which ones a user set."
  (into #{:display_name :description :entity_type :visibility_type :caveats :points_of_interest :data_layer
          :data_source :owner_email :owner_user_id :field_order :show_in_getting_started :data_authority
          :table_role :grain :grain_description :period_granularity :mutability :load_strategy :scd_type
          :history_definition :eav_definition}
        settings-only-table-columns))

(defn table-row-columns
  "The part of the user-settable Table columns `settings` that the row of the Table holds too."
  [settings]
  (apply dissoc settings settings-only-table-columns))

(def table-set-flags
  "The user-settable Table columns something besides users also writes, and the structural metadata columns, mapped to
  the flag that says the user set the column, NULL included."
  {:description        :description_set
   :visibility_type    :visibility_type_set
   :data_layer         :data_layer_set
   :data_source        :data_source_set
   :table_role         :table_role_set
   :grain              :grain_set
   :grain_description  :grain_description_set
   :period_granularity :period_granularity_set
   :mutability         :mutability_set
   :load_strategy      :load_strategy_set
   :scd_type           :scd_type_set
   :history_definition :history_definition_set
   :eav_definition     :eav_definition_set})

(mu/defn user-set-table-columns :- [:set (into [:enum] user-settable-table-columns)]
  "The columns the TableUserSettings row `settings` says a user set; `collection_id` follows `is_published`."
  [settings :- [:maybe ::warehouse-schema.schema/table-user-settings]]
  (into #{}
        (filter (fn [column]
                  (cond
                    (table-set-flags column)        (true? (get settings (table-set-flags column)))
                    (= column :collection_id) (some? (:is_published settings))
                    :else                     (some? (get settings column)))))
        user-settable-table-columns))
