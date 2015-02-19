(ns metabase.models.field
  (:import com.metabase.corvus.api.ApiException)
  (:use korma.core))

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

(def special-type-names
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

(def class-base-types
  {java.lang.Boolean :BooleanField
   java.lang.Double :FloatField
   java.lang.Integer :IntegerField
   java.lang.Long :IntegerField
   java.lang.String :TextField
   java.sql.Timestamp :DateTimeField})

(defn base-type-for-value
  "Attempt to match a value we get back from the DB with the corresponding  base-type`."
  [v]
  (if-not v :UnknownField
          (or (class-base-types (type v))
              (throw (ApiException. (int 500) (format "Missing base type mapping for %s in metabase.models.field/class-base-types. Please add an entry."
                                                   (str (type v))))))))

(defentity Field
  (table :metabase_field))
