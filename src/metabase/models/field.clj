(ns metabase.models.field
  (:require [korma.core :as k]
            [schema.core :as schema]
            [metabase.db :refer :all]
            (metabase.models [common :as common]
                             [database :refer [Database]]
                             [field-values :refer [FieldValues]]
                             [foreign-key :refer [ForeignKey]]
                             [interface :as i])
            [metabase.util :as u]))

(derive :type/boolean :type/*)
(derive :type/collection :type/*)
(derive :type/datetime :type/*)
(derive :type/orderable :type/*)
(derive :type/special :type/*)
(derive :type/text :type/*)

;; TODO - Eventually I'd like to seperate these out into their own columns on Field (is_category, is_fk, and is_pk) since they are independent of the types applied to a Field
;; (e.g. a Field could theoretically be a PK, a category, and a unix timestamp (ms) at the same time)
(derive :type/special.fk :type/special)
(derive :type/special.pk :type/special)
(derive :type/special.category :type/special)

(derive :type/collection.array :type/collection)
(derive :type/collection.map   :type/collection)

(derive :type/datetime :type/orderable)
(derive :type/number   :type/orderable)

(derive :type/number.float :type/number)
(derive :type/number.float.decimal :type/number.float)

(derive :type/number.float.coordinate :type/number.float)
(derive :type/number.float.coordinate.latitude  :type/number.float.coordinate)
(derive :type/number.float.coordinate.longitude :type/number.float.coordinate)

(derive :type/number.integer :type/number)
(derive :type/number.integer.big :type/number.integer)

(derive :type/number.integer.geo :type/number.integer)
(derive :type/number.integer.geo.zip :type/number.integer.geo)

(derive :type/datetime.unix :type/datetime)
(derive :type/datetime.unix :type/number.integer)

(derive :type/datetime.unix.seconds      :type/datetime.unix)
(derive :type/datetime.unix.milliseconds :type/datetime.unix)

(derive :type/datetime.date :type/datetime)
(derive :type/datetime.time :type/datetime)

(derive :type/text.geo :type/text)
(derive :type/text.geo.city    :type/text.geo)
(derive :type/text.geo.state   :type/text.geo)
(derive :type/text.geo.country :type/text.geo)

(derive :type/text.description :type/text)
(derive :type/text.name        :type/text)
(derive :type/text.json        :type/text)
(derive :type/text.uuid        :type/text)

(derive :type/text.url              :type/text)
(derive :type/text.url.image        :type/text.url)
(derive :type/text.url.image.avatar :type/text.url.image)

(defn valid-type?
  "Is K a valid Field base/special type?"
  [k]
  (isa? k :type/*))

(def ValidType
  "Schema for valid base & special types (e.g., things that derive from `:type/*`)"
  (schema/named (schema/constrained schema/Keyword valid-type?)
                "Valid field type"))

(def ^:const field-types
  "Possible values for `Field.field_type`."
  #{:metric      ; A number that can be added, graphed, etc.
    :dimension   ; A high or low-cardinality numerical string value that is meant to be used as a grouping
    :info        ; Non-numerical value that is not meant to be used
    :sensitive}) ; A Fields that should *never* be shown *anywhere*

(i/defentity Field :metabase_field)

(defn- pre-insert [{:keys [base_type special_type], :as field}]
  (assert (valid-type? base_type))
  (when special_type (assert (valid-type? (keyword special_type))))
  (let [defaults {:active          true
                  :preview_display true
                  :field_type      :info
                  :position        0
                  :display_name    (common/name->human-readable-name (:name field))}]
    (merge defaults field)))

(defn- pre-update [{:keys [base_type special_type], :as field}]
  (when base_type    (assert (valid-type? (keyword base_type))))
  (when special_type (assert (valid-type? (keyword special_type))))
  field)

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
  (when (isa? special_type :type/special.fk)
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
                    :pre-update         pre-update
                    :pre-cascade-delete pre-cascade-delete}))


(u/require-dox-in-this-namespace)
