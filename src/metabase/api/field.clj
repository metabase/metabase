(ns metabase.api.field
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.db.metadata-queries :as metadata]
            [metabase.models
             [dimension :refer [Dimension]]
             [field :as field :refer [Field]]
             [field-values :as field-values :refer [FieldValues]]]
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

(defn- clear-dimension-on-fk-change! [{{dimension-id :id dimension-type :type} :dimensions :as field}]
  (when (and dimension-id (= :external dimension-type))
    (db/delete! Dimension :id dimension-id))
  true)

(defn- removed-fk-special-type? [old-special-type new-special-type]
  (and (not= old-special-type new-special-type)
       (isa? old-special-type :type/FK)
       (or (nil? new-special-type)
           (not (isa? new-special-type :type/FK)))))

(defn- internal-remapping-allowed? [base-type special-type]
  (and (isa? base-type :type/Integer)
       (or
        (nil? special-type)
        (isa? special-type :type/Category)
        (isa? special-type :type/Enum))))

(defn- clear-dimension-on-type-change!
  "Removes a related dimension if the field is moving to a type that
  does not support remapping"
  [{{old-dim-id :id, old-dim-type :type} :dimensions, :as old-field} base-type new-special-type]
  (when (and old-dim-id
             (= :internal old-dim-type)
             (not (internal-remapping-allowed? base-type new-special-type)))
    (db/delete! Dimension :id old-dim-id))
  true)

(api/defendpoint PUT "/:id"
  "Update `Field` with ID."
  [id :as {{:keys [caveats description display_name fk_target_field_id points_of_interest special_type visibility_type], :as body} :body}]
  {caveats            (s/maybe su/NonBlankString)
   description        (s/maybe su/NonBlankString)
   display_name       (s/maybe su/NonBlankString)
   fk_target_field_id (s/maybe su/IntGreaterThanZero)
   points_of_interest (s/maybe su/NonBlankString)
   special_type       (s/maybe FieldType)
   visibility_type    (s/maybe FieldVisibilityType)}
  (let [field              (hydrate (api/write-check Field id) :dimensions)
        new-special-type   (keyword (get body :special_type (:special_type field)))
        removed-fk?        (removed-fk-special-type? (:special_type field) new-special-type)
        fk-target-field-id (get body :fk_target_field_id (:fk_target_field_id field))]

    ;; validate that fk_target_field_id is a valid Field
    ;; TODO - we should also check that the Field is within the same database as our field
    (when fk-target-field-id
      (api/checkp (db/exists? Field :id fk-target-field-id)
        :fk_target_field_id "Invalid target field"))
    ;; everything checks out, now update the field
    (api/check-500
     (db/transaction
       (and
        (if removed-fk?
          (clear-dimension-on-fk-change! field)
          true)
        (clear-dimension-on-type-change! field (:base_type field) new-special-type)
        (db/update! Field id
          (u/select-keys-when (assoc body :fk_target_field_id (when-not removed-fk? fk-target-field-id))
            :present #{:caveats :description :fk_target_field_id :points_of_interest :special_type :visibility_type}
            :non-nil #{:display_name})))))
    ;; return updated field
    (hydrate (Field id) :dimensions)))

(api/defendpoint GET "/:id/summary"
  "Get the count and distinct count of `Field` with ID."
  [id]
  (let [field (api/read-check Field id)]
    [[:count     (metadata/field-count field)]
     [:distincts (metadata/field-distinct-count field)]]))

(def ^:private empty-field-values
  {:values []})

(api/defendpoint GET "/:id/values"
  "If `Field`'s special type derives from `type/Category`, or its base type is `type/Boolean`, return all distinct
  values of the field, and a map of human-readable values defined by the user."
  [id]
  (let [field (api/read-check Field id)]
    (if-let [field-values (and (field-values/field-should-have-field-values? field)
                               (field-values/create-field-values-if-needed! field))]
      (-> field-values
          (assoc :values (field-values/field-values->pairs field-values))
          (dissoc :human_readable_values))
      {:values []})))

(api/defendpoint POST "/:id/dimension"
  "Sets the dimension for the given field at ID"
  [id :as {{dimension-type :type, dimension-name :name, human_readable_field_id :human_readable_field_id} :body}]
  {dimension-type          (su/api-param "type" (s/enum "internal" "external"))
   dimension-name          (su/api-param "name" su/NonBlankString)
   human_readable_field_id (s/maybe su/IntGreaterThanZero)}
  (let [field (api/write-check Field id)]
    (api/check (or (= dimension-type "internal")
                   (and (= dimension-type "external")
                        human_readable_field_id))
      [400 "Foreign key based remappings require a human readable field id"])
    (if-let [dimension (Dimension :field_id id)]
      (db/update! Dimension (u/get-id dimension)
        {:type dimension-type
         :name dimension-name
         :human_readable_field_id human_readable_field_id})
      (db/insert! Dimension
        {:field_id id
         :type dimension-type
         :name dimension-name
         :human_readable_field_id human_readable_field_id}))
    (Dimension :field_id id)))

(api/defendpoint DELETE "/:id/dimension"
  "Remove the dimension associated to field at ID"
  [id]
  (let [field (api/write-check Field id)]
    (db/delete! Dimension :field_id id)
    api/generic-204-no-content))

;; match things like GET /field-literal%2Ccreated_at%2Ctype%2FDatetime/values
;; (this is how things like [field-literal,created_at,type/Datetime] look when URL-encoded)
(api/defendpoint GET "/field-literal%2C:field-name%2Ctype%2F:field-type/values"
  "Implementation of the field values endpoint for fields in the Saved Questions 'virtual' DB. This endpoint is just a
  convenience to simplify the frontend code. It just returns the standard 'empty' field values response."
  ;; we don't actually care what field-name or field-type are, so they're ignored
  [_ _]
  empty-field-values)

(defn- validate-human-readable-pairs
  "Human readable values are optional, but if present they must be present for each field value. Throws if invalid,
  returns a boolean indicating whether human readable values were found."
  [value-pairs]
  (let [human-readable-missing? #(= ::not-found (get % 1 ::not-found))
        has-human-readable-values? (not-any? human-readable-missing? value-pairs)]
    (api/check (or has-human-readable-values?
                   (every? human-readable-missing? value-pairs))
      [400 "If remapped values are specified, they must be specified for all field values"])
    has-human-readable-values?))

(defn- update-field-values! [field-value-id value-pairs]
  (let [human-readable-values? (validate-human-readable-pairs value-pairs)]
    (api/check-500 (db/update! FieldValues field-value-id
                     :values (map first value-pairs)
                     :human_readable_values (when human-readable-values?
                                              (map second value-pairs))))))

(defn- create-field-values!
  [field-or-id value-pairs]
  (let [human-readable-values? (validate-human-readable-pairs value-pairs)]
    (db/insert! FieldValues
      :field_id (u/get-id field-or-id)
      :values (map first value-pairs)
      :human_readable_values (when human-readable-values?
                               (map second value-pairs)))))

(api/defendpoint POST "/:id/values"
  "Update the fields values and human-readable values for a `Field` whose special type is
  `category`/`city`/`state`/`country` or whose base type is `type/Boolean`. The human-readable values are optional."
  [id :as {{value-pairs :values} :body}]
  {value-pairs [[(s/one s/Num "value") (s/optional su/NonBlankString "human readable value")]]}
  (let [field (api/write-check Field id)]
    (api/check (field-values/field-should-have-field-values? field)
      [400 (str "You can only update the human readable values of a mapped values of a Field whose 'special_type' "
                "is 'category'/'city'/'state'/'country' or whose 'base_type' is 'type/Boolean'.")])
    (if-let [field-value-id (db/select-one-id FieldValues, :field_id id)]
      (update-field-values! field-value-id value-pairs)
      (create-field-values! field value-pairs)))
  {:status :success})


(api/defendpoint POST "/:id/rescan_values"
  "Manually trigger an update for the FieldValues for this Field. Only applies to Fields that are eligible for
   FieldValues."
  [id]
  (api/check-superuser)
  (field-values/create-or-update-field-values! (api/check-404 (Field id)))
  {:status :success})

(api/defendpoint POST "/:id/discard_values"
  "Discard the FieldValues belonging to this Field. Only applies to fields that have FieldValues. If this Field's
   Database is set up to automatically sync FieldValues, they will be recreated during the next cycle."
  [id]
  (api/check-superuser)
  (field-values/clear-field-values! (api/check-404 (Field id)))
  {:status :success})


(api/define-routes)
