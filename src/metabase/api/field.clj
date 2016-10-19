(ns metabase.api.field
  (:require [compojure.core :refer [GET PUT POST]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.db.metadata-queries :as metadata]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field] :as field]
                             [field-values :refer [FieldValues create-field-values-if-needed! field-should-have-field-values?]])
            metabase.types
            [metabase.util :as u]))

(defannotation FieldType
  "Param must be a valid `Field` type."
  [symb value :nillable]
  (checkp-with (u/rpartial isa? :type/*) symb (keyword value) (str "Invalid field type: " value)))

(defannotation FieldVisibilityType
  "Param must be a valid `Field` visibility type."
  [symb value :nillable]
  (checkp-contains? field/visibility-types symb (keyword value)))


(defendpoint GET "/:id"
  "Get `Field` with ID."
  [id]
  (-> (read-check Field id)
      (hydrate [:table :db])))


(defendpoint PUT "/:id"
  "Update `Field` with ID."
  [id :as {{:keys [caveats description display_name fk_target_field_id points_of_interest special_type visibility_type], :as body} :body}]
  {caveats            NonEmptyString
   description        NonEmptyString
   display_name       NonEmptyString
   fk_target_field_id Integer
   points_of_interest NonEmptyString
   special_type       FieldType
   visibility_type    FieldVisibilityType}
  (let [field (write-check Field id)]
    (let [special_type       (keyword (get body :special_type (:special_type field)))
          visibility_type    (or visibility_type (:visibility_type field))
          ;; only let target field be set for :type/FK type fields, and if it's not in the payload then leave the current value
          fk-target-field-id (when (isa? special_type :type/FK)
                               (get body :fk_target_field_id (:fk_target_field_id field)))]
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
  (let [field (read-check Field id)]
    [[:count     (metadata/field-count field)]
     [:distincts (metadata/field-distinct-count field)]]))


(defendpoint GET "/:id/values"
  "If `Field`'s special type derives from `type/Category`, or its base type is `type/Boolean`, return
   all distinct values of the field, and a map of human-readable values defined by the user."
  [id]
  (let [field (read-check Field id)]
    (if-not (field-should-have-field-values? field)
      {:values {} :human_readable_values {}}
      (create-field-values-if-needed! field))))


(defendpoint POST "/:id/value_map_update"
  "Update the human-readable values for a `Field` whose special type is `category`/`city`/`state`/`country`
   or whose base type is `type/Boolean`."
  [id :as {{:keys [values_map]} :body}]
  {values_map [Required Dict]}
  (let [field (write-check Field id)]
    (check (field-should-have-field-values? field)
      [400 "You can only update the mapped values of a Field whose 'special_type' is 'category'/'city'/'state'/'country' or whose 'base_type' is 'type/Boolean'."])
    (if-let [field-values-id (db/select-one-id FieldValues, :field_id id)]
      (check-500 (db/update! FieldValues field-values-id
                   :human_readable_values values_map))
      (create-field-values-if-needed! field values_map)))
  {:status :success})


(define-routes)
