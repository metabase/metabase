(ns metabase.api.field
  (:require [compojure.core :refer [GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.db.metadata-queries :as metadata]
            [metabase.models
             [field :as field :refer [Field]]
             [field-values :refer [create-field-values-if-needed! field-should-have-field-values? FieldValues]]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(def ^:private FieldType
  "Schema for a valid `Field` type."
  (su/with-api-error-message (s/constrained s/Str #(isa? (keyword %) :type/*))
    "value must be a valid field type."))

(def ^:private FieldVisibilityType
  "Schema for a valid `Field` visibility type."
  (apply s/enum (map name field/visibility-types)))


(api/defendpoint GET "/:id"
  "Get `Field` with ID."
  [id]
  (-> (api/read-check Field id)
      (hydrate [:table :db])))


(api/defendpoint PUT "/:id"
  "Update `Field` with ID."
  [id :as {{:keys [caveats description display_name fk_target_field_id points_of_interest special_type visibility_type], :as body} :body}]
  {caveats            (s/maybe su/NonBlankString)
   description        (s/maybe su/NonBlankString)
   display_name       (s/maybe su/NonBlankString)
   fk_target_field_id (s/maybe s/Int)
   points_of_interest (s/maybe su/NonBlankString)
   special_type       (s/maybe FieldType)
   visibility_type    (s/maybe FieldVisibilityType)}
  (let [field              (api/write-check Field id)
        special_type       (keyword (or special_type (:special_type field)))
        ;; only let target field be set for :type/FK type fields, and if it's not in the payload then leave the current value
        fk_target_field_id (when (isa? special_type :type/FK)
                             (or fk_target_field_id (:fk_target_field_id field)))]
    ;; validate that fk_target_field_id is a valid Field
    ;; TODO - we should also check that the Field is within the same database as our field
    (when fk_target_field_id
      (api/checkp (db/exists? Field :id fk_target_field_id)
        :fk_target_field_id "Invalid target field"))
    ;; everything checks out, now update the field
    (api/check-500 (db/update! Field id
                     (u/select-keys-when (assoc body :fk_target_field_id fk_target_field_id)
                       :present #{:caveats :description :fk_target_field_id :points_of_interest :special_type :visibility_type}
                       :non-nil #{:display_name})))
    ;; return updated field
    (Field id)))

(api/defendpoint GET "/:id/summary"
  "Get the count and distinct count of `Field` with ID."
  [id]
  (let [field (api/read-check Field id)]
    [[:count     (metadata/field-count field)]
     [:distincts (metadata/field-distinct-count field)]]))


(api/defendpoint GET "/:id/values"
  "If `Field`'s special type derives from `type/Category`, or its base type is `type/Boolean`, return
   all distinct values of the field, and a map of human-readable values defined by the user."
  [id]
  (let [field (api/read-check Field id)]
    (if-not (field-should-have-field-values? field)
      {:values {} :human_readable_values {}}
      (create-field-values-if-needed! field))))


;; TODO - not sure this is used anymore
(api/defendpoint POST "/:id/value_map_update"
  "Update the human-readable values for a `Field` whose special type is `category`/`city`/`state`/`country`
   or whose base type is `type/Boolean`."
  [id :as {{:keys [values_map]} :body}]
  {values_map su/Map}
  (let [field (api/write-check Field id)]
    (api/check (field-should-have-field-values? field)
      [400 "You can only update the mapped values of a Field whose 'special_type' is 'category'/'city'/'state'/'country' or whose 'base_type' is 'type/Boolean'."])
    (if-let [field-values-id (db/select-one-id FieldValues, :field_id id)]
      (api/check-500 (db/update! FieldValues field-values-id
                       :human_readable_values values_map))
      (create-field-values-if-needed! field values_map)))
  {:status :success})


(api/define-routes)
