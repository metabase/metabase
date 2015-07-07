(ns metabase.models.field
  (:require [korma.core :refer :all, :exclude [defentity]]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :as common]
                             [database :refer [Database]]
                             [field-values :refer [field-should-have-field-values? create-field-values create-field-values-if-needed]]
                             [foreign-key :refer [ForeignKey]]
                             [hydrate :refer [hydrate]]
                             [interface :refer :all])
            [metabase.util :as u]))

(declare field->fk-field)

(def ^:const special-types
  "Possible values for `Field` `:special_type`."
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

(def ^:const special-type->name
  "User-facing names for the `Field` special types."
  {:avatar            "Avatar Image URL"
   :category          "Category"
   :city              "City"
   :country           "Country"
   :desc              "Description"
   :fk                "Foreign Key"
   :id                "Entity Key"
   :image             "Image URL"
   :json              "Field containing JSON"
   :latitude          "Latitude"
   :longitude         "Longitude"
   :name              "Entity Name"
   :number            "Number"
   :state             "State"
   :timestamp_seconds "Timestamp - seconds since 1970"
   :url               "URL"
   :zip_code          "Zip Code"})

(def ^:const base-types
  "Possible values for `Field` `:base_type`."
  #{:BigIntegerField
    :BooleanField
    :CharField
    :DateField
    :DateTimeField
    :DecimalField
    :FloatField
    :IntegerField
    :TextField
    :TimeField
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
                    :position        0}]
      (merge defaults field)))

  (post-insert [_ field]
    (when (field-should-have-field-values? field)
      (future (create-field-values field)))
    field)

  (post-update [this {:keys [id] :as field}]
    ;; if base_type or special_type were affected then we should asynchronously create corresponding FieldValues objects if need be
    (when (or (contains? field :base_type)
              (contains? field :field_type)
              (contains? field :special_type))
      (future (create-field-values-if-needed (sel :one [this :id :table_id :base_type :special_type :field_type] :id id)))))

  (post-select [_ {:keys [table_id] :as field}]
    (map->FieldInstance
      (u/assoc* field
        :table               (delay (sel :one 'metabase.models.table/Table :id table_id))
        :db                  (delay @(:db @(:table <>)))
        :target              (delay (field->fk-field field))
        :human_readable_name (when (name :field)
                               (delay (common/name->human-readable-name (:name field)))))))

  (pre-cascade-delete [_ {:keys [id]}]
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
