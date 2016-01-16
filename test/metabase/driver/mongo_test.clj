(ns metabase.driver.mongo-test
  "Tests for Mongo driver."
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.util :refer [expect-eval-actual-first resolve-private-fns]])
  (:import metabase.driver.mongo.MongoDriver))

;; ## Logic for selectively running mongo

(defmacro expect-when-testing-mongo [expected actual]
  `(datasets/expect-when-testing-engine :mongo
     ~expected
     ~actual))

(defn- mongo-db []
  (data/get-or-create-test-data-db! (driver/engine->driver :mongo)))

;; ## Constants + Helper Fns/Macros
;; TODO - move these to metabase.test-data ?
(def ^:private ^:const table-names
  "The names of the various test data `Tables`."
  [:categories
   :checkins
   :users
   :venues])

(def ^:private ^:const field-names
  "Names of various test data `Fields`, as `[table-name field-name]` pairs."
  [[:categories :_id]
   [:categories :name]
   [:checkins :_id]
   [:checkins :date]
   [:checkins :user_id]
   [:checkins :venue_id]
   [:users :_id]
   [:users :last_login]
   [:users :name]
   [:venues :_id]
   [:venues :category_id]
   [:venues :latitude]
   [:venues :longitude]
   [:venues :name]
   [:venues :price]])

(defn- table-name->table
  "Return the `Table` matching TABLE-NAME in the Mongo `Test Data` DB."
  [table-name]
  {:pre [(keyword? table-name)]}
  (Table (datasets/with-engine :mongo
           (data/id table-name))))


;; ## Tests for connection functions

(expect-when-testing-mongo false
  (driver/can-connect-with-details? :mongo {:host   "localhost"
                                            :port   3000
                                            :dbname "bad-db-name"}))

(expect-when-testing-mongo false
  (driver/can-connect-with-details? :mongo {}))

(expect-when-testing-mongo true
  (driver/can-connect-with-details? :mongo {:host "localhost"
                                            :port 27017
                                            :dbname "metabase-test"}))

;; should use default port 27017 if not specified
(expect-when-testing-mongo true
  (driver/can-connect-with-details? :mongo {:host "localhost"
                                            :dbname "metabase-test"}))

(expect-when-testing-mongo false
  (driver/can-connect-with-details? :mongo {:host "123.4.5.6"
                                            :dbname "bad-db-name?connectTimeoutMS=50"}))

(expect-when-testing-mongo false
  (driver/can-connect-with-details? :mongo {:host "localhost"
                                            :port 3000
                                            :dbname "bad-db-name?connectTimeoutMS=50"}))


;; ## Tests for individual syncing functions

(resolve-private-fns metabase.driver.mongo field->base-type table->column-names)

;; ### active-tables
(expect-when-testing-mongo
    #{{:name "checkins"}
      {:name "categories"}
      {:name "users"}
      {:name "venues"}}
    (driver/active-tables (MongoDriver.) (mongo-db)))

;; ### table->column-names
(expect-when-testing-mongo
    [#{:_id :name}                                           ; categories
     #{:_id :date :venue_id :user_id}                        ; checkins
     #{:_id :name :last_login :password}                     ; users
     #{:_id :name :longitude :latitude :price :category_id}] ; venues
  (for [nm table-names]
    (table->column-names (table-name->table nm))))

;; ### field->base-type
(expect-when-testing-mongo
    [:IntegerField  ; categories._id
     :TextField     ; categories.name
     :IntegerField  ; checkins._id
     :DateField     ; checkins.date
     :IntegerField  ; checkins.user_id
     :IntegerField  ; checkins.venue_id
     :IntegerField  ; users._id
     :DateField     ; users.last_login
     :TextField     ; users.name
     :IntegerField  ; venues._id
     :IntegerField  ; venues.category_id
     :FloatField    ; venues.latitude
     :FloatField    ; venues.longitude
     :TextField     ; venues.name
     :IntegerField] ; venues.price
  (for [[table-name field-name] field-names]
    (field->base-type (Field (datasets/with-engine :mongo
                               (data/id table-name field-name))))))

;; ### active-column-names->type
(expect-when-testing-mongo
    [{"_id" :IntegerField, "name" :TextField}                                                                                                       ; categories
     {"_id" :IntegerField, "date" :DateField, "venue_id" :IntegerField, "user_id" :IntegerField}                                                    ; checkins
     {"_id" :IntegerField, "password" :TextField, "name" :TextField, "last_login" :DateField}                                                       ; users
     {"_id" :IntegerField, "name" :TextField, "longitude" :FloatField, "latitude" :FloatField, "price" :IntegerField, "category_id" :IntegerField}] ; venues
  (for [nm table-names]
    (driver/active-column-names->type (MongoDriver.) (table-name->table nm))))

;; ### table-pks
(expect-when-testing-mongo
    [#{"_id"} #{"_id"} #{"_id"} #{"_id"}] ; _id for every table
  (for [nm table-names]
    (driver/table-pks (MongoDriver.) (table-name->table nm))))


;; ## Big-picture tests for the way data should look post-sync

;; Test that Tables got synced correctly, and row counts are correct
(expect-when-testing-mongo
    [{:rows 75,   :active true, :name "categories"}
     {:rows 1000, :active true, :name "checkins"}
     {:rows 15,   :active true, :name "users"}
     {:rows 100,  :active true, :name "venues"}]
  (sel :many :fields [Table :name :active :rows] :db_id (:id (mongo-db)) (k/order :name)))

;; Test that Fields got synced correctly, and types are correct
(expect-when-testing-mongo
    [[{:special_type :id,        :base_type :IntegerField, :name "_id"}
      {:special_type :name,      :base_type :TextField,    :name "name"}]
     [{:special_type :id,        :base_type :IntegerField, :name "_id"}
      {:special_type nil,        :base_type :DateField,    :name "date"}
      {:special_type :category,  :base_type :IntegerField, :name "user_id"}
      {:special_type nil,        :base_type :IntegerField, :name "venue_id"}]
     [{:special_type :id,        :base_type :IntegerField, :name "_id"}
      {:special_type :category,  :base_type :DateField,    :name "last_login"}
      {:special_type :category,  :base_type :TextField,    :name "name"}
      {:special_type :category,  :base_type :TextField,    :name "password"}]
     [{:special_type :id,        :base_type :IntegerField, :name "_id"}
      {:special_type :category,  :base_type :IntegerField, :name "category_id"}
      {:special_type :latitude,  :base_type :FloatField,   :name "latitude"}
      {:special_type :longitude, :base_type :FloatField,   :name "longitude"}
      {:special_type :name,      :base_type :TextField,    :name "name"}
      {:special_type :category,  :base_type :IntegerField, :name "price"}]]
    (for [nm table-names]
      (sel :many :fields [Field :name :base_type :special_type], :active true, :table_id (:id (table-name->table nm))
           (k/order :name))))
