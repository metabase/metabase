(ns metabase.api.field
  (:require
   [clojure.string :as str]
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.db.query :as mdb.query]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.dimension :refer [Dimension]]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.field-values :as field-values :refer [FieldValues]]
   [metabase.models.interface :as mi]
   [metabase.models.params.chain-filter :as chain-filter]
   [metabase.models.params.field-values :as params.field-values]
   [metabase.models.table :as table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.related :as related]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.server.middleware.session :as mw.session]
   [metabase.sync :as sync]
   [metabase.sync.concurrent :as sync.concurrent]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.text NumberFormat)))

(set! *warn-on-reflection* true)

(comment
  ;; idk why condo complains on this not being used when it is, in a keyword down there
  lib.schema.metadata/used)

;;; --------------------------------------------- Basic CRUD Operations ----------------------------------------------

(def ^:private default-max-field-search-limit 1000)

(def ^:private FieldVisibilityType
  "Schema for a valid `Field` visibility type."
  (into [:enum] (map name field/visibility-types)))

(defn get-field
  "Get `Field` with ID."
  [id {:keys [include-editable-data-model?]}]
  (let [field (-> (api/check-404 (t2/select-one Field :id id))
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
      (api/write-check Table (:table_id field))
      (api/check-403 (mi/can-read? field)))
    ;; ...but if we do, return the Field <3
    field))

(defn get-fields
  "Get `Field`s with IDs in `ids`."
  [ids]
  (when (seq ids)
    (-> (filter mi/can-read? (t2/select Field :id [:in ids]))
        (t2/hydrate [:table :db] :has_field_values :dimensions :name_field))))

(api/defendpoint GET "/:id"
  "Get `Field` with ID."
  [id include_editable_data_model]
  {id                          ms/PositiveInt
   include_editable_data_model ms/BooleanValue}
  (get-field id {:include-editable-data-model? include_editable_data_model}))

(defn- clear-dimension-on-fk-change! [{:keys [dimensions], :as _field}]
  (doseq [{dimension-id :id, dimension-type :type} dimensions]
    (when (and dimension-id (= :external dimension-type))
      (t2/delete! Dimension :id dimension-id))))

(defn- removed-fk-semantic-type? [old-semantic-type new-semantic-type]
  (and (not= old-semantic-type new-semantic-type)
       (isa? old-semantic-type :type/FK)
       (or (nil? new-semantic-type)
           (not (isa? new-semantic-type :type/FK)))))

(defn- internal-remapping-allowed? [base-type semantic-type]
  (and (isa? base-type :type/Integer)
       (or
        (nil? semantic-type)
        (isa? semantic-type :type/Category)
        (isa? semantic-type :type/Enum))))

(defn- clear-dimension-on-type-change!
  "Removes a related dimension if the field is moving to a type that
  does not support remapping"
  [{:keys [dimensions], :as _old-field} base-type new-semantic-type]
  (doseq [{old-dim-id :id, old-dim-type :type} dimensions]
    (when (and old-dim-id
               (= :internal old-dim-type)
               (not (internal-remapping-allowed? base-type new-semantic-type)))
      (t2/delete! Dimension :id old-dim-id))))

(defn- update-nested-fields-on-json-unfolding-change!
  "If JSON unfolding was enabled for a JSON field, it activates previously synced nested fields from the JSON field.
   If JSON unfolding was disabled for that field, it inactivates the nested fields from the JSON field.
   Returns nil."
  [old-field new-json-unfolding]
  (when (not= new-json-unfolding (:json_unfolding old-field))
    (if new-json-unfolding
      (let [update-result (t2/update! Field
                                      :table_id (:table_id old-field)
                                      :nfc_path [:like (str "[\"" (:name old-field) "\",%]")]
                                      {:active true})]
        (when (zero? update-result)
          ;; Sync the table if no nested fields exist. This means the table hasn't previously
          ;; been synced when JSON unfolding was enabled. This assumes the JSON field is already updated to have
          ;; JSON unfolding enabled.
          (let [table (field/table old-field)]
            (sync.concurrent/submit-task (fn [] (sync/sync-table! table))))))
      (t2/update! Field
                  :table_id (:table_id old-field)
                  :nfc_path [:like (str "[\"" (:name old-field) "\",%]")]
                  {:active false})))
  nil)

(api/defendpoint PUT "/:id"
  "Update `Field` with ID."
  [id :as {{:keys [caveats description display_name fk_target_field_id points_of_interest semantic_type
                   coercion_strategy visibility_type has_field_values settings nfc_path json_unfolding]
            :as   body} :body}]
  {id                 ms/PositiveInt
   caveats            [:maybe ms/NonBlankString]
   description        [:maybe ms/NonBlankString]
   display_name       [:maybe ms/NonBlankString]
   fk_target_field_id [:maybe ms/PositiveInt]
   points_of_interest [:maybe ms/NonBlankString]
   semantic_type      [:maybe ms/FieldSemanticOrRelationTypeKeywordOrString]
   coercion_strategy  [:maybe ms/CoercionStrategyKeywordOrString]
   visibility_type    [:maybe FieldVisibilityType]
   has_field_values   [:maybe ::lib.schema.metadata/column.has-field-values]
   settings           [:maybe ms/Map]
   nfc_path           [:maybe [:sequential ms/NonBlankString]]
   json_unfolding     [:maybe :boolean]}
  (let [field             (t2/hydrate (api/write-check Field id) :dimensions)
        new-semantic-type (keyword (get body :semantic_type (:semantic_type field)))
        [effective-type coercion-strategy]
        (or (when-let [coercion_strategy (keyword coercion_strategy)]
              (let [effective (types/effective-type-for-coercion coercion_strategy)]
                ;; throw an error in an else branch?
                (when (types/is-coercible? coercion_strategy (:base_type field) effective)
                  [effective coercion_strategy])))
            [(:base_type field) nil])
        removed-fk?        (removed-fk-semantic-type? (:semantic_type field) new-semantic-type)
        fk-target-field-id (get body :fk_target_field_id (:fk_target_field_id field))]

    ;; validate that fk_target_field_id is a valid Field
    ;; TODO - we should also check that the Field is within the same database as our field
    (when fk-target-field-id
      (api/checkp (t2/exists? Field :id fk-target-field-id)
        :fk_target_field_id "Invalid target field"))
    (when (and display_name
               (not removed-fk?)
               (not= (:display_name field) display_name))
      (t2/update! Dimension :field_id id {:name display_name}))
    ;; everything checks out, now update the field
    (api/check-500
     (t2/with-transaction [_conn]
       (when removed-fk?
         (clear-dimension-on-fk-change! field))
       (clear-dimension-on-type-change! field (:base_type field) new-semantic-type)
       (t2/update! Field id
                   (u/select-keys-when (assoc body
                                              :fk_target_field_id (when-not removed-fk? fk-target-field-id)
                                              :effective_type effective-type
                                              :coercion_strategy coercion-strategy)
                                       :present #{:caveats :description :fk_target_field_id :points_of_interest :semantic_type :visibility_type
                                                  :coercion_strategy :effective_type :has_field_values :nfc_path :json_unfolding}
                                       :non-nil #{:display_name :settings}))))
    (when (some? json_unfolding)
      (update-nested-fields-on-json-unfolding-change! field json_unfolding))
    ;; return updated field. note the fingerprint on this might be out of date if the task below would replace them
    ;; but that shouldn't matter for the datamodel page
    (u/prog1 (-> (t2/select-one Field :id id)
                 (t2/hydrate :dimensions :has_field_values)
                 (field/hydrate-target-with-write-perms))
      (when (not= effective-type (:effective_type field))
        (sync.concurrent/submit-task (fn [] (sync/refingerprint-field! <>)))))))

;;; ------------------------------------------------- Field Metadata -------------------------------------------------

(api/defendpoint GET "/:id/summary"
  "Get the count and distinct count of `Field` with ID."
  [id]
  {id ms/PositiveInt}
  (let [field (api/read-check Field id)]
    [[:count     (metadata-queries/field-count field)]
     [:distincts (metadata-queries/field-distinct-count field)]]))


;;; --------------------------------------------------- Dimensions ---------------------------------------------------

(api/defendpoint POST "/:id/dimension"
  "Sets the dimension for the given field at ID"
  [id :as {{dimension-type :type, dimension-name :name, human_readable_field_id :human_readable_field_id} :body}]
  {id                      ms/PositiveInt
   dimension-type          [:enum "internal" "external"]
   dimension-name          ms/NonBlankString
   human_readable_field_id [:maybe ms/PositiveInt]}
  (api/write-check Field id)
  (api/check (or (= dimension-type "internal")
                 (and (= dimension-type "external")
                      human_readable_field_id))
             [400 "Foreign key based remappings require a human readable field id"])
  (if-let [dimension (t2/select-one Dimension :field_id id)]
    (t2/update! Dimension (u/the-id dimension)
                {:type                    dimension-type
                 :name                    dimension-name
                 :human_readable_field_id human_readable_field_id})
    (t2/insert! Dimension
                {:field_id                id
                 :type                    dimension-type
                 :name                    dimension-name
                 :human_readable_field_id human_readable_field_id}))
  (t2/select-one Dimension :field_id id))

(api/defendpoint DELETE "/:id/dimension"
  "Remove the dimension associated to field at ID"
  [id]
  {id ms/PositiveInt}
  (api/write-check Field id)
  (t2/delete! Dimension :field_id id)
  api/generic-204-no-content)


;;; -------------------------------------------------- FieldValues ---------------------------------------------------

(def ^:private empty-field-values
  {:values []})

(declare search-values)

(mu/defn field->values :- ms/FieldValuesResult
  "Fetch FieldValues, if they exist, for a `field` and return them in an appropriate format for public/embedded
  use-cases."
  [{has-field-values-type :has_field_values, field-id :id, has_more_values :has_more_values, :as field}]
  ;; TODO: explain why using remapped fields is restricted to `has_field_values=list`
  (if-let [remapped-field-id (when (= has-field-values-type :list)
                               (chain-filter/remapped-field-id field-id))]
    {:values          (search-values (api/check-404 field)
                                     (api/check-404 (t2/select-one Field :id remapped-field-id)))
     :field_id        field-id
     :has_more_values (boolean has_more_values)}
    (params.field-values/get-or-create-field-values-for-current-user! (api/check-404 field))))

(mu/defn search-values-from-field-id :- ms/FieldValuesResult
  "Search for values of a field given by `field-id` that contain `query`."
  [field-id query]
  (let [field        (api/read-check (t2/select-one Field :id field-id))
        search-field (or (some->> (chain-filter/remapped-field-id field-id)
                                  (t2/select-one Field :id))
                         field)]
    {:values          (search-values field search-field query)
     ;; assume there are more if doing a search, otherwise there are no more values
     :has_more_values (not (str/blank? query))
     :field_id        field-id}))

(api/defendpoint GET "/:id/values"
  "If a Field's value of `has_field_values` is `:list`, return a list of all the distinct values of the Field (or
  remapped Field), and (if defined by a User) a map of human-readable remapped values. If `has_field_values` is not
  `:list`, checks whether we should create FieldValues for this Field; if so, creates and returns them."
  [id]
  {id ms/PositiveInt}
  (let [field (api/read-check (t2/select-one Field :id id))]
    (field->values field)))

;; match things like GET /field%2Ccreated_at%2options
;; (this is how things like [field,created_at,{:base-type,:type/Datetime}] look when URL-encoded)
(api/defendpoint GET "/field%2C:field-name%2C:options/values"
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

(api/defendpoint POST "/:id/values"
  "Update the fields values and human-readable values for a `Field` whose semantic type is
  `category`/`city`/`state`/`country` or whose base type is `type/Boolean`. The human-readable values are optional."
  [id :as {{value-pairs :values} :body}]
  {id          ms/PositiveInt
   value-pairs [:sequential [:or [:tuple :any] [:tuple :any ms/NonBlankString]]]}
  (let [field (api/write-check Field id)]
    (api/check (field-values/field-should-have-field-values? field)
      [400 (str "You can only update the human readable values of a mapped values of a Field whose value of "
                "`has_field_values` is `list` or whose 'base_type' is 'type/Boolean'.")])
    (let [human-readable-values? (validate-human-readable-pairs value-pairs)
          update-map             {:values                (map first value-pairs)
                                  :human_readable_values (when human-readable-values?
                                                           (map second value-pairs))}
          updated-pk             (mdb.query/update-or-insert! FieldValues {:field_id (u/the-id field), :type :full}
                                   (constantly update-map))]
      (api/check-500 (pos? updated-pk))))
  {:status :success})

(api/defendpoint POST "/:id/rescan_values"
  "Manually trigger an update for the FieldValues for this Field. Only applies to Fields that are eligible for
   FieldValues."
  [id]
  {id ms/PositiveInt}
  (let [field (api/write-check (t2/select-one Field :id id))]
    ;; Grant full permissions so that permission checks pass during sync. If a user has DB detail perms
    ;; but no data perms, they should stll be able to trigger a sync of field values. This is fine because we don't
    ;; return any actual field values from this API. (#21764)
    (mw.session/as-admin
     (field-values/create-or-update-full-field-values! field)))
  {:status :success})

(api/defendpoint POST "/:id/discard_values"
  "Discard the FieldValues belonging to this Field. Only applies to fields that have FieldValues. If this Field's
   Database is set up to automatically sync FieldValues, they will be recreated during the next cycle."
  [id]
  {id ms/PositiveInt}
  (field-values/clear-field-values-for-field! (api/write-check (t2/select-one Field :id id)))
  {:status :success})

;;; --------------------------------------------------- Searching ----------------------------------------------------

(defn- table-id [field]
  (u/the-id (:table_id field)))

(defn- db-id [field]
  (u/the-id (t2/select-one-fn :db_id Table :id (table-id field))))

(defn- follow-fks
  "Automatically follow the target IDs in an FK `field` until we reach the PK it points to, and return that. For
  non-FK Fields, returns them as-is. For example, with the Sample Database:

     (follow-fks <PEOPLE.ID Field>)        ;-> <PEOPLE.ID Field>
     (follow-fks <REVIEWS.REVIEWER Field>) ;-> <PEOPLE.ID Field>

  This is used below to seamlessly handle either PK or FK Fields without having to think about which is which in the
  `search-values` and `remapped-value` functions."
  [{semantic-type :semantic_type, fk-target-field-id :fk_target_field_id, :as field}]
  (if (and (isa? semantic-type :type/FK)
           fk-target-field-id)
    (t2/select-one Field :id fk-target-field-id)
    field))

(mu/defn search-values :- [:maybe ms/FieldValuesList]
  "Search for values of `search-field` that contain `value` (up to `limit`, if specified), and return pairs like

      [<value-of-field> <matching-value-of-search-field>].

   If `search-field` and `field` are the same, simply return 1-tuples like

      [<matching-value-of-field>].

   For example, with the Sample Database, you could search for the first three IDs & names of People whose name
  contains `Ma` as follows:

      (search-values <PEOPLE.ID Field> <PEOPLE.NAME Field> \"Ma\" 3)
      ;; -> ((14 \"Marilyne Mohr\")
             (36 \"Margot Farrell\")
             (48 \"Maryam Douglas\"))"
  ([field search-field]
   (search-values field search-field nil nil))
  ([field search-field value]
   (search-values field search-field value nil))
  ([field
    search-field
    value        :- [:maybe ms/NonBlankString]
    maybe-limit  :- [:maybe ms/PositiveInt]]
   (try
    (let [field        (follow-fks field)
          search-field (follow-fks search-field)
          limit        (or maybe-limit default-max-field-search-limit)]
      (metadata-queries/search-values-query field search-field value limit))
    (catch Throwable e
      (log/error e "Error searching field values")
      []))))

(api/defendpoint GET "/:id/search/:search-id"
  "Search for values of a Field with `search-id` that start with `value`. See docstring for
  `metabase.api.field/search-values` for a more detailed explanation."
  [id search-id value]
  {id        ms/PositiveInt
   search-id ms/PositiveInt
   value     ms/NonBlankString}
  (let [field        (api/check-404 (t2/select-one Field :id id))
        search-field (api/check-404 (t2/select-one Field :id search-id))]
    (api/check-403 (mi/can-read? field))
    (api/check-403 (mi/can-read? search-field))
    (search-values field search-field value mw.offset-paging/*limit*)))

(defn remapped-value
  "Search for one specific remapping where the value of `field` exactly matches `value`. Returns a pair like

      [<value-of-field> <value-of-remapped-field>]

   if a match is found.

   For example, with the Sample Database, you could find the name of the Person with ID 20 as follows:

      (remapped-value <PEOPLE.ID Field> <PEOPLE.NAME Field> 20)
      ;; -> [20 \"Peter Watsica\"]"
  [field remapped-field value]
  (try
    (let [field   (follow-fks field)
          results (qp/process-query
                   {:database (db-id field)
                    :type     :query
                    :query    {:source-table (table-id field)
                               :filter       [:= [:field (u/the-id field) nil] value]
                               :fields       [[:field (u/the-id field) nil]
                                              [:field (u/the-id remapped-field) nil]]
                               :limit        1}})]
      ;; return first row if it exists
      (first (get-in results [:data :rows])))
    ;; as with fn above this error can usually be safely ignored which is why log level is log/debug
    (catch Throwable e
      (log/debug e "Error searching for remapping")
      nil)))

(defn parse-query-param-value-for-field
  "Parse a `value` passed as a URL query param in a way appropriate for the `field` it belongs to. E.g. for text Fields
  the value doesn't need to be parsed; for numeric Fields we should parse it as a number."
  [field ^String value]
  (if (isa? (:base_type field) :type/Number)
    (.parse (NumberFormat/getInstance) value)
    value))

(api/defendpoint GET "/:id/remapping/:remapped-id"
  "Fetch remapped Field values."
  [id remapped-id value]
  {id          ms/PositiveInt
   remapped-id ms/PositiveInt
   value       ms/NonBlankString}
  (let [field          (api/read-check Field id)
        remapped-field (api/read-check Field remapped-id)
        value          (parse-query-param-value-for-field field value)]
    (remapped-value field remapped-field value)))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  {id ms/PositiveInt}
  (-> (t2/select-one Field :id id) api/read-check related/related))

(api/define-routes)
