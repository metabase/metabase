(ns metabase.parameters.field
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn follow-fks
  "Automatically follow the target IDs in an FK `field` until we reach the PK it points to, and return that. For
  non-FK Fields, returns them as-is. For example, with the Sample Database:

     (follow-fks <PEOPLE.ID Field>)        ;-> <PEOPLE.ID Field>
     (follow-fks <REVIEWS.REVIEWER Field>) ;-> <PEOPLE.ID Field>

  This is used below to seamlessly handle either PK or FK Fields without having to think about which is which in the
  `search-values` and `remapped-value` functions."
  [{semantic-type :semantic_type, fk-target-field-id :fk_target_field_id, :as field}]
  (if (and (isa? semantic-type :type/FK)
           fk-target-field-id)
    (t2/select-one :model/Field :id fk-target-field-id)
    field))

(def ^:private default-max-field-search-limit 1000)

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

(mu/defn field->values :- ms/FieldValuesResult
  "Fetch FieldValues, if they exist, for a `field` and return them in an appropriate format for public/embedded
  use-cases."
  [{has-field-values-type :has_field_values, field-id :id, has_more_values :has_more_values, :as field}]
  ;; TODO: explain why using remapped fields is restricted to `has_field_values=list`
  (if-let [remapped-field-id (when (= has-field-values-type :list)
                               (chain-filter/remapped-field-id field-id))]
    {:values          (search-values (api/check-404 field)
                                     (api/check-404 (t2/select-one :model/Field :id remapped-field-id)))
     :field_id        field-id
     :has_more_values (boolean has_more_values)}
    (params.field-values/get-or-create-field-values-for-current-user! (api/check-404 field))))

(mu/defn search-values-from-field-id :- ms/FieldValuesResult
  "Search for values of a field given by `field-id` that contain `query`."
  [field-id query]
  (let [field        (api/read-check (t2/select-one :model/Field :id field-id))
        search-field (or (some->> (chain-filter/remapped-field-id field-id)
                                  (t2/select-one :model/Field :id))
                         field)]
    {:values          (search-values field search-field query)
     ;; assume there are more if doing a search, otherwise there are no more values
     :has_more_values (not (str/blank? query))
     :field_id        field-id}))
