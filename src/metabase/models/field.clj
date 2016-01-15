(ns metabase.models.field
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :as common]
                             [database :refer [Database]]
                             [field-values :refer [FieldValues field-should-have-field-values? create-field-values-if-needed]]
                             [foreign-key :refer [ForeignKey]]
                             [hydrate :refer [hydrate]]
                             [interface :refer :all])
            [metabase.util :as u]))

(declare field->fk-field
         qualified-name-components)

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
  #{:BigIntegerField
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

(defrecord FieldInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite FieldInstance :read :always, :write :superuser)


(defentity Field
  [(table :metabase_field)
   (hydration-keys destination field origin)
   (types :base_type :keyword, :field_type :keyword, :special_type :keyword)
   timestamped]

  (pre-insert [_ field]
    (let [defaults {:active          true
                    :preview_display true
                    :field_type      :info
                    :position        0
                    :display_name    (common/name->human-readable-name (:name field))}]
      (merge defaults field)))

  (post-insert [_ field]
    (when (field-should-have-field-values? field)
      (create-field-values-if-needed field))
    field)

  (post-update [this {:keys [id] :as field}]
    ;; if base_type or special_type were affected then we should asynchronously create corresponding FieldValues objects if need be
    (when (or (contains? field :base_type)
              (contains? field :field_type)
              (contains? field :special_type))
      (create-field-values-if-needed (sel :one [this :id :table_id :base_type :special_type :field_type] :id id))))

  (post-select [this {:keys [id table_id parent_id] :as field}]
    (map->FieldInstance
     (u/assoc<> field
       :table                     (delay (sel :one 'metabase.models.table/Table :id table_id))
       :db                        (delay @(:db @(:table <>)))
       :target                    (delay (field->fk-field field))
       :parent                    (when parent_id
                                    (delay (this parent_id)))
       :children                  (delay (sel :many this :parent_id (:id field)))
       :values                    (delay (sel :many [FieldValues :field_id :values] :field_id id))
       :qualified-name-components (delay (qualified-name-components <>))
       :qualified-name            (delay (apply str (interpose "." @(:qualified-name-components <>)))))))

  (pre-cascade-delete [this {:keys [id]}]
    (cascade-delete this :parent_id id)
    (cascade-delete ForeignKey (where (or (= :origin_id id)
                                          (= :destination_id id))))
    (cascade-delete 'metabase.models.field-values/FieldValues :field_id id)))

(extend-ICanReadWrite FieldEntity :read :always, :write :superuser)


(defn field->fk-field
  "Attempts to follow a `ForeignKey` from the the given `Field` to a destination `Field`.

   Only evaluates if the given field has :special_type `fk`, otherwise does nothing."
  [{:keys [id special_type] :as field}]
  (when (= :fk special_type)
    (let [dest-id (sel :one :field [ForeignKey :destination_id] :origin_id id)]
      (Field dest-id))))

(defn unflatten-nested-fields
  "Take a sequence of both top-level and nested FIELDS, and return a sequence of top-level `Fields`
   with nested `Fields` moved into sequences keyed by `:children` in their parents.

     (unflatten-nested-fields [{:id 1, :parent_id nil}, {:id 2, :parent_id 1}])
       -> [{:id 1, :parent_id nil, :children [{:id 2, :parent_id 1, :children nil}]}]

   You may optionally specify a different PARENT-ID-KEY; the default is `:parent_id`."
  ([fields]
   (unflatten-nested-fields fields :parent_id))
  ([fields parent-id-key]
   (let [parent-id->fields (group-by parent-id-key fields)
         resolve-children  (fn resolve-children [field]
                             (assoc field :children (map resolve-children
                                                         (parent-id->fields (:id field)))))]
     (map resolve-children (parent-id->fields nil)))))

(defn- qualified-name-components
  "Return the pieces that represent a path to FIELD, of the form `[table-name parent-fields-name* field-name]`."
  [{:keys [table parent], :as field}]
  {:pre [(delay? table)]}
  (conj (if parent
          (qualified-name-components @parent)
          [(:name @table)])
        (:name field)))
