(ns metabase.models.field
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.metadata :refer [field-count field-distinct-count]]
            (metabase.models [database :refer [Database]])
            [metabase.util :as util]))

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
  (table :metabase_field))

(defmethod post-select Field [_ {:keys [table_id] :as field}]
  (util/assoc* field
               :table          (delay (sel :one 'metabase.models.table/Table :id table_id))
               :db             (delay @(:db @(:table <>)))
               :can_read       (delay @(:can_read @(:table <>)))
               :can_write      (delay @(:can_write @(:table <>)))
               :count          (delay (field-count <>))
               :distinct-count (delay (field-distinct-count <>))))

(defmethod pre-insert Field [_ field]
  (let [defaults {:created_at (util/new-sql-timestamp)
                  :updated_at (util/new-sql-timestamp)
                  :active true
                  :preview_display true
                  :field_type :dimension
                  :position 0}]
    (let [{:keys [field_type base_type special_type] :as field} (merge defaults field)]
      (assoc field
             :base_type (name base_type)
             :special_type (when special_type (name special_type))
             :field_type (name field_type)))))
