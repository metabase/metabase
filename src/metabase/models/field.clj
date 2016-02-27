(ns metabase.models.field
  (:require [korma.core :as k]
            [metabase.db :refer :all]
            (metabase.models [common :as common]
                             [database :refer [Database]]
                             [field-values :refer [FieldValues]]
                             [foreign-key :refer [ForeignKey]]
                             [interface :as i])))

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
    :info        ; Non-numerical value that is not meant to be used
    :sensitive}) ; A Fields that should *never* be shown *anywhere*

(defn valid-metadata?
  "Predicate function that checks if the set of metadata types for a field are sensible."
  [base-type field-type special-type]
  (and (contains? base-types base-type)
       (contains? field-types field-type)
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
                  :position        0
                  :display_name    (common/name->human-readable-name (:name field))}]
    (merge defaults field)))

(defn- pre-cascade-delete [{:keys [id]}]
  (cascade-delete Field :parent_id id)
  (cascade-delete ForeignKey (k/where (or (= :origin_id id)
                                          (= :destination_id id))))
  (cascade-delete 'FieldValues :field_id id))

(defn ^:hydrate values
  "Return the `FieldValues` associated with this FIELD."
  [{:keys [id]}]
  (sel :many [FieldValues :field_id :values], :field_id id))

(defn qualified-name-components
  "Return the pieces that represent a path to FIELD, of the form `[table-name parent-fields-name* field-name]`."
  [{field-name :name, table-id :table_id, parent-id :parent_id, :as field}]
  (conj (if-let [parent (Field parent-id)]
          (qualified-name-components parent)
          [(sel :one :field ['Table :name], :id table-id)])
        field-name))

(defn qualified-name
  "Return a combined qualified name for FIELD, e.g. `table_name.parent_field_name.field_name`."
  [field]
  (apply str (interpose \. (qualified-name-components field))))

(defn table
  "Return the `Table` associated with this `Field`."
  {:arglists '([field])}
  [{:keys [table_id]}]
  (sel :one 'Table, :id table_id))

(defn field->fk-field
  "Attempts to follow a `ForeignKey` from the the given FIELD to a destination `Field`.

   Only evaluates if the given field has :special_type `fk`, otherwise does nothing."
  {:hydrate :target}
  [{:keys [id special_type]}]
  (when (= :fk special_type)
    (let [dest-id (sel :one :field [ForeignKey :destination_id] :origin_id id)]
      (Field dest-id))))

(extend (class Field)
  i/IEntity (merge i/IEntityDefaults
                   {:hydration-keys     (constantly [:destination :field :origin])
                    :types              (constantly {:base_type :keyword, :field_type :keyword, :special_type :keyword, :description :clob})
                    :timestamped?       (constantly true)
                    :can-read?          (constantly true)
                    :can-write?         i/superuser?
                    :pre-insert         pre-insert
                    :pre-cascade-delete pre-cascade-delete}))
