(ns metabase.models.field
  (:import com.metabase.corvus.api.ApiException)
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
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

(def class->base-type
  {java.lang.Boolean :BooleanField
   java.lang.Double :FloatField
   java.lang.Integer :IntegerField
   java.lang.Long :IntegerField
   java.lang.String :TextField
   java.sql.Timestamp :DateTimeField})

(def field-types
  "Not sure what this is for"
  #{:metric
    :dimension
    :info})

(defn value->base-type
  "Attempt to match a value we get back from the DB with the corresponding  base-type`."
  [v]
  (if-not v :UnknownField
          (or (class->base-type (type v))
              (throw (ApiException. (int 500) (format "Missing base type mapping for %s in metabase.models.field/class->base-type. Please add an entry."
                                                   (str (type v))))))))

(defentity Field
  (table :metabase_field))

(defmethod post-select Field [_ {:keys [table_id] :as field}]
  (assoc field
         :table (sel-fn :one "metabase.models.table/Table" :id table_id)))

(defmethod pre-insert Field [_ field]
  (let [defaults {:created_at (util/new-sql-date)
                  :updated_at (util/new-sql-date)
                  :active true
                  :preview_display true
                  :field_type :dimension
                  :position 0}]
    (let [{:keys [field_type base_type special_type] :as field} (merge defaults field)]
      (assoc field
             :base_type (name base_type)
             :special_type (when special_type (name special_type))
             :field_type (name field_type)))))
