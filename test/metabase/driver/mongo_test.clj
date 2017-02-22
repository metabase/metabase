(ns metabase.driver.mongo-test
  "Tests for Mongo driver."
  (:require [clojure.walk :as walk]
            [expectations :refer :all]
            [toucan.db :as db]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [table :refer [Table] :as table])
            [metabase.query-processor :as qp]
            [metabase.query-processor.expand :as ql]
            [metabase.query-processor-test :refer [rows]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.data.interface :as i]
            [metabase.test.util :as tu])
  (:import org.bson.types.ObjectId
           org.joda.time.DateTime
           metabase.driver.mongo.MongoDriver))

;; ## Constants + Helper Fns/Macros
;; TODO - move these to metabase.test-data ?
(def ^:private ^:const table-names
  "The names of the various test data `Tables`."
  [:categories
   :checkins
   :users
   :venues])

;; ## Tests for connection functions

(datasets/expect-with-engine :mongo
  false
  (driver/can-connect-with-details? :mongo {:host   "localhost"
                                            :port   3000
                                            :dbname "bad-db-name"}))

(datasets/expect-with-engine :mongo
  false
  (driver/can-connect-with-details? :mongo {}))

(datasets/expect-with-engine :mongo
  true
  (driver/can-connect-with-details? :mongo {:host "localhost"
                                            :port 27017
                                            :dbname "metabase-test"}))

;; should use default port 27017 if not specified
(datasets/expect-with-engine :mongo
  true
  (driver/can-connect-with-details? :mongo {:host "localhost"
                                            :dbname "metabase-test"}))

(datasets/expect-with-engine :mongo
  false
  (driver/can-connect-with-details? :mongo {:host "123.4.5.6"
                                            :dbname "bad-db-name?connectTimeoutMS=50"}))

(datasets/expect-with-engine :mongo
  false
  (driver/can-connect-with-details? :mongo {:host "localhost"
                                            :port 3000
                                            :dbname "bad-db-name?connectTimeoutMS=50"}))

(def ^:const ^:private native-query
  "[{\"$project\": {\"_id\": \"$_id\"}},
    {\"$match\": {\"_id\": {\"$eq\": 1}}},
    {\"$group\": {\"_id\": null, \"count\": {\"$sum\": 1}}},
    {\"$sort\": {\"_id\": 1}},
    {\"$project\": {\"_id\": false, \"count\": true}}]")

(datasets/expect-with-engine :mongo
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
                     :database (data/id)}))

;; ## Tests for individual syncing functions

;; DESCRIBE-DATABASE
(datasets/expect-with-engine :mongo
  {:tables #{{:schema nil, :name "checkins"}
             {:schema nil, :name "categories"}
             {:schema nil, :name "users"}
             {:schema nil, :name "venues"}}}
  (driver/describe-database (MongoDriver.) (data/db)))

;; DESCRIBE-TABLE
(datasets/expect-with-engine :mongo
  {:schema nil
   :name   "venues"
   :fields #{{:name "name"
              :base-type :type/Text}
             {:name "latitude"
              :base-type :type/Float}
             {:name "longitude"
              :base-type :type/Float}
             {:name "price"
              :base-type :type/Integer}
             {:name "category_id"
              :base-type :type/Integer}
             {:name "_id"
              :base-type :type/Integer
              :pk? true}}}
  (driver/describe-table (MongoDriver.) (data/db) (Table (data/id :venues))))

;; ANALYZE-TABLE
(datasets/expect-with-engine :mongo
  {:row_count 100
   :fields    [{:id (data/id :venues :category_id) :values [2 3 4 5 6 7 10 11 12 13 14 15 18 19 20 29 40 43 44 46 48 49 50 58 64 67 71 74]}
               {:id (data/id :venues :name),       :values (db/select-one-field :values FieldValues, :field_id (data/id :venues :name))}
               {:id (data/id :venues :price),      :values [1 2 3 4]}]}
  (let [venues-table (Table (data/id :venues))]
    (driver/analyze-table (MongoDriver.) venues-table (set (mapv :id (table/fields venues-table))))))

;; ## Big-picture tests for the way data should look post-sync

;; Test that Tables got synced correctly, and row counts are correct
(datasets/expect-with-engine :mongo
  [{:rows 75,   :active true, :name "categories"}
   {:rows 1000, :active true, :name "checkins"}
   {:rows 15,   :active true, :name "users"}
   {:rows 100,  :active true, :name "venues"}]
  (for [field (db/select [Table :name :active :rows]
                :db_id (data/id)
                {:order-by [:name]})]
    (into {} field)))

;; Test that Fields got synced correctly, and types are correct
(datasets/expect-with-engine :mongo
  [[{:special_type :type/PK,        :base_type :type/Integer,  :name "_id"}
    {:special_type :type/Name,      :base_type :type/Text,     :name "name"}]
   [{:special_type :type/PK,        :base_type :type/Integer,  :name "_id"}
    {:special_type nil,             :base_type :type/DateTime, :name "date"}
    {:special_type :type/Category,  :base_type :type/Integer,  :name "user_id"}
    {:special_type :type/Category,  :base_type :type/Integer,  :name "venue_id"}]
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
  (vec (for [table-name table-names]
         (vec (for [field (db/select [Field :name :base_type :special_type]
                            :active   true
                            :table_id (data/id table-name)
                            {:order-by [:name]})]
                (into {} field))))))


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


;;; ------------------------------------------------------------ Test that we can handle native queries with "ISODate(...)" forms (#3741) ------------------------------------------------------------
(tu/resolve-private-vars metabase.driver.mongo.query-processor
  maybe-decode-iso-date-fncall decode-iso-date-fncalls encode-iso-date-fncalls)

(expect
  "[{\"$match\":{\"date\":{\"$gte\":[\"___ISODate\", \"2012-01-01\"]}}}]"
  (encode-iso-date-fncalls "[{\"$match\":{\"date\":{\"$gte\":ISODate(\"2012-01-01\")}}}]"))

(expect
  (DateTime. "2012-01-01")
  (maybe-decode-iso-date-fncall ["___ISODate" "2012-01-01"]))

(expect
  [{:$match {:date {:$gte (DateTime. "2012-01-01")}}}]
  (decode-iso-date-fncalls [{:$match {:date {:$gte ["___ISODate" "2012-01-01"]}}}]))

(datasets/expect-with-engine :mongo
  5
  (count (rows (qp/process-query {:native   {:query      "[{\"$match\": {\"date\": {\"$gte\": ISODate(\"2015-12-20\")}}}]"
                                             :collection "checkins"}
                                  :type     :native
                                  :database (data/id)}))))
