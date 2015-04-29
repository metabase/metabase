(ns metabase.driver.mongo-test
  "Tests for Mongo driver."
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [interface :as i]
                             [mongo :as mongo])
            [metabase.driver.mongo.test-data :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test-data.data :refer [test-data]]
            [metabase.test.util :refer [expect-eval-actual-first resolve-private-fns]]))

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

(defmacro expect-with-data-loaded
  "Like `expect`, but forces the test database to be loaded/synced/etc. before running the test."
  [expected actual]
  `(expect (do @mongo-test-db
               ~expected)
     ~actual))

(defn- table-name->fake-table
  "Return an object that can be passed like a `Table` to driver sync functions."
  [table-name]
  {:pre [(keyword? table-name)]}
  {:db mongo-test-db
   :name (name table-name)})

(defn- field-name->fake-field
  "Return an object that can be passed like a `Field` to driver sync functions."
  [table-name field-name]
  {:pre [(keyword? table-name)
         (keyword? field-name)]}
  {:name (name field-name)
   :table (delay (table-name->fake-table table-name))})

;; ## Tests for connection functions

(expect true
  (driver/can-connect? @mongo-test-db))

(expect false
  (driver/can-connect? {:engine :mongo
                        :details {:conn_str "mongodb://123.4.5.6/bad-db-name?connectTimeoutMS=50"}})) ; timeout after 50ms instead of 10s so test's don't take forever

(expect false
  (driver/can-connect? {:engine :mongo
                        :details {:conn_str "mongodb://localhost:3000/bad-db-name?connectTimeoutMS=50"}}))

(expect false
  (driver/can-connect-with-details? :mongo {}))

(expect true
  (driver/can-connect-with-details? :mongo {:host "localhost"
                                            :port 27017
                                            :dbname "metabase-test"}))

;; should use default port 27017 if not specified
(expect true
  (driver/can-connect-with-details? :mongo {:host "localhost"
                                            :dbname "metabase-test"}))

(expect false
  (driver/can-connect-with-details? :mongo {:host "123.4.5.6"
                                            :dbname "bad-db-name?connectTimeoutMS=50"}))

(expect false
  (driver/can-connect-with-details? :mongo {:host "localhost"
                                            :port 3000
                                            :dbname "bad-db-name?connectTimeoutMS=50"}))


;; ## Tests for individual syncing functions

(resolve-private-fns metabase.driver.mongo field->base-type table->column-names)

;; ### active-table-names
(expect
    #{"checkins" "categories" "users" "venues"}
  (i/active-table-names mongo/driver @mongo-test-db))

;; ### table->column-names
(expect-with-data-loaded
    [#{:_id :name}
     #{:_id :date :venue_id :user_id}
     #{:_id :name :last_login}
     #{:_id :name :longitude :latitude :price :category_id}]
  (->> table-names
       (map table-name->fake-table)
       (map table->column-names)))

;; ### field->base-type
(expect-with-data-loaded
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
  (->> field-names
       (map (partial apply field-name->fake-field))
       (mapv field->base-type)))

;; ### active-column-names->type
(expect
    [{"_id" :IntegerField, "name" :TextField}
     {"_id" :IntegerField, "date" :DateField, "venue_id" :IntegerField, "user_id" :IntegerField}
     {"_id" :IntegerField, "name" :TextField, "last_login" :DateField}
     {"_id" :IntegerField, "name" :TextField, "longitude" :FloatField, "latitude" :FloatField, "price" :IntegerField, "category_id" :IntegerField}]
  (->> table-names
       (map table-name->fake-table)
       (mapv (partial i/active-column-names->type mongo/driver))))

;; ### table-pks
(expect
    [#{"_id"} #{"_id"} #{"_id"} #{"_id"}] ; _id for every table
  (->> table-names
       (map table-name->fake-table)
       (mapv (partial i/table-pks mongo/driver))))


;; ## Big-picture tests for the way data should look post-sync

;; Test that Tables got synced correctly, and row counts are correct
(expect-with-data-loaded
    [{:rows 75, :active true, :name "categories"}
     {:rows 1000, :active true, :name "checkins"}
     {:rows 15, :active true, :name "users"}
     {:rows 100, :active true, :name "venues"}]
  (sel :many :fields [Table :name :active :rows] :db_id @mongo-test-db-id (k/order :name)))

;; Test that Fields got synced correctly, and types are correct
(expect-with-data-loaded
    [({:special_type :id, :base_type :IntegerField, :field_type :info, :active true, :name "_id"}
      {:special_type :category, :base_type :DateField, :field_type :info, :active true, :name "last_login"}
      {:special_type :category, :base_type :TextField, :field_type :info, :active true, :name "name"})
     ({:special_type :id, :base_type :IntegerField, :field_type :info, :active true, :name "_id"}
      {:special_type :category, :base_type :DateField, :field_type :info, :active true, :name "last_login"}
      {:special_type :category, :base_type :TextField, :field_type :info, :active true, :name "name"})
     ({:special_type :id, :base_type :IntegerField, :field_type :info, :active true, :name "_id"}
      {:special_type :category, :base_type :DateField, :field_type :info, :active true, :name "last_login"}
      {:special_type :category, :base_type :TextField, :field_type :info, :active true, :name "name"})
     ({:special_type :id, :base_type :IntegerField, :field_type :info, :active true, :name "_id"}
      {:special_type :category, :base_type :DateField, :field_type :info, :active true, :name "last_login"}
      {:special_type :category, :base_type :TextField, :field_type :info, :active true, :name "name"})]
  (let [table->fields (fn [table-name]
                        (sel :many :fields [Field :name :active :field_type :base_type :special_type] :table_id (table-name->id :users) (k/order :name)))]
    (mapv table->fields table-names)))
