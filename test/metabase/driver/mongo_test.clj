(ns metabase.driver.mongo-test
  "Tests for Mongo driver."
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table] :as table])
            [metabase.query-processor :as qp]
            [metabase.query-processor.expand :as ql]
            [metabase.query-processor-test :refer [rows]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.data.interface :as i])
  (:import org.bson.types.ObjectId
           metabase.driver.mongo.MongoDriver))

;; ## Logic for selectively running mongo

(defmacro expect-when-testing-mongo {:style/indent 0} [expected actual]
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

(def ^:const ^:private native-query
  "[{\"$project\": {\"_id\": \"$_id\"}},
    {\"$match\": {\"_id\": {\"$eq\": 1}}},
    {\"$group\": {\"_id\": null, \"count\": {\"$sum\": 1}}},
    {\"$sort\": {\"_id\": 1}},
    {\"$project\": {\"_id\": false, \"count\": true}}]")

(expect-when-testing-mongo
  {:status    :completed
   :row_count 1
   :data      {:rows        [[1]]
               :annotate?   nil
               :columns     ["count"]
               :cols        [{:name "count", :base_type :type/Integer}]
               :native_form {:collection "venues"
                             :query      native-query}}}
  (qp/process-query {:native   {:query      native-query
                                :collection "venues"}
                     :type     :native
                     :database (:id (mongo-db))}))

;; ## Tests for individual syncing functions

;; DESCRIBE-DATABASE
(expect-when-testing-mongo
  {:tables #{{:schema nil, :name "checkins"}
             {:schema nil, :name "categories"}
             {:schema nil, :name "users"}
             {:schema nil, :name "venues"}}}
  (driver/describe-database (MongoDriver.) (mongo-db)))

;; DESCRIBE-TABLE
(expect-when-testing-mongo
  {:schema nil
   :name   "venues"
   :fields #{{:name "name",
              :base-type :type/Text}
             {:name "latitude",
              :base-type :type/Float}
             {:name "longitude",
              :base-type :type/Float}
             {:name "price",
              :base-type :type/Integer}
             {:name "category_id",
              :base-type :type/Integer}
             {:name "_id",
              :base-type :type/Integer,
              :pk? true}}}
  (driver/describe-table (MongoDriver.) (mongo-db) (table-name->table :venues)))

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
  (for [field (db/select [Table :name :active :rows]
                :db_id (:id (mongo-db))
                {:order-by [:name]})]
    (into {} field)))

;; Test that Fields got synced correctly, and types are correct
(expect-when-testing-mongo
    [[{:special_type :type/PK,        :base_type :type/Integer,  :name "_id"}
      {:special_type :type/Name,      :base_type :type/Text,     :name "name"}]
     [{:special_type :type/PK,        :base_type :type/Integer,  :name "_id"}
      {:special_type nil,             :base_type :type/DateTime, :name "date"}
      {:special_type :type/Category,  :base_type :type/Integer,  :name "user_id"}
      {:special_type nil,             :base_type :type/Integer,  :name "venue_id"}]
     [{:special_type :type/PK,        :base_type :type/Integer,  :name "_id"}
      {:special_type nil,             :base_type :type/DateTime, :name "last_login"}
      {:special_type :type/Name,      :base_type :type/Text,     :name "name"}
      {:special_type :type/Category,  :base_type :type/Text,     :name "password"}]
     [{:special_type :type/PK,        :base_type :type/Integer,  :name "_id"}
      {:special_type :type/Category,  :base_type :type/Integer,  :name "category_id"}
      {:special_type :type/Latitude,  :base_type :type/Float,    :name "latitude"}
      {:special_type :type/Longitude, :base_type :type/Float,    :name "longitude"}
      {:special_type :type/Name,      :base_type :type/Text,     :name "name"}
      {:special_type :type/Category,  :base_type :type/Integer,  :name "price"}]]
    (for [nm table-names]
      (for [field (db/select [Field :name :base_type :special_type]
                    :active   true
                    :table_id (:id (table-name->table nm))
                    {:order-by [:name]})]
        (into {} field))))


;;; Check that we support Mongo BSON ID and can filter by it (#1367)

(i/def-database-definition ^:private with-bson-ids
  ["birds"
   [{:field-name "name", :base-type :type/Text}
    {:field-name "bird_id", :base-type :type/MongoBSONID}]
   [["Rasta Toucan" (ObjectId. "012345678901234567890123")]
    ["Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]])

(datasets/expect-with-engine :mongo
  [[2 "Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]
  (rows (data/dataset metabase.driver.mongo-test/with-bson-ids
          (data/run-query birds
            (ql/filter (ql/= $bird_id "abcdefabcdefabcdefabcdef"))))))
