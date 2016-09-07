(ns metabase.api.field
  (:require [compojure.core :refer [GET PUT POST]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.db.metadata-queries :as metadata]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field] :as field]
                             [field-values :refer [FieldValues create-field-values-if-needed! field-should-have-field-values?]])))

(defannotation FieldSpecialType
  "Param must be a valid `Field` special type."
  [symb value :nillable]
  (checkp-contains? field/special-types symb (keyword value)))

(defannotation FieldVisibilityType
  "Param must be a valid `Field` visibility type."
  [symb value :nillable]
  (checkp-contains? field/visibility-types symb (keyword value)))


(defendpoint GET "/:id"
  "Get `Field` with ID."
  [id]
  (->404 (Field id)
         read-check
         (hydrate [:table :db])))


(defendpoint PUT "/:id"
  "Update `Field` with ID."
  [id :as {{:keys [caveats description display_name fk_target_field_id points_of_interest special_type visibility_type], :as body} :body}]
  {caveats            NonEmptyString
   description        NonEmptyString
   display_name       NonEmptyString
   fk_target_field_id Integer
   points_of_interest NonEmptyString
   special_type       FieldSpecialType
   visibility_type    FieldVisibilityType}

  (let-404 [field (Field id)]
    (write-check field)
    (let [special_type       (keyword (get body :special_type (:special_type field)))
          visibility_type    (or visibility_type (:visibility_type field))
          ;; only let target field be set for :fk type fields, and if it's not in the payload then leave the current value
          fk-target-field-id (when (= :fk special_type)
                               (get body :fk_target_field_id (:fk_target_field_id field)))]
      ;; make sure that the special type is allowed for the base type
      (check (field/valid-special-type-for-base-type? special_type (:base_type field))
        [400 (format "Special type %s cannot be used for fields with base type %s. Base type must be one of: %s"
                     special_type
                     (:base_type field)
                     (field/special-type->valid-base-types special_type))])
      ;; validate that fk_target_field_id is a valid Field
      ;; TODO - we should also check that the Field is within the same database as our field
      (when fk-target-field-id
        (checkp (db/exists? Field :id fk-target-field-id)
          :fk_target_field_id "Invalid target field"))
      ;; everything checks out, now update the field
      (check-500 (db/update! Field id (merge {:caveats            caveats
                                              :description        description
                                              :fk_target_field_id fk_target_field_id
                                              :points_of_interest points_of_interest
                                              :special_type       special_type
                                              :visibility_type    visibility_type}
                                             (when display_name {:display_name display_name}))))
      ;; return updated field
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
      (create-field-values-if-needed! field))))


(defendpoint POST "/:id/value_map_update"
  "Update the human-readable values for a `Field` whose special type is `category`/`city`/`state`/`country`
   or whose base type is `BooleanField`."
  [id :as {{:keys [values_map]} :body}]
  {values_map [Required Dict]}
  (let-404 [field (Field id)]
    (write-check field)
    (check (field-should-have-field-values? field)
      [400 "You can only update the mapped values of a Field whose 'special_type' is 'category'/'city'/'state'/'country' or whose 'base_type' is 'BooleanField'."])
    (if-let [field-values-id (db/select-one-id FieldValues, :field_id id)]
      (check-500 (db/update! FieldValues field-values-id
                   :human_readable_values values_map))
      (create-field-values-if-needed! field values_map)))
  {:status :success})


(define-routes)
