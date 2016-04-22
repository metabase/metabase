(ns metabase.models.field
  (:require [clojure.data :as d]
            [clojure.string :as s]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.db :as db]
            (metabase.models [common :as common]
                             [field-values :refer [FieldValues]]
                             [foreign-key :refer [ForeignKey]]
                             [interface :as i])
            [metabase.util :as u]))

(def ^:const special-types
  "Possible values for `Field.special_type`."
  #{:avatar
    :category
    :city
    :country
    :desc
    :fk
    :id
    :image
    :json
    :latitude
    :longitude
    :name
    :number
    :state
    :timestamp_milliseconds
    :timestamp_seconds
    :url
    :zip_code})

(def ^:const base-types
  "Possible values for `Field.base_type`."
  #{:ArrayField
    :BigIntegerField
    :BooleanField
    :CharField
    :DateField
    :DateTimeField
    :DecimalField
    :DictionaryField
    :FloatField
    :IntegerField
    :TextField
    :TimeField
    :UUIDField      ; e.g. a Postgres 'UUID' column
    :UnknownField})

(def ^:const field-types
  "Possible values for `Field.field_type`."
  #{:metric      ; A number that can be added, graphed, etc.
    :dimension   ; A high or low-cardinality numerical string value that is meant to be used as a grouping
    :info})      ; Non-numerical value that is not meant to be used

(def ^:const visibility-types
  "Possible values for `Field.visibility_type`."
  #{:normal         ; Default setting.  field has no visibility restrictions.
    :details-only   ; For long blob like columns such as JSON.  field is not shown in some places on the frontend.
    :hidden         ; Lightweight hiding which removes field as a choice in most of the UI.  should still be returned in queries.
    :sensitive      ; Strict removal of field from all places except data model listing.  queries should error if someone attempts to access.
    :retired})      ; For fields that no longer exist in the physical db.  automatically set by Metabase.  QP should error if encountered in a query.

(defn valid-metadata?
  "Predicate function that checks if the set of metadata types for a field are sensible."
  [base-type field-type special-type visibility-type]
  (and (contains? base-types base-type)
       (contains? field-types field-type)
       (contains? visibility-types visibility-type)
       (or (nil? special-type)
           (contains? special-types special-type))
       ;; this verifies that we have a numeric base-type when trying to use the unix timestamp transform (#824)
       (or (nil? special-type)
           (not (contains? #{:timestamp_milliseconds :timestamp_seconds} special-type))
           (contains? #{:BigIntegerField :DecimalField :FloatField :IntegerField} base-type))))


(i/defentity Field :metabase_field)

(defn- pre-insert [field]
  (let [defaults {:active          true
                  :preview_display true
                  :field_type      :info
                  :visibility_type :normal
                  :position        0
                  :display_name    (common/name->human-readable-name (:name field))}]
    (merge defaults field)))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete Field :parent_id id)
  (db/cascade-delete ForeignKey (k/where (or (= :origin_id id)
                                             (= :destination_id id))))
  (db/cascade-delete 'FieldValues :field_id id))

(defn ^:hydrate target
  "Return the FK target `Field` that this `Field` points to."
  [{:keys [special_type fk_target_field_id]}]
  (when (and (= :fk special_type)
             fk_target_field_id)
    (Field fk_target_field_id)))

(defn ^:hydrate values
  "Return the `FieldValues` associated with this FIELD."
  [{:keys [id]}]
  (db/sel :many [FieldValues :field_id :values], :field_id id))

(defn qualified-name-components
  "Return the pieces that represent a path to FIELD, of the form `[table-name parent-fields-name* field-name]`."
  [{field-name :name, table-id :table_id, parent-id :parent_id}]
  (conj (if-let [parent (Field parent-id)]
          (qualified-name-components parent)
          [(db/sel :one :field ['Table :name], :id table-id)])
        field-name))

(defn qualified-name
  "Return a combined qualified name for FIELD, e.g. `table_name.parent_field_name.field_name`."
  [field]
  (apply str (interpose \. (qualified-name-components field))))

(defn table
  "Return the `Table` associated with this `Field`."
  {:arglists '([field])}
  [{:keys [table_id]}]
  (db/sel :one 'Table, :id table_id))

(u/strict-extend (class Field)
  i/IEntity (merge i/IEntityDefaults
                   {:hydration-keys     (constantly [:destination :field :origin])
                    :types              (constantly {:base_type       :keyword
                                                     :field_type      :keyword
                                                     :special_type    :keyword
                                                     :visibility_type :keyword
                                                     :description     :clob})
                    :timestamped?       (constantly true)
                    :can-read?          (constantly true)
                    :can-write?         i/superuser?
                    :pre-insert         pre-insert
                    :pre-cascade-delete pre-cascade-delete}))


(def ^{:arglists '([field-name base-type])} infer-field-special-type
  "If `name` and `base-type` matches a known pattern, return the `special_type` we should assign to it."
  (let [bool-or-int #{:BooleanField :BigIntegerField :IntegerField}
        float       #{:DecimalField :FloatField}
        int-or-text #{:BigIntegerField :IntegerField :CharField :TextField}
        text        #{:CharField :TextField}
        ;; tuples of [pattern set-of-valid-base-types special-type
        ;; * Convert field name to lowercase before matching against a pattern
        ;; * consider a nil set-of-valid-base-types to mean "match any base type"
        pattern+base-types+special-type [[#"^.*_lat$"       float       :latitude]
                                         [#"^.*_lon$"       float       :longitude]
                                         [#"^.*_lng$"       float       :longitude]
                                         [#"^.*_long$"      float       :longitude]
                                         [#"^.*_longitude$" float       :longitude]
                                         [#"^.*_rating$"    int-or-text :category]
                                         [#"^.*_type$"      int-or-text :category]
                                         [#"^.*_url$"       text        :url]
                                         [#"^_latitude$"    float       :latitude]
                                         [#"^active$"       bool-or-int :category]
                                         [#"^city$"         text        :city]
                                         [#"^country$"      text        :country]
                                         [#"^countryCode$"  text        :country]
                                         [#"^currency$"     int-or-text :category]
                                         [#"^first_name$"   text        :name]
                                         [#"^full_name$"    text        :name]
                                         [#"^gender$"       int-or-text :category]
                                         [#"^last_name$"    text        :name]
                                         [#"^lat$"          float       :latitude]
                                         [#"^latitude$"     float       :latitude]
                                         [#"^lon$"          float       :longitude]
                                         [#"^lng$"          float       :longitude]
                                         [#"^long$"         float       :longitude]
                                         [#"^longitude$"    float       :longitude]
                                         [#"^name$"         text        :name]
                                         [#"^postalCode$"   int-or-text :zip_code]
                                         [#"^postal_code$"  int-or-text :zip_code]
                                         [#"^rating$"       int-or-text :category]
                                         [#"^role$"         int-or-text :category]
                                         [#"^sex$"          int-or-text :category]
                                         [#"^state$"        text        :state]
                                         [#"^status$"       int-or-text :category]
                                         [#"^type$"         int-or-text :category]
                                         [#"^url$"          text        :url]
                                         [#"^zip_code$"     int-or-text :zip_code]
                                         [#"^zipcode$"      int-or-text :zip_code]]]
    ;; Check that all the pattern tuples are valid
    (doseq [[name-pattern base-types special-type] pattern+base-types+special-type]
      (assert (= (type name-pattern) java.util.regex.Pattern))
      (assert (every? (partial contains? base-types) base-types))
      (assert (contains? special-types special-type)))

    (fn [field-name base_type]
      (when (and (string? field-name)
                 (keyword? base_type))
        (or (when (= "id" (s/lower-case field-name)) :id)
            (when-let [matching-pattern (m/find-first (fn [[name-pattern valid-base-types _]]
                                                        (and (or (nil? valid-base-types)
                                                                 (contains? valid-base-types base_type))
                                                             (re-matches name-pattern (s/lower-case field-name))))
                                                      pattern+base-types+special-type)]
              ;; the actual special-type is the last element of the pattern
              (last matching-pattern)))))))


(defn update-field
  "Update an existing `Field` from the given FIELD-DEF."
  [{:keys [id], :as existing-field} {field-name :name, :keys [base-type special-type pk? parent-id]}]
  (let [updated-field (assoc existing-field
                        :base_type    base-type
                        :display_name (or (:display_name existing-field)
                                          (common/name->human-readable-name field-name))
                        :special_type (or (:special_type existing-field)
                                          special-type
                                          (when pk? :id)
                                          (infer-field-special-type field-name base-type))

                        :parent_id    parent-id)
        [is-diff? _ _] (d/diff updated-field existing-field)]
    ;; if we have a different base-type or special-type, then update
    (when is-diff?
      (db/upd Field id
              :display_name (:display_name updated-field)
              :base_type    base-type
              :special_type (:special_type updated-field)
              :parent_id    parent-id))
    ;; return the updated field when we are done
    updated-field))


(defn create-field
  "Create a new `Field` from the given FIELD-DEF."
  [table-id {field-name :name, :keys [base-type special-type pk? parent-id raw-column-id]}]
  {:pre [(integer? table-id)
         (string? field-name)
         (contains? base-types base-type)]}
  (db/ins Field
          :table_id       table-id
          :raw_column_id  raw-column-id
          :name           field-name
          :display_name   (common/name->human-readable-name field-name)
          :base_type      base-type
          :special_type   (or special-type
                              (when pk? :id)
                              (infer-field-special-type field-name base-type))
          :parent_id      parent-id))
