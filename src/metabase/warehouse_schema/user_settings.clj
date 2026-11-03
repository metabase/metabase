(ns metabase.warehouse-schema.user-settings
  "The user-settable columns of Fields and Tables, and the flags their settings rows use to say a user set one.")

(def user-settable-field-columns
  "The Field columns users can set, whose user values `metabase_field_user_settings` records."
  #{:semantic_type :description :display_name :visibility_type :has_field_values :effective_type :coercion_strategy
    :fk_target_field_id :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity
    :custom_position})

(def field-set-flags
  "The user-settable Field columns sync also writes, mapped to the flag that says the user set the column, NULL
  included."
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set})

(def user-settable-table-columns
  "The Table columns users can set, whose user values `metabase_table_user_settings` records."
  #{:display_name :description :entity_type :visibility_type :caveats :points_of_interest :data_layer :data_source
    :owner_email :owner_user_id :field_order :show_in_getting_started :data_authority :is_published :collection_id})

(def table-set-flags
  "The user-settable Table columns a user can clear, mapped to the flag that says the user set the column, NULL
  included."
  {:description        :description_set
   :visibility_type    :visibility_type_set
   :caveats            :caveats_set
   :points_of_interest :points_of_interest_set
   :data_layer         :data_layer_set
   :data_source        :data_source_set})
