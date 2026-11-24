(ns metabase.warehouse-schema.dependencies
  "The column data of the dependencies specs of a Field and of its user settings.")

(set! *warn-on-reflection* true)

(def field-columns
  "The Field columns whose update changes what the entities reading the Field's Table read."
  #{:name :display_name :description :active :visibility_type :settings :base_type :effective_type :database_type
    :semantic_type :coercion_strategy :fk_target_field_id :position})
