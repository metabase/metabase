(ns metabase.driver.mongo-test
  "Tests for Mongo driver."
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.t :refer [rows]]
             [test :as mt]]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver
             [mongo :as mongo]
             [util :as driver.u]]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.test.data.interface :as tx]
            [taoensso.nippy :as nippy]
            [toucan.db :as db])
  (:import org.bson.types.ObjectId))

;; ## Constants + Helper Fns/Macros
;; TODO - move these to metabase.test-data ?
(def ^:private table-names
  "The names of the various test data `Tables`."
  [:categories
   :checkins
   :users
   :venues])

;; ## Tests for connection functions
(deftest can-connect-test?
  (mt/test-driver
   :mongo
   (doseq [{:keys [details expected message]} [{:details  {:host   "localhost"
                                                           :port   3000
                                                           :dbname "bad-db-name"}
                                                :expected false}
                                               {:details  {}
                                                :expected false}
                                               {:details  {:host   "localhost"
                                                           :port   27017
                                                           :dbname "metabase-test"}
                                                :expected true}
                                               {:details  {:host   "localhost"
                                                           :dbname "metabase-test"}
                                                :expected true
                                                :message  "should use default port 27017 if not specified"}
                                               {:details  {:host   "123.4.5.6"
                                                           :dbname "bad-db-name?connectTimeoutMS=50"}
                                                :expected false}
                                               {:details  {:host   "localhost"
                                                           :port   3000
                                                           :dbname "bad-db-name?connectTimeoutMS=50"}
                                                :expected false}
                                               {:details  {:conn-uri "mongodb://localhost:27017/metabase-test"}
                                                :expected true}
                                               {:details  {:conn-uri "mongodb://localhost:3000/bad-db-name?connectTimeoutMS=50"}
                                                :expected false}]]
      (testing (str "connect with " details)
        (is (= expected
               (driver.u/can-connect-with-details? :mongo details))
            message)))))

(def ^:private native-query
  "[{\"$project\": {\"_id\": \"$_id\"}},
    {\"$match\": {\"_id\": {\"$eq\": 1}}},
    {\"$group\": {\"_id\": null, \"count\": {\"$sum\": 1}}},
    {\"$sort\": {\"_id\": 1}},
    {\"$project\": {\"_id\": false, \"count\": true}}]")

(deftest native-query-test
  (mt/test-driver :mongo
    (is (= {:status    :completed
            :row_count 1
            :data      {:rows             [[1]]
                        :cols             [{:name         "count"
                                            :display_name "count"
                                            :base_type    :type/Integer
                                            :source       :native
                                            :field_ref    [:field-literal "count" :type/Integer]}]
                        :native_form      {:collection "venues"
                                           :query      native-query}
                        :results_timezone "UTC"}}
           (-> (qp/process-query {:native   {:query      native-query
                                             :collection "venues"}
                                  :type     :native
                                  :database (mt/id)})
               (m/dissoc-in [:data :results_metadata] [:data :insights]))))))

;; ## Tests for individual syncing functions

(deftest describe-database-test
  (mt/test-driver :mongo
    (is (= {:tables #{{:schema nil, :name "checkins"}
                      {:schema nil, :name "categories"}
                      {:schema nil, :name "users"}
                      {:schema nil, :name "venues"}}}
           (driver/describe-database :mongo (mt/db))))))

(deftest describe-table-test
  (mt/test-driver :mongo
    (is (= {:schema nil
            :name   "venues"
            :fields #{{:name          "name"
                       :database-type "java.lang.String"
                       :base-type     :type/Text
                       :database-position 1}
                      {:name          "latitude"
                       :database-type "java.lang.Double"
                       :base-type     :type/Float
                       :database-position 3}
                      {:name          "longitude"
                       :database-type "java.lang.Double"
                       :base-type     :type/Float
                       :database-position 4}
                      {:name          "price"
                       :database-type "java.lang.Long"
                       :base-type     :type/Integer
                       :database-position 5}
                      {:name          "category_id"
                       :database-type "java.lang.Long"
                       :base-type     :type/Integer
                       :database-position 2}
                      {:name          "_id"
                       :database-type "java.lang.Long"
                       :base-type     :type/Integer
                       :pk?           true
                       :database-position 0}}}
           (driver/describe-table :mongo (mt/db) (Table (mt/id :venues)))))))

(deftest nested-columns-test
  (mt/test-driver :mongo
    (testing "Can we filter against nested columns?"
      (mt/dataset geographical-tips
        (is (= [[16]]
               (mt/rows
                 (mt/run-mbql-query tips
                   {:aggregation [[:count]]
                    :filter      [:= $tips.source.username "tupac"]}))))))))

;; Make sure that all-NULL columns work and are synced correctly (#6875)
(tx/defdataset ^:private all-null-columns
  [["bird_species"
    [{:field-name "name", :base-type :type/Text}
     {:field-name "favorite_snack", :base-type :type/Text}]
    [["House Finch" nil]
     ["Mourning Dove" nil]]]])

(deftest all-num-columns-test
  (mt/test-driver :mongo
    (mt/dataset all-null-columns
      (is (= [{:name "_id",            :database_type "java.lang.Long",   :base_type :type/Integer, :special_type :type/PK}
              {:name "favorite_snack", :database_type "NULL",             :base_type :type/*,       :special_type nil}
              {:name "name",           :database_type "java.lang.String", :base_type :type/Text,    :special_type :type/Name}]
             (map
              (partial into {})
              (db/select [Field :name :database_type :base_type :special_type]
                :table_id (mt/id :bird_species)
                {:order-by [:name]})))))))

(deftest table-rows-sample-test
  (mt/test-driver :mongo
    (driver/sync-in-context :mongo (mt/db)
      (fn []
        (is (= [[1 "Red Medicine"]
                [2 "Stout Burgers & Beers"]
                [3 "The Apple Pan"]
                [4 "Wurstküche"]
                [5 "Brite Spot Family Restaurant"]]
               (vec (take 5 (metadata-queries/table-rows-sample (Table (mt/id :venues))
                              [(Field (mt/id :venues :id))
                               (Field (mt/id :venues :name))])))))))))


;; ## Big-picture tests for the way data should look post-sync
(deftest table-sync-test
  (mt/test-driver :mongo
    (is (= [{:active true, :name "categories"}
            {:active true, :name "checkins"}
            {:active true, :name "users"}
            {:active true, :name "venues"}]
           (for [field (db/select [Table :name :active]
                         :db_id (mt/id)
                         {:order-by [:name]})]
             (into {} field)))
        "Test that Tables got synced correctly")))

(deftest sync-fields-test
  (mt/test-driver :mongo
    (testing "Test that Fields got synced correctly, and types are correct"
      (is (= [[{:special_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:special_type :type/Name,      :base_type :type/Text,     :name "name"}]
              [{:special_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:special_type nil,             :base_type :type/Instant,  :name "date"}
               {:special_type :type/Category,  :base_type :type/Integer,  :name "user_id"}
               {:special_type nil,             :base_type :type/Integer,  :name "venue_id"}]
              [{:special_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:special_type nil,             :base_type :type/Instant,  :name "last_login"}
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
                                       :table_id (mt/id table-name)
                                       {:order-by [:name]})]
                           (into {} field))))))))))


(tx/defdataset ^:private with-bson-ids
  [["birds"
     [{:field-name "name", :base-type :type/Text}
      {:field-name "bird_id", :base-type :type/MongoBSONID}]
     [["Rasta Toucan" (ObjectId. "012345678901234567890123")]
      ["Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]]])

(deftest bson-ids-test
  (mt/test-driver :mongo
    (is (= [[2 "Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]
           (rows (mt/dataset with-bson-ids
                   (mt/run-mbql-query birds
                     {:filter [:= $bird_id "abcdefabcdefabcdefabcdef"]}))))
        "Check that we support Mongo BSON ID and can filter by it (#1367)")))

(deftest bson-fn-call-forms-test
  (mt/test-driver :mongo
    (testing "Make sure we can handle arbitarty BSON fn-call forms like ISODate() (#3741, #4448)"
      (letfn [(rows-count [query]
                (count (rows (qp/process-query {:native   query
                                                :type     :native
                                                :database (mt/id)}))))]
        (mt/dataset with-bson-ids
          (is (= 1
                 (rows-count {:query      "[{\"$match\": {\"bird_id\": ObjectId(\"abcdefabcdefabcdefabcdef\")}}]"
                              :collection "birds"}))))
        (is (= 22
               (rows-count {:query      "[{$match: {price: {$numberInt: \"1\"}}}]"
                            :collection "venues"})
               (rows-count {:query      "[{$match: {price: NumberInt(\"1\")}}]"
                            :collection "venues"})))
        (is (= 5
               (rows-count {:query      "[{$match: {date: {$gte: ISODate(\"2015-12-20\")}}}]"
                            :collection "checkins"})))))))

(deftest most-common-object-type-test
  (is (= String
         (#'mongo/most-common-object-type [[Float 20] [Integer 10] [String 30]])))
  (testing "make sure it handles `nil` types correctly as well (#6880)"
    (is (= nil
           (#'mongo/most-common-object-type [[Float 20] [nil 40] [Integer 10] [String 30]])))))

(deftest xrays-test
  (mt/test-driver :mongo
    (testing "make sure x-rays don't use features that the driver doesn't support"
      (is (= true
             (->> (magic/automagic-analysis (Field (mt/id :venues :price)) {})
                  :ordered_cards
                  (mapcat (comp :breakout :query :dataset_query :card))
                  (not-any? #{[:binning-strategy [:field-id (mt/id :venues :price)] "default"]})))))))

(deftest no-values-test
  (mt/test-driver :mongo
    (testing (str "if we query a something an there are no values for the Field, the query should still return "
                  "successfully! (#8929 and #8894)")
      ;; add a temporary Field that doesn't actually exist to test data categories
      (mt/with-temp Field [_ {:name "parent_id", :table_id (mt/id :categories)}]
        ;; ok, now run a basic MBQL query against categories Table. When implicit Field IDs get added the `parent_id`
        ;; Field will be included
        (testing (str "if the column does not come back in the results for a given document we should fill in the "
                      "missing values with nils")
          (is (= {:rows [[1 "African"  nil]
                         [2 "American" nil]
                         [3 "Artisan"  nil]]}
                 (->
                  (mt/run-mbql-query categories
                    {:order-by [[:asc [:field-id $id]]]
                     :limit    3})
                  qp.t/data
                  (select-keys [:columns :rows])))))))))

;; Make sure we correctly (un-)freeze BSON IDs
(deftest ObjectId-serialization
  (let [oid (ObjectId. "012345678901234567890123")]
    (is (= oid (nippy/thaw (nippy/freeze oid))))))

(deftest native-query-nil-test
  (testing "Nil values (like {_id nil} below) should not get removed from native queries"
    (mt/test-driver :mongo
      (is (= [[22]]
             (mt/rows
               (qp/process-query
                {:database (mt/id)
                 :type     :native
                 :native   {:projections [:count]
                            :query       [{"$project" {"price" "$price"}}
                                          {"$match" {"price" {"$eq" 1}}}
                                          {"$group" {"_id" nil, "count" {"$sum" 1}}}
                                          {"$sort" {"_id" 1}}
                                          {"$project" {"_id" false, "count" true}}]
                            :collection  "venues"}})))))))
