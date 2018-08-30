(ns metabase.driver.mongo-test
  "Tests for Mongo driver."
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.automagic-dashboards.core :as magic]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :refer [rows]]]
            [metabase.driver.mongo :as mongo]
            [metabase.driver.mongo.query-processor :as mongo-qp]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as datasets]
             [interface :as i]]
            [toucan.db :as db])
  (:import metabase.driver.mongo.MongoDriver
           org.bson.types.ObjectId
           org.joda.time.DateTime))

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
               :columns     ["count"]
               :cols        [{:name "count", :display_name "Count", :base_type :type/Integer
                              :remapped_to nil, :remapped_from nil}]
               :native_form {:collection "venues"
                             :query      native-query}}}
  (-> (qp/process-query {:native   {:query      native-query
                                    :collection "venues"}
                         :type     :native
                         :database (data/id)})
      (m/dissoc-in [:data :results_metadata])))

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
   :fields #{{:name          "name"
              :database-type "java.lang.String"
              :base-type     :type/Text}
             {:name          "latitude"
              :database-type "java.lang.Double"
              :base-type     :type/Float}
             {:name          "longitude"
              :database-type "java.lang.Double"
              :base-type     :type/Float}
             {:name          "price"
              :database-type "java.lang.Long"
              :base-type     :type/Integer}
             {:name          "category_id"
              :database-type "java.lang.Long"
              :base-type     :type/Integer}
             {:name          "_id"
              :database-type "java.lang.Long"
              :base-type     :type/Integer
              :pk?           true}}}
  (driver/describe-table (MongoDriver.) (data/db) (Table (data/id :venues))))

;; Make sure that all-NULL columns work and are synced correctly (#6875)
(i/def-database-definition ^:private all-null-columns
  [["bird_species"
     [{:field-name "name", :base-type :type/Text}
      {:field-name "favorite_snack", :base-type :type/Text}]
     [["House Finch" nil]
      ["Mourning Dove" nil]]]])

(datasets/expect-with-engine :mongo
  [{:name "_id",            :database_type "java.lang.Long",   :base_type :type/Integer, :special_type :type/PK}
   {:name "favorite_snack", :database_type "NULL",             :base_type :type/*,       :special_type nil}
   {:name "name",           :database_type "java.lang.String", :base_type :type/Text,    :special_type :type/Name}]
  (data/dataset metabase.driver.mongo-test/all-null-columns
    (map (partial into {})
         (db/select [Field :name :database_type :base_type :special_type]
           :table_id (data/id :bird_species)
           {:order-by [:name]}))))


;;; table-rows-sample
(datasets/expect-with-engine :mongo
  [[1 "Red Medicine"]
   [2 "Stout Burgers & Beers"]
   [3 "The Apple Pan"]
   [4 "Wurstküche"]
   [5 "Brite Spot Family Restaurant"]]
  (driver/sync-in-context (MongoDriver.) (data/db)
    (fn []
      (vec (take 5 (driver/table-rows-sample (Table (data/id :venues))
                     [(Field (data/id :venues :id))
                      (Field (data/id :venues :name))]))))))


;; ## Big-picture tests for the way data should look post-sync

;; Test that Tables got synced correctly, and row counts are correct
(datasets/expect-with-engine :mongo
  [{:active true, :name "categories"}
   {:active true, :name "checkins"}
   {:active true, :name "users"}
   {:active true, :name "venues"}]
  (for [field (db/select [Table :name :active]
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
  (vec (for [table-name table-names]
         (vec (for [field (db/select [Field :name :base_type :special_type]
                            :active   true
                            :table_id (data/id table-name)
                            {:order-by [:name]})]
                (into {} field))))))


;;; Check that we support Mongo BSON ID and can filter by it (#1367)
(i/def-database-definition ^:private with-bson-ids
  [["birds"
     [{:field-name "name", :base-type :type/Text}
      {:field-name "bird_id", :base-type :type/MongoBSONID}]
     [["Rasta Toucan" (ObjectId. "012345678901234567890123")]
      ["Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]]])

(datasets/expect-with-engine :mongo
  [[2 "Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]
  (rows (data/dataset metabase.driver.mongo-test/with-bson-ids
          (data/run-query birds
            (ql/filter (ql/= $bird_id "abcdefabcdefabcdefabcdef"))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             ISODate(...) AND ObjectId(...) HANDLING (#3741, #4448)                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect
  "[{\"$match\":{\"date\":{\"$gte\":[\"___ISODate\", \"2012-01-01\"]}}}]"
  (#'mongo-qp/encode-fncalls "[{\"$match\":{\"date\":{\"$gte\":ISODate(\"2012-01-01\")}}}]"))

(expect
  "[{\"$match\":{\"entityId\":{\"$eq\":[\"___ObjectId\", \"583327789137b2700a1621fb\"]}}}]"
  (#'mongo-qp/encode-fncalls "[{\"$match\":{\"entityId\":{\"$eq\":ObjectId(\"583327789137b2700a1621fb\")}}}]"))

;; make sure fn calls with no arguments work as well (#4996)
(expect
  "[{\"$match\":{\"date\":{\"$eq\":[\"___ISODate\"]}}}]"
  (#'mongo-qp/encode-fncalls "[{\"$match\":{\"date\":{\"$eq\":ISODate()}}}]"))

(expect
  (DateTime. "2012-01-01")
  (#'mongo-qp/maybe-decode-fncall ["___ISODate" "2012-01-01"]))

(expect
  (ObjectId. "583327789137b2700a1621fb")
  (#'mongo-qp/maybe-decode-fncall ["___ObjectId" "583327789137b2700a1621fb"]))

(expect
  [{:$match {:date {:$gte (DateTime. "2012-01-01")}}}]
  (#'mongo-qp/decode-fncalls [{:$match {:date {:$gte ["___ISODate" "2012-01-01"]}}}]))

(expect
  [{:$match {:entityId {:$eq (ObjectId. "583327789137b2700a1621fb")}}}]
  (#'mongo-qp/decode-fncalls [{:$match {:entityId {:$eq ["___ObjectId" "583327789137b2700a1621fb"]}}}]))

(datasets/expect-with-engine :mongo
  5
  (count (rows (qp/process-query {:native   {:query      "[{\"$match\": {\"date\": {\"$gte\": ISODate(\"2015-12-20\")}}}]"
                                             :collection "checkins"}
                                  :type     :native
                                  :database (data/id)}))))

(datasets/expect-with-engine :mongo
  0
  ;; this query shouldn't match anything, so we're just checking that it completes successfully
  (count (rows (qp/process-query {:native   {:query      "[{\"$match\": {\"_id\": {\"$eq\": ObjectId(\"583327789137b2700a1621fb\")}}}]"
                                             :collection "venues"}
                                  :type     :native
                                  :database (data/id)}))))


;; tests for `most-common-object-type`
(expect
  String
  (#'mongo/most-common-object-type [[Float 20] [Integer 10] [String 30]]))

;; make sure it handles `nil` types correctly as well (#6880)
(expect
  nil
  (#'mongo/most-common-object-type [[Float 20] [nil 40] [Integer 10] [String 30]]))


;; make sure x-rays don't use features that the driver doesn't support
(datasets/expect-with-engine :mongo
  true
  (->> (magic/automagic-analysis (Field (data/id :venues :price)) {})
       :ordered_cards
       (mapcat (comp :breakout :query :dataset_query :card))
       (not-any? #{[:binning-strategy [:field-id (data/id :venues :price)] "default"]})))
