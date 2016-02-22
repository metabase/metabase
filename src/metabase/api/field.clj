(ns metabase.api.field
  (:require [compojure.core :refer [GET PUT POST]]
            [medley.core :as m]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.db.metadata-queries :as metadata]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field] :as field]
                             [field-values :refer [FieldValues create-field-values-if-needed field-should-have-field-values?]]
                             [foreign-key :refer [ForeignKey] :as fk])
            [metabase.util :as u]))

(defannotation FieldSpecialType
  "Param must be a valid `Field` special type."
  [symb value :nillable]
  (checkp-contains? field/special-types symb (keyword value)))

(defannotation FieldType
  "Param must be a valid `Field` base type."
  [symb value :nillable]
  (checkp-contains? field/field-types symb (keyword value)))

(defannotation ForeignKeyRelationship
  "Param must be a valid `ForeignKey` relationship: one of `1t1` (one-to-one)m
   `Mt1` (many-to-one), or `MtM` (many-to-many)."
  [symb value :nillable]
  (checkp-contains? fk/relationships symb (keyword value)))

(defendpoint GET "/:id"
  "Get `Field` with ID."
  [id]
  (->404 (Field id)
         read-check
         (hydrate [:table :db])))

(defendpoint PUT "/:id"
  "Update `Field` with ID."
  [id :as {{:keys [field_type special_type preview_display description display_name]} :body}]
  {field_type   FieldType
   special_type FieldSpecialType
   display_name NonEmptyString}
  (let-404 [field (Field id)]
    (write-check field)
    (let [field_type   (or field_type (:field_type field))
          special_type (or special_type (:special_type field))]
      (check-400 (field/valid-metadata? (:base_type field) field_type special_type))
      ;; update the Field.  start with keys that may be set to NULL then conditionally add other keys if they have values
      (check-500 (m/mapply upd Field id (merge {:description  description
                                                :field_type   field_type
                                                :special_type special_type}
                                               (when display_name               {:display_name display_name})
                                               (when-not (nil? preview_display) {:preview_display preview_display}))))
      (Field id))))

(defendpoint GET "/:id/summary"
  "Get the count and distinct count of `Field` with ID."
  [id]
  (let-404 [field (Field id)]
    (read-check field)
    [[:count     (metadata/field-count field)]
     [:distincts (metadata/field-distinct-count field)]]))


(defendpoint GET "/:id/foreignkeys"
  "Get `ForeignKeys` whose origin is `Field` with ID."
  [id]
  (read-check Field id)
  (-> (sel :many ForeignKey :origin_id id)
      (hydrate [:origin :table] [:destination :table])))


(defendpoint POST "/:id/foreignkeys"
  "Create a new `ForeignKey` relationgship with `Field` with ID as the origin."
  [id :as {{:keys [target_field relationship]} :body}]
  {target_field Required, relationship [Required ForeignKeyRelationship]}
  (write-check Field id)
  (write-check Field target_field)
  (-> (ins ForeignKey
        :origin_id id
        :destination_id target_field
        :relationship relationship)
      (hydrate [:origin :table] [:destination :table])))


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
  [id :as {{:keys [fieldId values_map]} :body}] ; WTF is the reasoning behind client passing fieldId in POST params?
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
