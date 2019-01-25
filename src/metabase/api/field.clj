(ns metabase.api.field
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase
             [query-processor :as qp]
             [related :as related]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.db.metadata-queries :as metadata]
            [metabase.models
             [dimension :refer [Dimension]]
             [field :as field :refer [Field]]
             [field-values :as field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]])
  (:import java.text.NumberFormat))

;;; --------------------------------------------- Basic CRUD Operations ----------------------------------------------

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
      (hydrate [:table :db] :has_field_values :dimensions :name_field)))

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
  [id :as {{:keys [caveats description display_name fk_target_field_id points_of_interest special_type
                   visibility_type has_field_values settings]
            :as body} :body}]
  {caveats            (s/maybe su/NonBlankString)
   description        (s/maybe su/NonBlankString)
   display_name       (s/maybe su/NonBlankString)
   fk_target_field_id (s/maybe su/IntGreaterThanZero)
   points_of_interest (s/maybe su/NonBlankString)
   special_type       (s/maybe FieldType)
   visibility_type    (s/maybe FieldVisibilityType)
   has_field_values   (s/maybe (apply s/enum (map name field/has-field-values-options)))
   settings           (s/maybe su/Map)}
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
            :present #{:caveats :description :fk_target_field_id :points_of_interest :special_type :visibility_type
                       :has_field_values}
            :non-nil #{:display_name :settings})))))
    ;; return updated field
    (hydrate (Field id) :dimensions)))


;;; ------------------------------------------------- Field Metadata -------------------------------------------------

(api/defendpoint GET "/:id/summary"
  "Get the count and distinct count of `Field` with ID."
  [id]
  (let [field (api/read-check Field id)]
    [[:count     (metadata/field-count field)]
     [:distincts (metadata/field-distinct-count field)]]))


;;; --------------------------------------------------- Dimensions ---------------------------------------------------

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


;;; -------------------------------------------------- FieldValues ---------------------------------------------------

(def ^:private empty-field-values
  {:values []})

(defn field->values
  "Fetch FieldValues, if they exist, for a `field` and return them in an appropriate format for public/embedded
  use-cases."
  [field]
  (api/check-404 field)
  (if-let [field-values (and (field-values/field-should-have-field-values? field)
                             (field-values/create-field-values-if-needed! field))]
    (-> field-values
        (assoc :values (field-values/field-values->pairs field-values))
        (dissoc :human_readable_values :created_at :updated_at :id))
    {:values [], :field_id (:id field)}))

(api/defendpoint GET "/:id/values"
  "If a Field's value of `has_field_values` is `list`, return a list of all the distinct values of the Field, and (if
  defined by a User) a map of human-readable remapped values."
  [id]
  (field->values (api/read-check Field id)))

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
      [400 (str "You can only update the human readable values of a mapped values of a Field whose value of "
                "`has_field_values` is `list` or whose 'base_type' is 'type/Boolean'.")])
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


;;; --------------------------------------------------- Searching ----------------------------------------------------

(defn- table-id [field]
  (u/get-id (:table_id field)))

(defn- db-id [field]
  (u/get-id (db/select-one-field :db_id Table :id (table-id field))))

(defn- follow-fks
  "Automatically follow the target IDs in an FK `field` until we reach the PK it points to, and return that. For
  non-FK Fields, returns them as-is. For example, with the Sample Dataset:

     (follow-fks <PEOPLE.ID Field>)        ;-> <PEOPLE.ID Field>
     (follow-fks <REVIEWS.REVIEWER Field>) ;-> <PEOPLE.ID Field>

  This is used below to seamlessly handle either PK or FK Fields without having to think about which is which in the
  `search-values` and `remapped-value` functions."
  [{special-type :special_type, fk-target-field-id :fk_target_field_id, :as field}]
  (if (and (isa? special-type :type/FK)
           fk-target-field-id)
    (db/select-one Field :id fk-target-field-id)
    field))

(defn- search-values-query
  "Generate the MBQL query used to power FieldValues search in `search-values` below. The actual query generated differs
  slightly based on whether the two Fields are the same Field."
  [field search-field value limit]
  {:database (db-id field)
   :type     :query
   :query    {:source-table (table-id field)
              :filter       [:starts-with [:field-id (u/get-id search-field)] value {:case-sensitive false}]
              ;; if both fields are the same then make sure not to refer to it twice in the `:breakout` clause.
              ;; Otherwise this will break certain drivers like BigQuery that don't support duplicate
              ;; identifiers/aliases
              :breakout     (if (= (u/get-id field) (u/get-id search-field))
                              [[:field-id (u/get-id field)]]
                              [[:field-id (u/get-id field)]
                               [:field-id (u/get-id search-field)]])
              :limit        limit}})

(s/defn search-values
  "Search for values of `search-field` that start with `value` (up to `limit`, if specified), and return like

      [<value-of-field> <matching-value-of-search-field>].

   For example, with the Sample Dataset, you could search for the first three IDs & names of People whose name starts
   with `Ma` as follows:

      (search-values <PEOPLE.ID Field> <PEOPLE.NAME Field> \"Ma\" 3)
      ;; -> ((14 \"Marilyne Mohr\")
             (36 \"Margot Farrell\")
             (48 \"Maryam Douglas\"))"
  [field search-field value & [limit]]
  (let [field   (follow-fks field)
        results (qp/process-query (search-values-query field search-field value limit))
        rows    (get-in results [:data :rows])]
    ;; if the two Fields are different, we'll get results like [[v1 v2] [v1 v2]]. That is the expected format and we can
    ;; return them as-is
    (if-not (= (u/get-id field) (u/get-id search-field))
      rows
      ;; However if the Fields are both the same results will be in the format [[v1] [v1]] so we need to double the
      ;; value to get the format the frontend expects
      (for [[result] rows]
        [result result]))))

(api/defendpoint GET "/:id/search/:search-id"
  "Search for values of a Field with `search-id` that start with `value`. See docstring for
  `metabase.api.field/search-values` for a more detailed explanation."
  [id search-id value limit]
  {value su/NonBlankString
   limit (s/maybe su/IntStringGreaterThanZero)}
  (let [field        (api/read-check Field id)
        search-field (api/read-check Field search-id)]
    (search-values field search-field value (when limit (Integer/parseInt limit)))))


(defn remapped-value
  "Search for one specific remapping where the value of `field` exactly matches `value`. Returns a pair like

      [<value-of-field> <value-of-remapped-field>]

   if a match is found.

   For example, with the Sample Dataset, you could find the name of the Person with ID 20 as follows:

      (remapped-value <PEOPLE.ID Field> <PEOPLE.NAME Field> 20)
      ;; -> [20 \"Peter Watsica\"]"
  [field remapped-field value]
  (let [field   (follow-fks field)
        results (qp/process-query
                  {:database (db-id field)
                   :type     :query
                   :query    {:source-table (table-id field)
                              :filter       [:= [:field-id (u/get-id field)] value]
                              :fields       [[:field-id (u/get-id field)]
                                             [:field-id (u/get-id remapped-field)]]
                              :limit        1}})]
    ;; return first row if it exists
    (first (get-in results [:data :rows]))))

(defn parse-query-param-value-for-field
  "Parse a `value` passed as a URL query param in a way appropriate for the `field` it belongs to. E.g. for text Fields
  the value doesn't need to be parsed; for numeric Fields we should parse it as a number."
  [field, ^String value]
  (if (isa? (:base_type field) :type/Number)
    (.parse (NumberFormat/getInstance) value)
    value))

(api/defendpoint GET "/:id/remapping/:remapped-id"
  "Fetch remapped Field values."
  [id remapped-id, ^String value]
  (let [field          (api/read-check Field id)
        remapped-field (api/read-check Field remapped-id)
        value          (parse-query-param-value-for-field field value)]
    (remapped-value field remapped-field value)))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  (-> id Field api/read-check related/related))

(api/define-routes)
