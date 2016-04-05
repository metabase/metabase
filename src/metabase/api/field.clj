(ns metabase.api.field
  (:require [compojure.core :refer [GET PUT POST]]
            [medley.core :as m]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.db.metadata-queries :as metadata]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field] :as field]
                             [field-values :refer [FieldValues create-field-values-if-needed field-should-have-field-values?]])))

(defannotation FieldSpecialType
  "Param must be a valid `Field` special type."
  [symb value :nillable]
  (checkp-contains? field/special-types symb (keyword value)))

(defannotation FieldVisibilityType
  "Param must be a valid `Field` visibility type."
  [symb value :nillable]
  (checkp-contains? field/visibility-types symb (keyword value)))

(defannotation FieldType
  "Param must be a valid `Field` base type."
  [symb value :nillable]
  (checkp-contains? field/field-types symb (keyword value)))

(defendpoint GET "/:id"
  "Get `Field` with ID."
  [id]
  (->404 (Field id)
         read-check
         (hydrate [:table :db])))

(defendpoint PUT "/:id"
  "Update `Field` with ID."
  [id :as {{:keys [special_type visibility_type fk_target_field_id description display_name], :as body} :body}]
  {special_type    FieldSpecialType
   visibility_type FieldVisibilityType
   display_name    NonEmptyString}
  (let-404 [field (Field id)]
    (write-check field)
    (let [special_type       (if (contains? body :special_type) special_type (:special_type field))
          visibility_type    (or visibility_type (:visibility_type field))
          fk_target_field_id (when (= :fk special_type)
                               ;; only let target field be set for :fk type fields,
                               ;; and if it's not in the payload then leave the current value
                               (if (contains? body :fk_target_field_id)
                                 fk_target_field_id
                                 (:fk_target_field_id field)))]
      (check-400 (field/valid-metadata? (:base_type field) (:field_type field) special_type visibility_type))
      ;; validate that fk_target_field_id is a valid Field within the same database as our field
      (when fk_target_field_id
        (checkp (exists? Field :id fk_target_field_id) :fk_target_field_id "Invalid target field"))
      ;; update the Field.  start with keys that may be set to NULL then conditionally add other keys if they have values
      (check-500 (m/mapply upd Field id (merge {:description        description
                                                :special_type       special_type
                                                :visibility_type    visibility_type
                                                :fk_target_field_id fk_target_field_id}
                                               (when display_name {:display_name display_name}))))
      (Field id))))

(defendpoint GET "/:id/summary"
  "Get the count and distinct count of `Field` with ID."
  [id]
  (let-404 [field (Field id)]
    (read-check field)
    [[:count     (metadata/field-count field)]
     [:distincts (metadata/field-distinct-count field)]]))


(defendpoint GET "/:id/values"
  "If `Field`'s special type is `category`/`city`/`state`/`country`, or its base type is `BooleanField`, return
   all distinct values of the field, and a map of human-readable values defined by the user."
  [id]
  (let-404 [field (Field id)]
    (read-check field)
    (if-not (field-should-have-field-values? field)
      {:values {} :human_readable_values {}}
      (create-field-values-if-needed field))))


(defendpoint POST "/:id/value_map_update"
  "Update the human-readable values for a `Field` whose special type is `category`/`city`/`state`/`country`
   or whose base type is `BooleanField`."
  [id :as {{:keys [values_map]} :body}]
  {values_map [Required Dict]}
  (let-404 [field (Field id)]
    (write-check field)
    (check (field-should-have-field-values? field)
      [400 "You can only update the mapped values of a Field whose 'special_type' is 'category'/'city'/'state'/'country' or whose 'base_type' is 'BooleanField'."])
    (if-let [field-values-id (sel :one :id FieldValues :field_id id)]
      (check-500 (upd FieldValues field-values-id
                   :human_readable_values values_map))
      (create-field-values-if-needed field values_map)))
  {:status :success})


(define-routes)
