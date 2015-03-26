(ns metabase.models.field
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database]]
                             [hydrate :refer [hydrate]]
                             [foreign-key :refer [ForeignKey]])
            [metabase.util :as u]))

(def special-types
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
    :url
    :zip_code})

(def special-type->name
  "User-facing names for the `Field` special types."
  {:avatar "Avatar Image URL"
   :category "Category"
   :city "City"
   :country "Country"
   :desc "Description"
   :fk "Foreign Key"
   :id "Entity Key"
   :image "Image URL"
   :json "Field containing JSON"
   :latitude "Latitude"
   :longitude "Longitude"
   :name "Entity Name"
   :number "Number"
   :state "State"
   :url "URL"
   :zip_code "Zip Code"})

(def base-types
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

(def field-types
  "Not sure what this is for"
  #{:metric
    :dimension
    :info})

(defentity Field
  (table :metabase_field)
  (assoc :hydration-keys #{:destination
                           :field
                           :origin}))

(defn field->fk-field
  "Attempts to follow a `ForeignKey` from the the given `Field` to a destination `Field`.

   Only evaluates if the given field has :special_type `fk`, otherwise does nothing."
  [{:keys [id special_type] :as field}]
  (when (= "fk" special_type)
    (let [dest-id (:destination_id (sel :one :fields [ForeignKey :destination_id] :origin_id id))]
      (sel :one Field :id dest-id))))

(defn field->fk-table
  "Attempts to follow a `ForeignKey` from the the given `Field` to a destination `Table`.
   This is a simple convenience for calling `field->fk-field` then hydrating :table

   Only evaluates if the given field has :special_type `fk`, otherwise does nothing."
  [field]
  (-> (field->fk-field field)
      (hydrate :table)
      (:table)))

(defmethod post-select Field [_ {:keys [table_id] :as field}]
  (u/assoc* field
            :table     (delay (sel :one 'metabase.models.table/Table :id table_id))
            :db        (delay @(:db @(:table <>)))
            :target    (delay (field->fk-field field))
            :can_read  (delay @(:can_read @(:table <>)))
            :can_write (delay @(:can_write @(:table <>)))))

(defmethod pre-insert Field [_ field]
  (let [defaults {:created_at      (u/new-sql-timestamp)
                  :updated_at      (u/new-sql-timestamp)
                  :active          true
                  :preview_display true
                  :field_type      :info
                  :position        0}]
    (let [{:keys [field_type base_type special_type] :as field} (merge defaults field)]
      (assoc field
             :base_type    (name base_type)
             :special_type (when special_type (name special_type))
             :field_type   (name field_type)))))

(defmethod pre-update Field [_ {:keys [field_type special_type] :as field}]
  (cond-> (assoc field :updated_at (u/new-sql-timestamp))
    field_type   (assoc :field_type   (name field_type))
    special_type (assoc :special_type (name special_type))))

(defmethod pre-cascade-delete Field [_ {:keys [id]}]
  (cascade-delete ForeignKey (where (or (= :origin_id id)
                                        (= :destination_id id))))
  (cascade-delete 'metabase.models.field-values/FieldValues :field_id id))
