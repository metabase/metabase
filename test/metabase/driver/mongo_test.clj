(ns metabase.driver.mongo-test
  "Tests for Mongo driver."
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table] :as table])
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

;; DESCRIBE-DATABASE
(expect-when-testing-mongo
    {:tables #{{:name "checkins"}
               {:name "categories"}
               {:name "users"}
               {:name "venues"}}}
    (driver/describe-database (MongoDriver.) (mongo-db)))

;; DESCRIBE-TABLE
(expect-when-testing-mongo
  {:name   "venues"
   :fields #{{:name "name",
              :base-type :TextField}
             {:name "latitude",
              :base-type :FloatField}
             {:name "longitude",
              :base-type :FloatField}
             {:name "price",
              :base-type :IntegerField}
             {:name "category_id",
              :base-type :IntegerField}
             {:name "_id",
              :base-type :IntegerField,
              :pk? true}}}
  (driver/describe-table (MongoDriver.) (table-name->table :venues)))

;; ANALYZE-TABLE
(expect-when-testing-mongo
  (let [field-name->field (->> (table/fields (table-name->table :venues))
                               (group-by :name)
                               clojure.walk/keywordize-keys)
        field-id          #(:id (first (% field-name->field)))]
    {:row_count 100,
     :fields    [{:id (field-id :category_id) :values [2 3 4 5 6 7 10 11 12 13 14 15 18 19 20 29 40 43 44 46 48 49 50 58 64 67 71 74]}
                 {:id (field-id :name), :values nil}
                 {:id (field-id :price), :values [1 2 3 4]}]})
  (let [venues-table (table-name->table :venues)]
    (driver/analyze-table (MongoDriver.) venues-table (set (mapv :id (table/fields venues-table))))))

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
      {:special_type nil,        :base_type :DateField,    :name "last_login"}
      {:special_type :name,      :base_type :TextField,    :name "name"}
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
