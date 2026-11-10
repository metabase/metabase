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
  "The user-settable Field columns a machine also writes, mapped to the flag that says the user set the column, NULL
  included."
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set
   :data_sensitivity   :data_sensitivity_set})

(def ^:private field-user-set-by-value-columns
  "The flagged columns whose non-NULL user value means the user set it, whatever the flag. A node of an older version
  writes a human `data_sensitivity` without `data_sensitivity_set`, which it does not know."
  #{:data_sensitivity})

(def field-ai-columns
  "The user-settable Field columns that can have an accepted AI value, mapped to the `metabase_field_user_settings`
  column that holds it. `metabase_field` holds the human value when a user set the column, else the AI value, else
  the value of sync and the classifiers."
  {:semantic_type    :ai_semantic_type
   :description      :ai_description
   :data_sensitivity :ai_data_sensitivity})

(mu/defn user-set-field-columns :- [:set (into [:enum] user-settable-field-columns)]
  "The columns the FieldUserSettings row `settings` says a user set; `coercion_strategy` follows `effective_type`."
  [settings :- [:maybe ::warehouse-schema.schema/field-user-settings]]
  (into #{}
        (filter (fn [column]
                  (cond
                    (field-set-flags column)      (or (true? (get settings (field-set-flags column)))
                                                      (and (field-user-set-by-value-columns column)
                                                           (some? (get settings column))))
                    (= column :coercion_strategy) (some? (:effective_type settings))
                    :else                         (some? (get settings column)))))
        user-settable-field-columns))

(mu/defn ai-set-field-columns :- [:set (into [:enum] (keys field-ai-columns))]
  "The columns of [[field-ai-columns]] whose accepted AI value `metabase_field` holds: `settings` has an AI value for
  the column and no user set it."
  [settings :- [:maybe ::warehouse-schema.schema/field-user-settings]]
  (let [user-set (user-set-field-columns settings)]
    (into #{}
          (filter (fn [column]
                    (and (some? (get settings (field-ai-columns column)))
                         (not (user-set column)))))
          (keys field-ai-columns))))

(mu/defn protected-field-columns :- [:set (into [:enum] user-settable-field-columns)]
  "The columns that sync and the classifiers must not write for the Field with `settings`: the user-set ones and the
  ones that hold an accepted AI value."
  [settings :- [:maybe ::warehouse-schema.schema/field-user-settings]]
  (into (user-set-field-columns settings) (ai-set-field-columns settings)))

(mu/defn field-value-source :- [:maybe [:enum :human :ai :deterministic]]
  "The layer that gave `metabase_field` its `value` of `column`: `:human`, `:ai` (see [[field-ai-columns]]),
  `:deterministic`, or nil when no layer has a value. `settings` is the Field's FieldUserSettings row or nil."
  [settings :- [:maybe ::warehouse-schema.schema/field-user-settings]
   column   :- (into [:enum] user-settable-field-columns)
   value    :- [:maybe [:or :keyword :string]]]
  (cond
    (contains? (user-set-field-columns settings) column) :human
    (contains? (ai-set-field-columns settings) column)   :ai
    (some? value)                                        :deterministic))

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
