(ns metabase.warehouse-schema.field
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.warehouse-schema.models.field :as field]
   [toucan2.core :as t2]))

(defn get-field
  "Get `Field` with ID."
  [id {:keys [include-editable-data-model?]}]
  (let [field (-> (api/check-404 (t2/select-one :model/Field :id id))
                  (t2/hydrate [:table :db] :has_field_values :dimensions :name_field))
        field (if include-editable-data-model?
                (field/hydrate-target-with-write-perms field)
                (t2/hydrate field :target))]
    ;; Normal read perms = normal access.
    ;;
    ;; There's also a special case where we allow you to fetch a Field even if you don't have full read permissions for
    ;; it: if you have segmented query access to the Table it belongs to. In this case, we'll still let you fetch the
    ;; Field, since this is required to power features like Dashboard filters, but we'll treat this Field a little
    ;; differently in other endpoints such as the FieldValues fetching endpoint.
    ;;
    ;; Check for permissions and throw 403 if we don't have them...
    (if include-editable-data-model?
      (api/write-check :model/Table (:table_id field))
      (api/check-403 (mi/can-read? field)))
    ;; ...but if we do, return the Field <3
    field))

(defn get-fields
  "Get `Field`s with IDs in `ids`."
  [ids]
  (when (seq ids)
    (-> (filter mi/can-read? (t2/select :model/Field :id [:in ids]))
        (t2/hydrate :has_field_values [:dimensions :human_readable_field] :name_field))))
