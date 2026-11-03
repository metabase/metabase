(ns metabase.warehouse-schema.user-settings
  "The user-settable columns of Fields and Tables, and how their settings rows say which ones a user set."
  (:require
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]))

(def user-settable-field-columns
  "The Field columns users can set, whose values `metabase_field` holds while `metabase_field_user_settings` records
  which ones a user set."
  #{:semantic_type :description :display_name :visibility_type :has_field_values :effective_type :coercion_strategy
    :fk_target_field_id :caveats :points_of_interest :json_unfolding :settings :data_sensitivity :custom_position})

(def field-set-flags
  "The user-settable Field columns sync also writes, mapped to the flag that says the user set the column, NULL
  included."
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set})

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

(def user-settable-table-columns
  "The Table columns users can set, whose values `metabase_table` holds while `metabase_table_user_settings` records
  which ones a user set."
  #{:display_name :description :entity_type :visibility_type :caveats :points_of_interest :data_layer :data_source
    :owner_email :owner_user_id :field_order :show_in_getting_started :data_authority :is_published :collection_id})

(def table-set-flags
  "The user-settable Table columns something besides users also writes, mapped to the flag that says the user set the
  column, NULL included."
  {:description     :description_set
   :visibility_type :visibility_type_set
   :data_layer      :data_layer_set
   :data_source     :data_source_set})

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
