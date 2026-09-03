(ns metabase.parameters.db
  "Application database queries for the parameters module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (hydration definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn remapped-field
  "The single row of the Honey SQL remapping `query`, or nil."
  [query]
  (t2/query-one query))

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(defn fields
  "The Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field :id [:in field-ids]))

(defn fields-fk-info
  "The id, FK target, and semantic type of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :fk_target_field_id :semantic_type] :id [:in field-ids]))

(defn field-fk-target-field-id
  "The FK target Field id of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one-fn :fk_target_field_id :model/Field field-id))

(defn field-base-type
  "The base type of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one-fn :base_type :model/Field :id field-id))

(defn field-name
  "The name of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one-fn :name :model/Field :id field-id))

(defn full-field-values-exist?
  "Whether complete, non-remapped FieldValues of type `full` exist for the Field with `field-id`."
  [field-id]
  (t2/exists? :model/FieldValues
              :field_id field-id, :values [:not= nil], :human_readable_values nil, :has_more_values false
              :type "full"))

(defn advanced-field-values-exist?
  "Whether complete, non-remapped FieldValues of type `advanced` with `hash-key` exist for the Field with `field-id`."
  [field-id hash-key]
  (t2/exists? :model/FieldValues
              :field_id field-id, :values [:not= nil], :human_readable_values nil, :has_more_values false
              :type "advanced", :hash_key hash-key))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn delete-field-values!
  "Delete the FieldValues with `id`."
  [id]
  (t2/delete! :model/FieldValues :id id))

(defn active-name-fields-for-tables
  "The `columns` of the active Fields of the Tables with `table-ids` whose semantic type matches the Honey SQL
  `name-type-clause`."
  [columns table-ids name-type-clause]
  (t2/select (into [:model/Field] columns)
             :table_id      [:in table-ids]
             :semantic_type name-type-clause
             :active        true))

(defn fields-with-columns
  "The `columns` of the Fields with `field-ids`."
  [columns field-ids]
  (t2/select (into [:model/Field] columns) :id [:in field-ids]))
