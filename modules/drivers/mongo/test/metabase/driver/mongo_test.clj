(ns ^:mb/driver-tests metabase.driver.mongo-test
  "Tests for Mongo driver."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.downloads-exports-test :as downloads-test]
   [metabase.driver :as driver]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.mongo :as mongo]
   [metabase.driver.mongo.connection :as mongo.connection]
   [metabase.driver.mongo.execute :as mongo.execute]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.driver.mongo.util :as mongo.util]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.mongo :as tdm]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.xrays.automagic-dashboards.core :as magic]
   [taoensso.nippy :as nippy]
   [toucan2.core :as t2])
  (:import
   (org.bson.types Binary ObjectId)))

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
    (mt/dataset test-data
      (mt/db)
      (doseq [{:keys [details expected message]} [{:details  {:host   "localhost"
                                                              :port   3000
                                                              :dbname "bad-db-name"}
                                                   :expected false}
                                                  {:details  {}
                                                   :expected false}
                                                  {:details  {:host   "localhost"
                                                              :port   27017
                                                              :user   "metabase"
                                                              :pass   "metasample123"
                                                              :dbname "test-data"}
                                                   :expected true}
                                                  {:details  {:host   "localhost"
                                                              :user   "metabase"
                                                              :pass   "metasample123"
                                                              :dbname "test-data"}
                                                   :expected true
                                                   :message  "should use default port 27017 if not specified"}
                                                  {:details  {:host   "123.4.5.6"
                                                              :dbname "bad-db-name?connectTimeoutMS=50"}
                                                   :expected false}
                                                  {:details  {:host   "localhost"
                                                              :port   3000
                                                              :dbname "bad-db-name?connectTimeoutMS=50"}
                                                   :expected false}
                                                  {:details  {:use-conn-uri true
                                                              :conn-uri     "mongodb://metabase:metasample123@localhost:27017/test-data?authSource=admin"}
                                                   :expected (not (tdm/ssl-required?))}
                                                  {:details  {:use-conn-uri true
                                                              :conn-uri     "mongodb://localhost:3000/bad-db-name?connectTimeoutMS=50"}
                                                   :expected false}]
              :let                               [ssl-details (tdm/conn-details details)]]
        (testing (str "connect with " details)
          (is (= expected
                 (driver.u/can-connect-with-details? :mongo ssl-details))
              (str message)))))))

(deftest database-supports?-test
  (mt/test-driver :mongo
    (doseq [{:keys [dbms_version expected]}
            [{:dbms_version {:semantic-version [5 0 0 0]}
              :expected     true}
             {:dbms_version {}
              :expected     false}
             {:dbms_version {:semantic-version []}
              :expected     false}
             {:dbms_version {:semantic-version [2 2134234]}
              :expected     false}]]
      (testing (str "supports with " dbms_version)
        (mt/with-temp [:model/Database db {:name "dummy", :engine "mongo", :dbms_version dbms_version}]
          (is (= expected
                 (driver/database-supports? :mongo :expressions db))))))
    (is (= #{:collection}
           (lib/required-native-extras (lib.metadata.jvm/application-database-metadata-provider (mt/id)))))))

(def ^:private native-query
  "[{\"$project\": {\"_id\": \"$_id\"}},
    {\"$match\": {\"_id\": {\"$eq\": 1}}},
    {\"$group\": {\"_id\": null, \"count\": {\"$sum\": 1}}},
    {\"$sort\": {\"_id\": 1}},
    {\"$project\": {\"_id\": false, \"count\": true}}]")

(deftest native-query-test
  (mt/test-driver :mongo
    (is (partial=
         {:status    :completed
          :row_count 1
          :data      {:rows             [[1]]
                      :cols             [{:name           "count"
                                          :display_name   "count"
                                          :base_type      :type/Integer
                                          :effective_type :type/Integer
                                          :source         :native
                                          :field_ref      [:field "count" {:base-type :type/Integer}]}]
                      :native_form      {:collection "venues"
                                         :query      native-query}
                      :results_timezone "UTC"}}
         (-> (qp/process-query {:native   {:query      native-query
                                           :collection "venues"}
                                :type     :native
                                :database (mt/id)})
             (m/dissoc-in [:data :results_metadata] [:data :insights]))))))

(deftest ^:parallel nested-native-query-test
  (mt/test-driver :mongo
    (testing "Mbql query with nested native source query _returns correct results_ (#30112)"
      (mt/with-temp [:model/Card {:keys [id]} {:dataset_query {:type     :native
                                                               :native   {:collection "venues"
                                                                          :query      native-query}
                                                               :database (mt/id)}}]
        (let [query (mt/mbql-query nil
                      {:source-table (str "card__" id)
                       :limit        1})]
          (is (partial=
               {:status :completed
                :data   {:native_form {:collection "venues"
                                       :query      (conj (mongo.qp/parse-query-string native-query)
                                                         {"$limit" 1})}
                         :rows        [[1]]}}
               (qp/process-query query))))))))

(deftest ^:parallel nested-native-query-test-2
  (mt/test-driver :mongo
    (testing "Mbql query with nested native source query _aggregates_ correctly (#30112)"
      (let [query-str (str "[{\"$project\":\n"
                           "   {\"_id\": \"$_id\",\n"
                           "    \"name\": \"$name\",\n"
                           "    \"category_id\": \"$category_id\",\n"
                           "    \"latitude\": \"$latitude\",\n"
                           "    \"longitude\": \"$longitude\",\n"
                           "    \"price\": \"$price\"}\n"
                           "}]")]
        (mt/with-temp [:model/Card {:keys [id]} {:dataset_query {:type     :native
                                                                 :native   {:collection "venues"
                                                                            :query      query-str}
                                                                 :database (mt/id)}}]
          (let [query (mt/mbql-query venues
                        {:source-table (str "card__" id)
                         :aggregation  [:count]
                         :breakout     [*category_id/Integer]
                         :order-by     [[:desc [:aggregation 0]]]
                         :limit        5})]
            (is (partial=
                 {:status :completed
                  :data   {:native_form
                           {:collection "venues"
                            :query      (conj (mongo.qp/parse-query-string query-str)
                                              {"$group" {"_id" {"category_id" "$category_id"}, "count" {"$sum" 1}}}
                                              {"$sort" {"_id" 1}}
                                              {"$project" {"_id" false, "category_id" "$_id.category_id", "count" true}}
                                              {"$sort" {"count" -1, "category_id" 1}}
                                              {"$limit" 5})}
                           :rows [[7 10] [50 10] [40 9] [2 8] [5 7]]}}
                 (qp/process-query query)))))))))

;; ## Tests for individual syncing functions

(deftest ^:parallel describe-database-test
  (mt/test-driver :mongo
    (is (= #{{:schema nil, :name "checkins"}
             {:schema nil, :name "categories"}
             {:schema nil, :name "users"}
             {:schema nil, :name "venues"}
             {:schema nil, :name "orders"}
             {:schema nil, :name "people"}
             {:schema nil, :name "products"}
             {:schema nil, :name "reviews"}}
           (:tables (driver/describe-database :mongo (mt/db)))))))

(deftest ^:parallel describe-table-query-test
  (is (= [{"$sort" {"_id" 1}}
          {"$limit" 500}
          {"$unionWith" {"coll" "collection-name", "pipeline" [{"$sort" {"_id" -1}} {"$limit" 500}]}}
          {"$project"
           {"path" "$ROOT",
            "kvs"
            {"$map"
             {"input" {"$objectToArray" "$$ROOT"},
              "as"    "item",
              "in"
              {"k"    "$$item.k",
               "object"
               {"$cond" {"if" {"$eq" [{"$type" "$$item.v"} "object"]}, "then" "$$item.v", "else" nil}},
               "type" {"$type" "$$item.v"}}}}}}
          {"$unwind" {"path" "$kvs", "includeArrayIndex" "index"}}
          {"$project"
           {"path"   "$kvs.k",
            "result" {"$literal" false},
            "type"   "$kvs.type",
            "index"  1,
            "object" "$kvs.object"}}
          {"$facet"
           {"results" [{"$match" {"result" true}}],
            "newResults"
            [{"$match" {"result" false}}
             {"$group"
              {"_id"   {"type" "$type", "path" "$path"},
               "count" {"$sum" {"$cond" {"if" {"$eq" ["$type" "null"]}, "then" 0, "else" 1}}},
               "index" {"$min" "$index"}}}
             {"$sort" {"count" -1}}
             {"$group" {"_id" "$_id.path", "type" {"$first" "$_id.type"}, "index" {"$min" "$index"}}}
             {"$project" {"path" "$_id", "type" 1, "result" {"$literal" true}, "object" nil, "index" 1}}],
            "nextItems"
            [{"$match" {"result" false, "object" {"$ne" nil}}}
             {"$project"
              {"path" 1,
               "kvs"
               {"$map"
                {"input" {"$objectToArray" "$object"},
                 "as"    "item",
                 "in"
                 {"k"    "$$item.k",
                  "object"
                  {"$cond" {"if" {"$eq" [{"$type" "$$item.v"} "object"]}, "then" "$$item.v", "else" nil}},
                  "type" {"$type" "$$item.v"}}}}}}
             {"$unwind" {"path" "$kvs", "includeArrayIndex" "index"}}
             {"$project"
              {"path"   {"$concat" ["$path" "." "$kvs.k"]},
               "type"   "$kvs.type",
               "result" {"$literal" false},
               "index"  1,
               "object" "$kvs.object"}}]}}
          {"$project" {"acc" {"$concatArrays" ["$results" "$newResults" "$nextItems"]}}}
          {"$unwind" "$acc"}
          {"$replaceRoot" {"newRoot" "$acc"}}
          {"$facet"
           {"results" [{"$match" {"result" true}}],
            "newResults"
            [{"$match" {"result" false}}
             {"$group"
              {"_id"   {"type" "$type", "path" "$path"},
               "count" {"$sum" {"$cond" {"if" {"$eq" ["$type" "null"]}, "then" 0, "else" 1}}},
               "index" {"$min" "$index"}}}
             {"$sort" {"count" -1}}
             {"$group" {"_id" "$_id.path", "type" {"$first" "$_id.type"}, "index" {"$min" "$index"}}}
             {"$project" {"path" "$_id", "type" 1, "result" {"$literal" true}, "object" nil, "index" 1}}]}}
          {"$project" {"acc" {"$concatArrays" ["$results" "$newResults"]}}}
          {"$unwind" "$acc"}
          {"$replaceRoot" {"newRoot" "$acc"}}
          {"$project" {"_id" 0, "index" "$index", "path" "$path", "type" "$type"}}]
         (#'mongo/describe-table-query :collection-name "collection-name" :sample-size 1000 :max-depth 1))))
(tx/defdataset nested-bindata-coll
  (let [not-uuid  (Binary. (byte 0) (byte-array 1))
        some-uuid #uuid "11111111-1111-1111-1111-111111111111"
        some-date #inst "2025-01-01T12:00:00.00Z"]
    [["nested-bindata"
      [{:field-name "_id", :base-type :type/MongoBSONID}
       {:field-name "int", :base-type :type/Integer}
       {:field-name "float", :base-type :type/Float}
       {:field-name "text", :base-type :type/Text}
       {:field-name "date", :base-type :type/Instant}
       {:field-name "mixed_uuid", :base-type :type/*}
       {:field-name "mixed_not_uuid", :base-type :type/*}
       {:field-name "nested_mixed_uuid", :base-type :type/Dictionary}
       {:field-name "nested_mixed_not_uuid", :base-type :type/Dictionary}]
      [[(ObjectId.) 1 1.1 "1" some-date some-uuid not-uuid {"nested_data" some-uuid} {"nested_data_2" not-uuid}]
       [(ObjectId.) 2 2.2 "2" some-date some-uuid not-uuid {"nested_data" some-uuid} {"nested_data_2" not-uuid}]
       [(ObjectId.) 3 3.3 "3" some-date some-uuid not-uuid {"nested_data" some-uuid} {"nested_data_2" not-uuid}]
       [(ObjectId.) 4 4.4 "4" some-date not-uuid some-uuid {"nested_data" not-uuid} {"nested_data_2" some-uuid}]
       [(ObjectId.) 5 5.5 "5" some-date not-uuid some-uuid {"nested_data" not-uuid} {"nested_data_2" some-uuid}]]]]))

(deftest describe-table-test
  (mt/test-driver :mongo
    (is (= {:schema nil
            :name   "venues"
            :fields #{{:name              "name"
                       :database-type     "string"
                       :base-type         :type/Text
                       :database-position 1}
                      {:name              "latitude"
                       :database-type     "double"
                       :base-type         :type/Float
                       :database-position 3}
                      {:name              "longitude"
                       :database-type     "double"
                       :base-type         :type/Float
                       :database-position 4}
                      {:name              "price"
                       :database-type     "long"
                       :base-type         :type/Integer
                       :database-position 5}
                      {:name              "category_id"
                       :database-type     "long"
                       :base-type         :type/Integer
                       :database-position 2}
                      {:name              "_id"
                       :database-type     "long"
                       :base-type         :type/Integer
                       :pk?               true
                       :database-position 0}}}
           (driver/describe-table :mongo (mt/db) (t2/select-one :model/Table :id (mt/id :venues)))))
    (mt/dataset uuid-dogs
      (testing "binData uuid fields are identified as type/MongoBinData"
        (is (= {:schema nil,
                :name   "dogs",
                :fields
                #{{:name "_id", :database-type "long", :base-type :type/Integer, :pk? true, :database-position 0}
                  {:name "name", :database-type "string", :base-type :type/Text, :database-position 2}
                  {:name "person_id", :database-type "binData", :base-type :type/MongoBinData, :database-position 3}
                  {:name "id", :database-type "binData", :base-type :type/MongoBinData, :database-position 1}}}
               (driver/describe-table :mongo (mt/db) (t2/select-one :model/Table :id (mt/id :dogs)))))))
    (mt/dataset nested-bindata-coll
      (testing "nested fields with mixed binData subtypes are identified as type/*"
        (is (= {:schema nil, :name "nested-bindata",
                :fields #{{:name "_id", :database-type "objectId", :base-type :type/MongoBSONID, :pk? true, :database-position 0}
                          {:name "int", :database-type "long", :base-type :type/Integer, :database-position 2}
                          {:name "float", :database-type "double", :base-type :type/Float, :database-position 3}
                          {:name "text", :database-type "string", :base-type :type/Text, :database-position 10}
                          {:name "date", :database-type "date", :base-type :type/Instant, :database-position 1}
                          {:name "mixed_uuid", :database-type "binData", :base-type :type/MongoBinData, :database-position 7}
                          {:name "mixed_not_uuid", :database-type "binData", :base-type :type/MongoBinData, :database-position 6}
                          {:name            "nested_mixed_uuid", :database-type "object", :base-type :type/Dictionary, :database-position 8,
                           :nested-fields   #{{:name "nested_data", :database-type "binData", :base-type :type/MongoBinData, :database-position 9}}
                           :visibility-type :details-only}
                          {:name            "nested_mixed_not_uuid", :database-type "object", :base-type :type/Dictionary, :database-position 4,
                           :nested-fields   #{{:name "nested_data_2", :database-type "binData", :base-type :type/MongoBinData, :database-position 5}}
                           :visibility-type :details-only}}}
               (driver/describe-table :mongo (mt/db) (t2/select-one :model/Table :id (mt/id :nested-bindata)))))))))

;; Index sync is turned off across the application as it is not used ATM.
#_(deftest sync-indexes-info-test
    (mt/test-driver :mongo
      (mt/dataset (mt/dataset-definition "composite-index"
                                         ["singly-index"
                                          [{:field-name "indexed" :indexed? true :base-type :type/Integer}
                                           {:field-name "not-indexed" :indexed? false :base-type :type/Integer}]
                                          [[1 2]]]
                                         ["compound-index"
                                          [{:field-name "first" :indexed? false :base-type :type/Integer}
                                           {:field-name "second" :indexed? false :base-type :type/Integer}]
                                          [[1 2]]]
                                         ["multi-key-index"
                                          [{:field-name "url" :indexed? false :base-type :type/Text}]
                                          [[{:small "http://example.com/small.jpg" :large "http://example.com/large.jpg"}]]])

        (try
          (testing "singly index"
            (is (true? (t2/select-one-fn :database_indexed :model/Field (mt/id :singly-index :indexed))))
            (is (false? (t2/select-one-fn :database_indexed :model/Field (mt/id :singly-index :not-indexed)))))

          (testing "compount index"
            (mongo.connection/with-mongo-database [db (mt/db)]
              (mongo.util/create-index (mongo.util/collection db "compound-index") (array-map "first" 1 "second" 1)))
            (sync/sync-database! (mt/db))
            (is (true? (t2/select-one-fn :database_indexed :model/Field (mt/id :compound-index :first))))
            (is (false? (t2/select-one-fn :database_indexed :model/Field (mt/id :compound-index :second)))))

          (testing "multi key index"
            (mongo.connection/with-mongo-database [db (mt/db)]
              (mongo.util/create-index (mongo.util/collection db "multi-key-index") (array-map "url.small" 1)))
            (sync/sync-database! (mt/db))
            (is (false? (t2/select-one-fn :database_indexed :model/Field :name "url")))
            (is (true? (t2/select-one-fn :database_indexed :model/Field :name "small"))))

          (finally
            (t2/delete! :model/Database (mt/id)))))))

;; Index sync is turned off across the application as it is not used ATM.
#_(deftest sync-indexes-top-level-and-nested-column-with-same-name-test
    (mt/test-driver :mongo
      (testing "when a table has fields at the top level and nested level with the same name
             we shouldn't mistakenly mark both of them as indexed if one is(#46312)"
        (mt/dataset (mt/dataset-definition "index-duplicate-name"
                                           ["top-level-indexed"
                                            [{:field-name "name" :indexed? true :base-type :type/Text}
                                             {:field-name "class" :indexed? false :base-type :type/Text}]
                                            [["Metabase" {"name" "Physics"}]]]
                                           ["nested-indexed"
                                            [{:field-name "name" :indexed? false :base-type :type/Text}
                                             {:field-name "class" :indexed? false :base-type :type/Text}]
                                            [["Metabase" {"name" "Physics"}]]])
          (mongo.connection/with-mongo-database [db (mt/db)]
            (mongo.util/create-index (mongo.util/collection db "nested-indexed") (array-map "class.name" 1)))
          (sync/sync-database! (mt/db) {:scan :schema})
          (testing "top level indexed, nested not"
            (let [name-fields (t2/select [:model/Field :name :parent_id :database_indexed]
                                         :table_id (mt/id :top-level-indexed) :name "name")]
              (testing "sanity check that we have 2 `name` fields"
                (is (= 2 (count name-fields))))
              (testing "only the top level field is indexed"
                (is (=? [{:name             "name"
                          :parent_id        nil
                          :database_indexed true}
                         {:name             "name"
                          :parent_id        (mt/malli=? int?)
                          :database_indexed false}]
                        (sort-by :parent_id name-fields))))))
          (testing "nested field indexed, top level not"
            (let [name-fields (t2/select [:model/Field :name :parent_id :database_indexed]
                                         :table_id (mt/id :nested-indexed) :name "name")]
              (testing "sanity check that we have 2 `name` fields"
                (is (= 2 (count name-fields))))
              (testing "only the nested field is indexed"
                (is (=? [{:name             "name"
                          :parent_id        nil
                          :database_indexed false}
                         {:name             "name"
                          :parent_id        (mt/malli=? int?)
                          :database_indexed true}]
                        (sort-by :parent_id name-fields))))))))))

;; Index sync is turned off across the application as it is not used ATM.
#_(deftest describe-table-indexes-test
    (mt/test-driver :mongo
      (mt/dataset (mt/dataset-definition "indexing"
                                         ["singly-index"
                                          [{:field-name "a" :base-type :type/Text}]
                                          [[1]]]
                                         ["compound-index"
                                          [{:field-name "a" :base-type :type/Text}]
                                          [[1]]]
                                         ["compound-index-big"
                                          [{:field-name "a" :base-type :type/Text}]
                                          [[1]]]
                                         ["multi-key-index"
                                          [{:field-name "a" :base-type :type/Text}]
                                          [[1]]]
                                         ["advanced-index"
                                          [{:field-name "hashed-field" :indexed? false :base-type :type/Text}
                                           {:field-name "text-field" :indexed? false :base-type :type/Text}
                                           {:field-name "geospatial-field" :indexed? false :base-type :type/Text}]
                                          [["Ngoc" "Khuat" [10 20]]]])

        (sync/sync-database! (mt/db))
        (try
          (let [describe-indexes (fn [table-name]
                                   (driver/describe-table-indexes :mongo (mt/db) (t2/select-one :model/Table (mt/id table-name))))]
            (mongo.connection/with-mongo-database [db (mt/db)]
              (testing "single column index"
                (mongo.util/create-index (mongo.util/collection db "singly-index") {"a" 1})
                (is (= #{{:type :normal-column-index :value "_id"}
                         {:type :normal-column-index :value "a"}}
                       (describe-indexes :singly-index))))

              (testing "compound index column index"
             ;; first index column is :a
                (mongo.util/create-index (mongo.util/collection db "compound-index") (array-map :a 1 :b 1 :c 1))
             ;; first index column is :e
                (mongo.util/create-index (mongo.util/collection db "compound-index") (array-map :e 1 :d 1 :f 1))
                (is (= #{{:type :normal-column-index :value "_id"}
                         {:type :normal-column-index :value "a"}
                         {:type :normal-column-index :value "e"}}
                       (describe-indexes :compound-index))))

              (testing "compound index that has many keys can still determine the first key"
              ;; first index column is :j
                (mongo.util/create-index (mongo.util/collection db "compound-index-big")
                                         (array-map "j" 1 "b" 1 "c" 1 "d" 1 "e" 1 "f" 1 "g" 1 "h" 1 "a" 1))
                (is (= #{{:type :normal-column-index :value "_id"}
                         {:type :normal-column-index :value "j"}}
                       (describe-indexes :compound-index-big))))

              (testing "multi key indexes"
                (mongo.util/create-index (mongo.util/collection db "multi-key-index") (array-map "a.b" 1))
                (is (= #{{:type :nested-column-index :value ["a" "b"]}
                         {:type :normal-column-index :value "_id"}}
                       (describe-indexes :multi-key-index))))

              (testing "advanced-index: hashed index, text index, geospatial index"
                (mongo.util/create-index (mongo.util/collection db "advanced-index") (array-map "hashed-field" "hashed"))
                (mongo.util/create-index (mongo.util/collection db "advanced-index") (array-map "text-field" "text"))
                (mongo.util/create-index (mongo.util/collection db "advanced-index") (array-map "geospatial-field" "2d"))
                (is (= #{{:type :normal-column-index :value "geospatial-field"}
                         {:type :normal-column-index :value "hashed-field"}
                         {:type :normal-column-index :value "_id"}
                         {:type :normal-column-index :value "text-field"}}
                       (describe-indexes :advanced-index))))))

          (finally
            (t2/delete! :model/Database (mt/id)))))))

(deftest nested-columns-test
  (mt/test-driver :mongo
    (mt/dataset geographical-tips
      (testing "Can we filter against nested columns?"
        (is (= [[16]]
               (mt/rows
                (mt/run-mbql-query tips
                  {:aggregation [[:count]]
                   :filter      [:= $tips.source.username "tupac"]})))))

      (testing "Can we breakout against nested columns?"
        (is (= [[nil 297]
                ["amy" 20]
                ["biggie" 11]
                ["bob" 20]]
               (mt/rows
                (mt/run-mbql-query tips
                  {:aggregation [[:count]]
                   :breakout    [$tips.source.username]
                   :limit       4}))))))))

;; Make sure that all-NULL columns work and are synced correctly (#6875)
(tx/defdataset all-null-columns
  [["bird_species"
    [{:field-name "name", :base-type :type/Text}
     {:field-name "favorite_snack", :base-type :type/Text}]
    [["House Finch" nil]
     ["Mourning Dove" nil]]]])

(deftest all-null-columns-test
  (mt/test-driver :mongo
    (mt/dataset all-null-columns
      ;; do a full sync on the DB to get the correct semantic type info
      (sync/sync-database! (mt/db))
      (is (= [{:name "_id", :database_type "long", :base_type :type/Integer, :semantic_type :type/PK}
              {:name "favorite_snack", :database_type "null", :base_type :type/*, :semantic_type nil}
              {:name "name", :database_type "string", :base_type :type/Text, :semantic_type :type/Name}]
             (map
              (partial into {})
              (t2/select [:model/Field :name :database_type :base_type :semantic_type]
                         :table_id (mt/id :bird_species)
                         {:order-by [:name]})))))))

(deftest new-rows-take-precedence-when-collecting-metadata-test
  (mt/test-driver :mongo
    (with-redefs [table-rows-sample/nested-field-sample-limit 2]
      (binding [tdm/*remove-nil?* true]
        (mt/with-temp-test-data
          [["bird_species"
            [{:field-name "name", :base-type :type/Text}
             {:field-name "favorite_snack", :base-type :type/Text}
             {:field-name "max_wingspan", :base-type :type/Integer}]
            [["Sharp-shinned Hawk" nil 68]
             ["Tropicbird" nil 112]
             ["House Finch" nil nil]
             ["Mourning Dove" nil nil]
             ["Common Blackbird" "earthworms" nil]
             ["Silvereye" "cherries" nil]]]]
          ;; do a full sync on the DB to get the correct semantic type info
          (sync/sync-database! (mt/db))
          (is (= #{{:name "_id", :database_type "long", :base_type :type/Integer, :semantic_type :type/PK}
                   {:name "favorite_snack", :database_type "string", :base_type :type/Text, :semantic_type :type/Category}
                   {:name "name", :database_type "string", :base_type :type/Text, :semantic_type :type/Name}
                   {:name "max_wingspan", :database_type "long", :base_type :type/Integer, :semantic_type nil}}
                 (into #{}
                       (map (partial into {}))
                       (t2/select [:model/Field :name :database_type :base_type :semantic_type]
                                  :table_id (mt/id :bird_species)
                                  {:order-by [:name]})))))))))

(deftest table-rows-sample-test
  (mt/test-driver :mongo
    (testing "Should return the latest `nested-field-sample-limit` rows"
      (let [table  (t2/select-one :model/Table :id (mt/id :venues))
            fields (map #(t2/select-one :model/Field :id (mt/id :venues %)) [:name :category_id])
            rff    (constantly conj)]
        (with-redefs [table-rows-sample/nested-field-sample-limit 5]
          (is (= [["Mohawk Bend" 46]
                  ["Golden Road Brewing" 10]
                  ["Lucky Baldwin's Pub" 7]
                  ["Barney's Beanery" 46]
                  ["Busby's West" 48]]
                 (driver/table-rows-sample :mongo table fields rff {}))))))))

;; ## Big-picture tests for the way data should look post-sync
(deftest table-sync-test
  (mt/test-driver :mongo
    (is (= [{:active true, :name "categories"}
            {:active true, :name "checkins"}
            {:active true, :name "orders"}
            {:active true, :name "people"}
            {:active true, :name "products"}
            {:active true, :name "reviews"}
            {:active true, :name "users"}
            {:active true, :name "venues"}]
           (for [field (t2/select [:model/Table :name :active]
                                  :db_id (mt/id)
                                  {:order-by [:name]})]
             (into {} field)))
        "Test that Tables got synced correctly")))

(deftest sync-fields-test
  (mt/test-driver :mongo
    (testing "Test that Fields got synced correctly, and types are correct"
      ;; Even though Mongo does not support foreign keys, there are few :type/FK semantic types. Why? Because those are
      ;; added to test data manually (see the [[metabase.test.data.impl.get-or-create/create-database!]]) to enable
      ;; implicit joins testing.
      (is (= [[{:semantic_type :type/PK, :base_type :type/Integer, :name "_id"}
               {:semantic_type :type/Name, :base_type :type/Text, :name "name"}]
              [{:semantic_type :type/PK, :base_type :type/Integer, :name "_id"}
               {:semantic_type nil, :base_type :type/Instant, :name "date"}
               {:semantic_type :type/FK, :base_type :type/Integer, :name "user_id"}
               {:semantic_type :type/FK, :base_type :type/Integer, :name "venue_id"}]
              [{:semantic_type :type/PK, :base_type :type/Integer, :name "_id"}
               {:semantic_type nil, :base_type :type/Instant, :name "last_login"}
               {:semantic_type :type/Name, :base_type :type/Text, :name "name"}
               {:semantic_type :type/Category, :base_type :type/Text, :name "password"}]
              [{:semantic_type :type/PK, :base_type :type/Integer, :name "_id"}
               {:semantic_type :type/FK, :base_type :type/Integer, :name "category_id"}
               {:semantic_type :type/Latitude, :base_type :type/Float, :name "latitude"}
               {:semantic_type :type/Longitude, :base_type :type/Float, :name "longitude"}
               {:semantic_type :type/Name, :base_type :type/Text, :name "name"}
               {:semantic_type :type/Category, :base_type :type/Integer, :name "price"}]]
             (vec (for [table-name table-names]
                    (vec (for [field (t2/select [:model/Field :name :base_type :semantic_type]
                                                :active true
                                                :table_id (mt/id table-name)
                                                {:order-by [:name]})]
                           (into {} field))))))))))

(tx/defdataset with-bson-ids
  [["birds"
    [{:field-name "name", :base-type :type/Text}
     {:field-name "bird_id", :base-type :type/MongoBSONID}
     {:field-name "bird_uuid", :base-type :type/*}]
    [["Rasta Toucan" (ObjectId. "012345678901234567890123") #uuid "11111111-1111-1111-1111-111111111111"]
     ["Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef") #uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]
     ["Unlucky Raven" nil]]]])

(deftest bson-ids-test
  (mt/test-driver :mongo
    (mt/dataset with-bson-ids
      (testing "BSON IDs"
        (testing "Check that we support Mongo BSON ID and can filter by it (#1367)"
          (is (= [[2 "Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]
                 (mt/rows (mt/run-mbql-query birds
                            {:filter [:= $bird_id "abcdefabcdefabcdefabcdef"]
                             :fields [$id $name $bird_id]})))))

        (testing "handle null ObjectId queries properly (#11134)"
          (is (= [[3 "Unlucky Raven" nil]]
                 (mt/rows (mt/run-mbql-query birds
                            {:filter [:is-null $bird_id]
                             :fields [$id $name $bird_id]})))))

        (testing "treat null ObjectId as empty (#15801)"
          (is (= [[3 "Unlucky Raven" nil]]
                 (mt/rows (mt/run-mbql-query birds
                            {:filter [:is-empty $bird_id]
                             :fields [$id $name $bird_id]}))))))

      (testing "treat non-null ObjectId as not-empty (#15801)"
        (is (= [[1 "Rasta Toucan" (ObjectId. "012345678901234567890123")]
                [2 "Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]
               (mt/rows (mt/run-mbql-query birds
                          {:filter [:not-empty $bird_id]
                           :fields [$id $name $bird_id]})))))
      (testing "can order by ObjectId (#46259)"
        (is (= [[3 nil]
                [1 (ObjectId. "012345678901234567890123")]
                [2 (ObjectId. "abcdefabcdefabcdefabcdef")]]
               (mt/rows (mt/run-mbql-query birds
                          {:fields   [$id $bird_id]
                           :order-by [[:asc $bird_id]]}))))
        (is (= [[2 (ObjectId. "abcdefabcdefabcdefabcdef")]
                [1 (ObjectId. "012345678901234567890123")]
                [3 nil]]
               (mt/rows (mt/run-mbql-query birds
                          {:fields   [$id $bird_id]
                           :order-by [[:desc $bird_id]]})))))
      (testing "BSON UUIDs"
        (testing "Check that we support Mongo BSON UUID and can filter by it"
          (is (= [[2 "Lucky Pigeon" #uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]]
                 (mt/rows (mt/run-mbql-query birds
                            {:filter [:= $bird_uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]
                             :fields [$id $name $bird_uuid]})))))

        (testing "handle null UUID queries properly"
          (is (= [[3 "Unlucky Raven" nil]]
                 (mt/rows (mt/run-mbql-query birds
                            {:filter [:is-null $bird_uuid]
                             :fields [$id $name $bird_uuid]})))))

        (testing "treat null UUID as empty"
          (is (= [[3 "Unlucky Raven" nil]]
                 (mt/rows (mt/run-mbql-query birds
                            {:filter [:is-empty $bird_uuid]
                             :fields [$id $name $bird_uuid]}))))))

      (testing "treat non-null UUID as not-empty"
        (is (= [[1 "Rasta Toucan" #uuid "11111111-1111-1111-1111-111111111111"]
                [2 "Lucky Pigeon" #uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]]
               (mt/rows (mt/run-mbql-query birds
                          {:filter [:not-empty $bird_uuid]
                           :fields [$id $name $bird_uuid]})))))
      (testing "can order by UUID (#46259)"
        (is (= [[3 nil]
                [1 #uuid "11111111-1111-1111-1111-111111111111"]
                [2 #uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]]
               (mt/rows (mt/run-mbql-query birds
                          {:fields   [$id $bird_uuid]
                           :order-by [[:asc $bird_uuid]]}))))
        (is (= [[2 #uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]
                [1 #uuid "11111111-1111-1111-1111-111111111111"]
                [3 nil]]
               (mt/rows (mt/run-mbql-query birds
                          {:fields   [$id $bird_uuid]
                           :order-by [[:desc $bird_uuid]]}))))))))

(deftest ^:parallel bson-fn-call-forms-test
  (mt/test-driver :mongo
    (testing "Make sure we can handle arbitarty BSON fn-call forms like ISODate() (#3741, #4448)"
      (letfn [(rows-count [query]
                (count (mt/rows (qp/process-query {:native   query
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

(deftest xrays-test
  (mt/test-driver :mongo
    (testing "make sure x-rays don't use features that the driver doesn't support"
      (is (empty?
           (lib.util.match/match-one (->> (magic/automagic-analysis (t2/select-one :model/Field :id (mt/id :venues :price)) {})
                                          :dashcards
                                          (mapcat (comp :breakout :query :dataset_query :card)))
             [:field _ (_ :guard :binning)]))))))

(deftest no-values-test
  (mt/test-driver :mongo
    (testing (str "if we query a something an there are no values for the Field, the query should still return "
                  "successfully! (#8929 and #8894)")
      ;; add a temporary Field that doesn't actually exist to test data categories
      (mt/with-temp [:model/Field _ {:name "parent_id", :table_id (mt/id :categories)}]
        ;; ok, now run a basic MBQL query against categories Table. When implicit Field IDs get added the `parent_id`
        ;; Field will be included
        (testing (str "if the column does not come back in the results for a given document we should fill in the "
                      "missing values with nils")
          (is (= {:rows [[1 "African" nil]
                         [2 "American" nil]
                         [3 "Artisan" nil]]}
                 (->
                  (mt/run-mbql-query categories
                    {:order-by [[:asc $id]]
                     :limit    3})
                  qp.test-util/data
                  (select-keys [:columns :rows])))))))))

;; Make sure we correctly (un-)freeze BSON IDs
(deftest ^:parallel ObjectId-serialization
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

(defn- create-database-from-row-maps! [database-name collection-name row-maps]
  (or (t2/select-one :model/Database :engine "mongo", :name database-name)
      (let [dbdef {:database-name database-name}]
        ;; destroy Mongo database if it already exists.
        (tx/destroy-db! :mongo dbdef)
        (let [details (tx/dbdef->connection-details :mongo :db dbdef)]
          ;; load rows
          (mongo.connection/with-mongo-database [db details]
            (let [coll (mongo.util/collection db collection-name)]
              (doseq [[i row] (map-indexed vector row-maps)
                      :let    [row (assoc row :_id (inc i))]]
                (try
                  (mongo.util/insert-one coll row)
                  (catch Throwable e
                    (throw (ex-info (format "Error inserting row: %s" (ex-message e))
                                    {:database database-name, :collection collection-name, :details details, :row row}
                                    e)))))
              (log/infof "Inserted %d rows into %s collection %s."
                         (count row-maps) (pr-str database-name) (pr-str collection-name))))
          ;; now sync the Database.
          (let [db (first (t2/insert-returning-instances! :model/Database {:name database-name, :engine "mongo", :details details}))]
            (sync/sync-database! db)
            db)))))

(defn- json-from-file [^String filename]
  (with-open [rdr (java.io.FileReader. (java.io.File. filename))]
    (json/decode+kw rdr)))

(defn- missing-fields-db []
  (create-database-from-row-maps!
   "test-missing-fields"
   "coll"
   (json-from-file "modules/drivers/mongo/test/metabase/driver/missing-fields.json")))

(deftest sync-missing-fields-test
  (mt/test-driver :mongo
    (mt/with-db (missing-fields-db)
      (sync/sync-database! (missing-fields-db))
      (testing "Test that fields with missing or null values get synced correctly"
        (let [results (map #(into {} %)
                           (t2/select [:model/Field :id :name :database_type :base_type :semantic_type :parent_id]
                                      :active true
                                      :table_id (mt/id :coll)
                                      {:order-by [:database_position]}))]
          (is (=? [{:name "_id", :database_type "long", :base_type :type/Integer, :semantic_type :type/PK}
                   {:name "a", :database_type "string", :base_type :type/Text, :semantic_type :type/Category}
                   {:name "b", :database_type "object", :base_type :type/Dictionary, :semantic_type nil}
                   {:name "b_c", :database_type "string", :base_type :type/Text, :semantic_type :type/Category}
                   {:name "b_d", :database_type "int", :base_type :type/Integer, :semantic_type nil}
                   {:name "b_e", :database_type "object", :base_type :type/Dictionary, :semantic_type nil}
                   {:name "b_e_f", :database_type "string", :base_type :type/Text, :semantic_type :type/Category}
                   {:name "c", :database_type "null", :base_type :type/*, :semantic_type nil}]
                  results))
          (testing "parent_ids are correct"
            (let [parent (fn [field-name]
                           (let [field (first (filter #(= (:name %) field-name) results))]
                             (:name (first (filter #(= (:id %) (:parent_id field)) results)))))]
              (is (= {"_id"   nil
                      "a"     nil
                      "b"     nil
                      "c"     nil
                      "b_c"   "b"
                      "b_d"   "b"
                      "b_e"   "b"
                      "b_e_f" "b_e"}
                     (into {} (map (juxt :name #(parent (:name %))) results)))))))))))

(defn- array-fields-db []
  (create-database-from-row-maps!
   "test-16299"
   "coll"
   (json-from-file "modules/drivers/mongo/test/metabase/driver/array-fields.json")))

(deftest filter-on-nested-column-no-results-test
  (testing "Should return results when filtering on nested columns (#16299)"
    (mt/test-driver :mongo
      (mt/with-db (array-fields-db)
        (is (= [["value_gf_a" 1] ["value_gf_b" 1]]
               (mt/rows
                (mt/run-mbql-query coll
                  {:filter      [:and
                            [:= $coll.json_field.key_1 "value_jf_a" "value_jf_b"]
                            [:= $list_field "value_lf_a"]]
                   :aggregation [[:count]]
                   :breakout    [$coll.metas.group_field]}))))))))

;; Make sure that simple `_` columns can be queried (#4647)
(tx/defdataset underscore-column
  [["bird_species"
    [{:field-name "name", :base-type :type/Text}
     {:field-name "_", :base-type :type/Text}]
    [["House Finch" "sunflower seeds, ants, nettle, dandelion"]
     ["Mourning Dove" "millet seeds, breadcrumbs, ice cream"]]]])

(deftest underscore-filter-test
  (testing "Simple `_` columns should be possible to query (#4647)"
    (mt/test-driver :mongo
      (mt/dataset underscore-column
        (is (= [[1 "House Finch" "sunflower seeds, ants, nettle, dandelion"]]
               (mt/rows
                (mt/run-mbql-query bird_species
                  {:filter [:contains $bird_species._ "nett"]}))))))))

(deftest strange-versionArray-test
  (mt/test-driver :mongo
    (testing "Negative values in versionArray are ignored (#29678)"
      (with-redefs [mongo.util/run-command (constantly {"version"      "4.0.28-23"
                                                        "versionArray" [4 0 29 -100]})]
        (is (= {:version          "4.0.28-23"
                :semantic-version [4 0 29]}
               (driver/dbms-version :mongo (mt/db))))))

    (testing "Any values after rubbish in versionArray are ignored"
      (with-redefs [mongo.util/run-command (constantly {"version"      "4.0.28-23"
                                                        "versionArray" [4 0 "NaN" 29]})]
        (is (= {:version          "4.0.28-23"
                :semantic-version [4 0]}
               (driver/dbms-version :mongo (mt/db))))))))

(deftest object-columns-export-as-json
  (mt/test-driver :mongo
    (mt/with-db (missing-fields-db)
      (sync/sync-database! (missing-fields-db))
      (testing "Objects are formatted correctly as JSON in downloads"
        (mt/with-temp [:model/Card card {:display       :table
                                         :dataset_query {:database (mt/id)
                                                         :type     :query
                                                         :query    {:source-table (mt/id :coll)
                                                                    :fields       [(mt/id :coll :id)
                                                                                   (mt/id :coll :a)
                                                                                   (mt/id :coll :b)
                                                                                   (mt/id :coll :c)]}}}]
          (let [results (downloads-test/card-download card {:export-format :csv :format-rows true})]
            (is (= [["ID" "A" "B" "C"]
                    ["1"
                     "a string"
                     "{\"b_c\":\"a string\",\"b_d\":42,\"b_e\":{\"b_e_f\":\"a string\"}}"
                     ""]
                    ["2"
                     "a string"
                     "{\"b_d\":null,\"b_e\":null,\"b_c\":null}"
                     ""]
                    ["3" "a string" "{\"b_e\":{}}" ""]
                    ["4" "a string" "null" ""]]
                   results))))))))

(deftest ^:parallel mongo-uuid-test
  (testing "mongo binData fields can be filtered and are readable"
    (mt/test-driver :mongo
      (mt/dataset uuid-dogs
        (is (= []
               (->> {:filter       [:is-empty
                                    [:field (mt/id :dogs :person_id) {:base-type "type/MongoBinData"}]]
                     :source-table (mt/id :dogs)}
                    (mt/run-mbql-query dogs)
                    mt/rows)))
        (is (= [[1 #uuid "27e164bc-54f8-47a0-a85a-9f0e90dd7667" "Ivan" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]
                [2 #uuid "3a0c0508-6b00-40ff-97f6-549666b2d16b" "Zach" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]
                [3 #uuid "d6a82cf5-7dc9-48a3-a15d-61df91a6edeb" "Boss" #uuid "d39bbe77-4e2e-4b7b-8565-cce90c25c99b"]]
               (->> {:filter       [:not-empty
                                    [:field (mt/id :dogs :person_id) {:base-type "type/MongoBinData"}]]
                     :source-table (mt/id :dogs)}
                    (mt/run-mbql-query dogs)
                    mt/rows)))
        (is (= [[1 #uuid "27e164bc-54f8-47a0-a85a-9f0e90dd7667" "Ivan" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]
                [2 #uuid "3a0c0508-6b00-40ff-97f6-549666b2d16b" "Zach" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]]
               (->> {:filter       [:!=
                                    [:field (mt/id :dogs :person_id) {:base-type "type/MongoBinData"}]
                                    "d39bbe77-4e2e-4b7b-8565-cce90c25c99b"]
                     :source-table (mt/id :dogs)}
                    (mt/run-mbql-query dogs)
                    mt/rows)))
        (is (= [[3 #uuid "d6a82cf5-7dc9-48a3-a15d-61df91a6edeb" "Boss" #uuid "d39bbe77-4e2e-4b7b-8565-cce90c25c99b"]]
               (->> {:filter       [:=
                                    [:field (mt/id :dogs :person_id) {:base-type "type/MongoBinData"}]
                                    "d39bbe77-4e2e-4b7b-8565-cce90c25c99b"]
                     :source-table (mt/id :dogs)}
                    (mt/run-mbql-query dogs)
                    mt/rows)))))))

(deftest ^:parallel encode-mongo-test
  (mt/test-driver :mongo
    (mt/dataset nested-bindata-coll
      (testing "a mongo query with filters on different types is properly encoded"
        (is (= (str/join "\n"
                         ["["
                          "  {"
                          "    \"$match\": {"
                          "      \"$and\": ["
                          "        {"
                          "          \"_id\": ObjectId(\"abcdefabcdefabcdefabcdef\")"
                          "        },"
                          "        {"
                          "          \"mixed_uuid\": UUID(\"11111111-1111-1111-1111-111111111111\")"
                          "        },"
                          "        {"
                          "          \"$expr\": {"
                          "            \"$eq\": ["
                          "              \"$date\","
                          "              {"
                          "                \"$dateFromString\": {"
                          "                  \"dateString\": \"2025-01-01T12:00Z\""
                          "                }"
                          "              }"
                          "            ]"
                          "          }"
                          "        },"
                          "        {"
                          "          \"$expr\": {"
                          "            \"$regexMatch\": {"
                          "              \"input\": \"$text\","
                          "              \"regex\": \"^a\","
                          "              \"options\": \"i\""
                          "            }"
                          "          }"
                          "        },"
                          "        {"
                          "          \"mixed_not_uuid\": {"
                          "            \"$ne\": null"
                          "          }"
                          "        },"
                          "        {"
                          "          \"int\": {"
                          "            \"$gte\": 1"
                          "          }"
                          "        },"
                          "        {"
                          "          \"float\": {"
                          "            \"$lt\": 5.5"
                          "          }"
                          "        }"
                          "      ]"
                          "    }"
                          "  },"
                          "  {"
                          "    \"$project\": {"
                          "      \"_id\": \"$_id\","
                          "      \"date\": \"$date\","
                          "      \"int\": \"$int\","
                          "      \"float\": \"$float\","
                          "      \"nested_mixed_not_uuid\": \"$nested_mixed_not_uuid\","
                          "      \"mixed_not_uuid\": \"$mixed_not_uuid\","
                          "      \"mixed_uuid\": \"$mixed_uuid\","
                          "      \"nested_mixed_uuid\": \"$nested_mixed_uuid\","
                          "      \"text\": \"$text\""
                          "    }"
                          "  },"
                          "  {"
                          "    \"$limit\": 1048575"
                          "  }"
                          "]"])
               (->> {:filter       [:and
                                    [:=
                                     [:field (mt/id :nested-bindata :_id) {:base-type :type/MongoBSONID}]
                                     "abcdefabcdefabcdefabcdef"]
                                    [:=
                                     [:field (mt/id :nested-bindata :mixed_uuid) {:base-type :type/MongoBinData}]
                                     "11111111-1111-1111-1111-111111111111"]
                                    [:=
                                     [:field (mt/id :nested-bindata :date) {:base-type :type/Instant}]
                                     "2025-01-01T12:00:00.00Z"]
                                    [:starts-with
                                     [:field (mt/id :nested-bindata :text) {:base-type :type/Text}]
                                     "a"
                                     {:case-sensitive false}]
                                    [:not-empty [:field (mt/id :nested-bindata :mixed_not_uuid) {:base-type :type/*}]]
                                    [:>= [:field (mt/id :nested-bindata :int) {:base-type :type/Integer}] 1]
                                    [:< [:field (mt/id :nested-bindata :float) {:base-type :type/Float}] 5.5]]
                     :source-table (mt/id :nested-bindata)}
                    (mt/mbql-query nested-bindata)
                    (qp.compile/compile-with-inline-parameters)
                    :query
                    (driver/prettify-native-form driver/*driver*))))))))

(defn- do-with-describe-table-for-sample
  "Override so aggregation is run on database instead of collection and provide `documents` in initial stage of
  aggregation."
  [documents thunk]
  (mt/dataset
    test-data
    (binding [mongo.execute/*aggregate* (fn [db _coll session stages timeout-ms]
                                          (mongo.execute/aggregate-database db session stages timeout-ms))
              mongo/*sample-stages* (fn [& _#] [{"$documents" documents}])]
      (let [dbfields (delay (@#'mongo/fetch-dbfields (mt/db) (t2/select-one :model/Table :id (mt/id :venues))))
            ftree (delay (@#'mongo/dbfields->ftree @dbfields))
            nested-fields (delay (@#'mongo/ftree->nested-fields @ftree))]
        (thunk dbfields ftree nested-fields)))))

(defmacro with-describe-table-for-sample
  "Use `documents` as input to aggregation pipeline used for sampling in mongo's impl of [[driver/describe-table]].

  Forward bindings become delays of results of functions used in mongo's describe-table:

  - `dbfields`     : reuslt of [[mongo/fetch-dbfields]],
  - `ftree`        : reuslt of [[mongo/dbfields->ftree]],
  - `nested-fields`: reuslt of [[mongo/ftree->nested-fields]]."
  [documents & body]
  `(do-with-describe-table-for-sample ~documents (fn [~'dbfields ~'ftree ~'nested-fields] ~@body)))

(deftest id-field-is-present-test
  (mt/test-driver
    :mongo
    (testing "Ensure _id is present in results"
      ;; Gist: Limit is set to 2 and there, other fields' names that precede the _id when sorted
      (with-redefs [driver.settings/sync-leaf-fields-limit (constantly 2)]
        (with-describe-table-for-sample
          [{"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
            "__a" 1
            "__b" 2}
           {"__b" 3
            "__a" 1000}]
          (is (= [{:path "_id", :type "objectId", :indices [0]}
                  {:path "__a", :type "int", :indices [1]}]
                 @dbfields))
          (is (= {:children
                  {"_id"
                   {:database-type "objectId" :index 0 :database-position 0, :base-type :type/MongoBSONID, :name "_id", :pk? true}
                   "__a" {:database-type "int" :index 1 :database-position 1 :base-type :type/Integer, :name "__a"}}}
                 @ftree))
          (is (= #{{:database-type "int", :database-position 1, :base-type :type/Integer, :name "__a"}
                   {:database-type "objectId", :database-position 0, :base-type :type/MongoBSONID, :name "_id", :pk? true}}
                 @nested-fields)))))))

(deftest objects-take-precedence-test
  (mt/test-driver
    :mongo
    (with-describe-table-for-sample
      [{"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
        "a" {"b" 10}}
       {"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
        "a" {"b" 20}}
       {"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
        "a" {"b" {"c" 30}}}]
      (is (= #{{:database-type "objectId", :database-position 0, :base-type :type/MongoBSONID, :name "_id", :pk? true}
               {:database-type "object",
                :visibility-type :details-only,
                :database-position 1,
                :base-type :type/Dictionary,
                :name "a",
                :nested-fields
                #{{:database-type "object",
                   :visibility-type :details-only,
                   :database-position 2,
                   :base-type :type/Dictionary,
                   :name "b",
                   :nested-fields #{{:database-type "int", :database-position 3, :base-type :type/Integer, :name "c"}}}}}}
             @nested-fields)))))

(deftest nulls-are-last-test
  (mt/test-driver
    :mongo
    (with-describe-table-for-sample
      [{"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
        "a" {"b" nil}}
       {"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
        "a" {"b" nil}}
       {"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
        "a" {"b" "hello"}}]
      (is (= #{{:database-type "object",
                :visibility-type :details-only,
                :database-position 1,
                :base-type :type/Dictionary,
                :name "a",
                :nested-fields #{{:database-type "string", :database-position 2, :base-type :type/Text, :name "b"}}}
               {:database-type "objectId", :database-position 0, :base-type :type/MongoBSONID, :name "_id", :pk? true}}
             @nested-fields)))))

;; This behavior should be changed in future as per issue #59942.
(deftest most-prevalent-type-used-test
  (mt/test-driver
    :mongo
    (with-describe-table-for-sample
      [{"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
        "a" {"b" 1}}
       {"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
        "a" {"b" 1}}
       {"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
        "a" {"b" "hello"}}]
      (is (= #{{:database-type "object",
                :visibility-type :details-only,
                :database-position 1,
                :base-type :type/Dictionary,
                :name "a",
                :nested-fields #{{:database-type "int", :database-position 2, :base-type :type/Integer, :name "b"}}}
               {:database-type "objectId", :database-position 0, :base-type :type/MongoBSONID, :name "_id", :pk? true}}
             @nested-fields)))))

(deftest deeply-nested-objects-test
  (mt/test-driver
    :mongo
    (doseq [[limit expected] [[3 [{:path "_id", :type "objectId", :indices [0]}
                                  {:path "a.b.c.d.e.f.g", :type "array", :indices [1 0 0 0 0 0 0]}
                                  {:path "a.b.c.d.e.f.i", :type "int", :indices [1 0 0 0 0 0 1]}]]
                              [4 [{:path "_id", :type "objectId", :indices [0]}
                                  {:path "a.b.c.d.e.f.g", :type "array", :indices [1 0 0 0 0 0 0]}
                                  {:path "a.b.c.d.e.f.i", :type "int", :indices [1 0 0 0 0 0 1]}
                                  {:path "a.b.c.d.e.f.h", :type "null", :indices [1 0 0 0 0 0 0]}]]]]
      (with-redefs [driver.settings/sync-leaf-fields-limit (constantly limit)]
        (with-describe-table-for-sample
          [{"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
            "a" {"b" {"c" {"d" {"e" {"f" {"g" [3 2 1]}}}}}}}
           {"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
            "a" {"b" {"c" {"d" {"e" {"f" {"g" [1 2 3]}}}}}}}
           {"_id" {"$toObjectId" (org.bson.types.ObjectId.)}
            "a" {"b" {"c" {"d" {"e" {"f" {"h" nil
                                          "i" 10}}}}}}}]
          (is (=? expected @dbfields)))))))

(deftest empty-collection-handled-gracefully-test
  (mt/test-driver
    :mongo
    (with-describe-table-for-sample
      []
      (is (=? #{} @nested-fields)))))

(deftest nested-id-breakout-test
  (testing "MongoDB path collision fix for _id.* fields (#34577)"
    ;; This test verifies that queries with _id.* fields don't cause MongoDB path collision errors
    ;; The error would manifest as: "Path collision at _id.widgetType remaining portion widgetType"
    (mt/test-driver :mongo
      ;; We need actual MongoDB documents with nested _id structure
      (mongo.connection/with-mongo-database [^com.mongodb.client.MongoDatabase db (mt/db)]
        (let [coll-name                                (str "test_nested_id_" (System/currentTimeMillis))
              ^com.mongodb.client.MongoCollection coll (.getCollection db coll-name)]
          (try
            ;; Insert documents with nested _id structure
            (let [docs [(org.bson.Document.
                         {"_id"         (org.bson.Document. {"widgetType" "button" "userId" 123})
                          "impressions" 1000
                          "time"        (java.util.Date.)})
                        (org.bson.Document.
                         {"_id"         (org.bson.Document. {"widgetType" "banner" "userId" 456})
                          "impressions" 2000
                          "time"        (java.util.Date.)})
                        (org.bson.Document.
                         {"_id"         (org.bson.Document. {"widgetType" "button" "userId" 789})
                          "impressions" 1500
                          "time"        (java.util.Date.)})]]
              (.insertMany coll docs))

            ;; Create temp table/field records to reference this collection
            (mt/with-temp [:model/Table table {:db_id (mt/id) :name coll-name}
                           :model/Field id-field {:table_id  (:id table)
                                                  :name      "_id"
                                                  :base_type :type/Dictionary}
                           :model/Field widget-field {:table_id  (:id table)
                                                      :name      "widgetType"
                                                      :base_type :type/Text
                                                      :parent_id (:id id-field)}
                           :model/Field impressions-field {:table_id  (:id table)
                                                           :name      "impressions"
                                                           :base_type :type/Integer}]

              ;; This query exercises the code path that was generating double-nested _id structures
              ;; Without the fix, this would generate:
              ;; $project: { "_id": false, "_id.widgetType": "$_id._id.widgetType", "sum": true }
              ;; Which causes: "Path collision at _id.widgetType remaining portion widgetType"
              (testing "Query with _id.widgetType breakout should not throw path collision error"
                (let [query  {:database (mt/id)
                              :type     :query
                              :query    {:source-table (:id table)
                                         :breakout     [[:field (:id widget-field) nil]]
                                         :aggregation  [[:sum [:field (:id impressions-field) nil]]]}}
                      ;; Execute the query - this would throw without the fix
                      result (qp/process-query query)]
                  ;; Verify we got results instead of an error
                  (is (= :completed (:status result)))
                  (is (= 2 (count (get-in result [:data :rows]))))
                  ;; Check the actual aggregated values
                  (is (= #{["banner" 2000] ["button" 2500]}
                         (set (get-in result [:data :rows])))))))

            (finally
              ;; Clean up
              (.drop coll))))))))

(deftest nested-id-field-collision-test
  (testing "Field name collision between _id.name and top-level name field (#34577 edge case)"
    (mt/test-driver :mongo
      (mongo.connection/with-mongo-database [^com.mongodb.client.MongoDatabase db (mt/db)]
        (let [coll-name                                (str "test_field_collision_" (System/currentTimeMillis))
              ^com.mongodb.client.MongoCollection coll (.getCollection db coll-name)]
          (try
            ;; Insert documents with both _id.name and top-level name
            (let [docs [(org.bson.Document.
                         {"_id"   (org.bson.Document. {"name" "internal-name-1" "seq" 1})
                          "name"  "external-name-1"
                          "count" 100})
                        (org.bson.Document.
                         {"_id"   (org.bson.Document. {"name" "internal-name-2" "seq" 1})
                          "name"  "external-name-2"
                          "count" 200})
                        (org.bson.Document.
                         {"_id"   (org.bson.Document. {"name" "internal-name-1" "seq" 2})
                          "name"  "external-name-3"
                          "count" 150})]]
              (.insertMany coll docs))

            (mt/with-temp [:model/Table table {:db_id (mt/id) :name coll-name}
                           :model/Field id-field {:table_id  (:id table)
                                                  :name      "_id"
                                                  :base_type :type/Dictionary}
                           :model/Field id-name-field {:table_id  (:id table)
                                                       :name      "name"
                                                       :base_type :type/Text
                                                       :parent_id (:id id-field)}
                           :model/Field name-field {:table_id  (:id table)
                                                    :name      "name"
                                                    :base_type :type/Text}
                           :model/Field count-field {:table_id  (:id table)
                                                     :name      "count"
                                                     :base_type :type/Integer}]

              (testing "Query grouping by _id.name with top-level name field present"
                (let [query  {:database (mt/id)
                              :type     :query
                              :query    {:source-table (:id table)
                                         :breakout     [[:field (:id id-name-field) nil]]
                                         :aggregation  [[:sum [:field (:id count-field) nil]]]}}
                      result (qp/process-query query)]
                  (is (= :completed (:status result)))
                  (is (= #{["internal-name-1" 250] ["internal-name-2" 200]}
                         (set (get-in result [:data :rows]))))))

              (testing "Query selecting both _id.name and top-level name - column naming"
                (let [query     {:database (mt/id)
                                 :type     :query
                                 :query    {:source-table (:id table)
                                            :fields       [[:field (:id id-name-field) nil]
                                                           [:field (:id name-field) nil]
                                                           [:field (:id count-field) nil]]
                                            :limit        2}}
                      ;; Compile the query to native MongoDB format
                      result    (qp/process-query query)
                      col-names (mapv :name (get-in result [:data :cols]))]
                  (is (= :completed (:status result)))

                  ;; Column naming behavior
                  (testing "Column names preserve full path for nested _id fields"
                    ;; Note: The field-alias function in query_processor.clj strips the "_id." prefix
                    ;; for MongoDB aggregation pipeline generation, but this aliasing is NOT applied
                    ;; to the final result column names. This prevents naming collisions in results.
                    (is (= ["_id.name" "name" "count"] col-names)
                        "Nested _id fields keep full path in column names"))

                  ;; Verify the data is correct
                  (testing "Data values are correct"
                    (let [rows (get-in result [:data :rows])]
                      (is (= 2 (count rows)))
                      ;; First column should be _id.name values
                      (is (every? #(contains? #{"internal-name-1" "internal-name-2"} (first %)) rows)
                          "First column should contain _id.name values")
                      ;; Second column should be top-level name values
                      (is (every? #(contains? #{"external-name-1" "external-name-2" "external-name-3"} (second %)) rows)
                          "Second column should contain top-level name values")))))

              (testing "Breakout query column naming"
                (let [query     {:database (mt/id)
                                 :type     :query
                                 :query    {:source-table (:id table)
                                            :breakout     [[:field (:id id-name-field) nil]]
                                            :aggregation  [[:sum [:field (:id count-field) nil]]]}}
                      result    (qp/process-query query)
                      col-names (mapv :name (get-in result [:data :cols]))]
                  (testing "Breakout column preserves full field path"
                    ;; Same as above - the full path is preserved in column names
                    (is (= ["_id.name" "sum"] col-names)
                        "_id.name keeps full path in breakout column name")))))
            (finally
              (.drop coll))))))))

(deftest field-alias-api-test
  (testing "MongoDB field paths are preserved in API responses (#34577)"
    (mt/test-driver :mongo
      (mongo.connection/with-mongo-database [^com.mongodb.client.MongoDatabase db (mt/db)]
        (let [coll-name                                (str "test_alias_api_" (System/currentTimeMillis))
              ^com.mongodb.client.MongoCollection coll (.getCollection db coll-name)]
          (try
            ;; Create documents with nested and top-level fields with same names
            (let [docs [(org.bson.Document.
                         {"_id"   (org.bson.Document. {"name" "id-name-1" "type" "A"})
                          "name"  "top-name-1"
                          "type"  "X"
                          "value" 100})
                        (org.bson.Document.
                         {"_id"   (org.bson.Document. {"name" "id-name-2" "type" "B"})
                          "name"  "top-name-2"
                          "type"  "Y"
                          "value" 200})]]
              (.insertMany coll docs))

            (mt/with-temp [:model/Table table {:db_id (mt/id) :name coll-name}
                           :model/Field id-field {:table_id  (:id table)
                                                  :name      "_id"
                                                  :base_type :type/Dictionary}
                           :model/Field id-name-field {:table_id  (:id table)
                                                       :name      "name"
                                                       :base_type :type/Text
                                                       :parent_id (:id id-field)}
                           :model/Field id-type-field {:table_id  (:id table)
                                                       :name      "type"
                                                       :base_type :type/Text
                                                       :parent_id (:id id-field)}
                           :model/Field name-field {:table_id  (:id table)
                                                    :name      "name"
                                                    :base_type :type/Text}
                           :model/Field type-field {:table_id  (:id table)
                                                    :name      "type"
                                                    :base_type :type/Text}
                           :model/Field value-field {:table_id  (:id table)
                                                     :name      "value"
                                                     :base_type :type/Integer}]

              (testing "Fields with nested paths maintain full paths in API"
                (let [query     {:database (mt/id)
                                 :type     :query
                                 :query    {:source-table (:id table)
                                            :fields       [[:field (:id id-name-field) nil]
                                                           [:field (:id id-type-field) nil]
                                                           [:field (:id name-field) nil]
                                                           [:field (:id type-field) nil]
                                                           [:field (:id value-field) nil]]
                                            :order-by     [[:asc [:field (:id value-field) nil]]]}}
                      result    (qp/process-query query)
                      col-names (mapv :name (get-in result [:data :cols]))]

                  (testing "API column names use full field paths"
                    ;; Column names preserve the full path for nested fields
                    (is (= ["_id.name" "_id.type" "name" "type" "value"] col-names)
                        "Nested _id fields keep full paths, preventing collisions"))

                  (testing "Data values are correctly extracted from nested documents"
                    (let [rows (get-in result [:data :rows])]
                      (is (= [["id-name-1" "A" "top-name-1" "X" 100]
                              ["id-name-2" "B" "top-name-2" "Y" 200]]
                             rows)
                          "Values correctly map to their respective columns")))))

              (testing "Simple breakout by _id.type only"
                (let [query     {:database (mt/id)
                                 :type     :query
                                 :query    {:source-table (:id table)
                                            :breakout     [[:field (:id id-type-field) nil]]
                                            :aggregation  [[:sum [:field (:id value-field) nil]]]}}
                      result    (qp/process-query query)
                      col-names (mapv :name (get-in result [:data :cols]))
                      rows      (get-in result [:data :rows])]

                  (testing "Single _id field breakout works correctly"
                    (is (= ["_id.type" "sum"] col-names))
                    (is (= #{["A" 100] ["B" 200]} (set rows))
                        "Should group by _id.type values (A, B)")))))
            (finally
              (.drop coll))))))))

(deftest breakout-field-collision-bug-test
  (testing "BUG: Breaking out by both _id.type and type returns wrong values (#34577)"
    (mt/test-driver :mongo
      (mongo.connection/with-mongo-database [^com.mongodb.client.MongoDatabase db (mt/db)]
        (let [coll-name                                (str "test_breakout_bug_" (System/currentTimeMillis))
              ^com.mongodb.client.MongoCollection coll (.getCollection db coll-name)]
          (try
            ;; Create documents
            (let [docs [(org.bson.Document.
                         {"_id"   (org.bson.Document. {"type" "A"})
                          "type"  "X"
                          "value" 100})
                        (org.bson.Document.
                         {"_id"   (org.bson.Document. {"type" "B"})
                          "type"  "Y"
                          "value" 200})]]
              (.insertMany coll docs))

            (mt/with-temp [:model/Table table {:db_id (mt/id) :name coll-name}
                           :model/Field id-field {:table_id  (:id table)
                                                  :name      "_id"
                                                  :base_type :type/Dictionary}
                           :model/Field id-type-field {:table_id  (:id table)
                                                       :name      "type"
                                                       :base_type :type/Text
                                                       :parent_id (:id id-field)}
                           :model/Field type-field {:table_id  (:id table)
                                                    :name      "type"
                                                    :base_type :type/Text}
                           :model/Field value-field {:table_id  (:id table)
                                                     :name      "value"
                                                     :base_type :type/Integer}]

              (testing "Breakout by both _id.type and type"
                (let [query     {:database (mt/id)
                                 :type     :query
                                 :query    {:source-table (:id table)
                                            :breakout     [[:field (:id id-type-field) nil]
                                                       [:field (:id type-field) nil]]
                                            :aggregation  [[:sum [:field (:id value-field) nil]]]}}
                      result    (qp/process-query query)
                      col-names (mapv :name (get-in result [:data :cols]))
                      rows      (get-in result [:data :rows])]

                  (testing "Column names are correct"
                    (is (= ["_id.type" "type" "sum"] col-names)))

                  (testing "FAILS: Both breakout fields reference the same MongoDB path"
                    ;; This is the bug - we get ["X" "X" 100] instead of ["A" "X" 100]
                    (is (= #{["A" "X" 100] ["B" "Y" 200]}
                           (set rows))
                        "Currently fails: both columns show top-level type value")))))

            (finally
              (.drop coll))))))))

(deftest nested-id-deep-nesting-test
  (testing "Deep nesting in _id fields (_id.level1.level2) (#34577 edge case)"
    (mt/test-driver :mongo
      (mongo.connection/with-mongo-database [^com.mongodb.client.MongoDatabase db (mt/db)]
        (let [coll-name                                (str "test_deep_nesting_" (System/currentTimeMillis))
              ^com.mongodb.client.MongoCollection coll (.getCollection db coll-name)]
          (try
            ;; Insert documents with deeply nested _id structure
            (let [docs [(org.bson.Document.
                         {"_id"   (org.bson.Document.
                                   {"user" (org.bson.Document. {"id" 1 "name" "Alice"})
                                    "seq"  1})
                          "total" 100})
                        (org.bson.Document.
                         {"_id"   (org.bson.Document.
                                   {"user" (org.bson.Document. {"id" 2 "name" "Bob"})
                                    "seq"  1})
                          "total" 200})
                        (org.bson.Document.
                         {"_id"   (org.bson.Document.
                                   {"user" (org.bson.Document. {"id" 1 "name" "Alice"})
                                    "seq"  2})
                          "total" 150})]]
              (.insertMany coll docs))

            (mt/with-temp [:model/Table table {:db_id (mt/id) :name coll-name}
                           :model/Field id-field {:table_id  (:id table)
                                                  :name      "_id"
                                                  :base_type :type/Dictionary}
                           :model/Field user-field {:table_id  (:id table)
                                                    :name      "user"
                                                    :base_type :type/Dictionary
                                                    :parent_id (:id id-field)}
                           :model/Field user-name-field {:table_id  (:id table)
                                                         :name      "name"
                                                         :base_type :type/Text
                                                         :parent_id (:id user-field)}
                           :model/Field total-field {:table_id  (:id table)
                                                     :name      "total"
                                                     :base_type :type/Integer}]

              (testing "Query grouping by _id.user.name (deep nesting)"
                (let [query  {:database (mt/id)
                              :type     :query
                              :query    {:source-table (:id table)
                                         :breakout     [[:field (:id user-name-field) nil]]
                                         :aggregation  [[:sum [:field (:id total-field) nil]]]}}
                      result (qp/process-query query)]
                  (is (= :completed (:status result)))
                  (is (= #{["Alice" 250] ["Bob" 200]}
                         (set (get-in result [:data :rows])))))))
            (finally
              (.drop coll))))))))

(deftest nested-id-mixed-fields-test
  (testing "Mixed query with both _id.* and regular nested fields (#34577 edge case)"
    (mt/test-driver :mongo
      (mongo.connection/with-mongo-database [^com.mongodb.client.MongoDatabase db (mt/db)]
        (let [coll-name                                (str "test_mixed_fields_" (System/currentTimeMillis))
              ^com.mongodb.client.MongoCollection coll (.getCollection db coll-name)]
          (try
            ;; Insert documents with both _id.* and regular nested fields
            (let [docs [(org.bson.Document.
                         {"_id"      (org.bson.Document. {"type" "A" "seq" 1})
                          "metadata" (org.bson.Document. {"category" "X"})
                          "value"    100})
                        (org.bson.Document.
                         {"_id"      (org.bson.Document. {"type" "B" "seq" 1})
                          "metadata" (org.bson.Document. {"category" "Y"})
                          "value"    200})
                        (org.bson.Document.
                         {"_id"      (org.bson.Document. {"type" "A" "seq" 2})
                          "metadata" (org.bson.Document. {"category" "Y"})
                          "value"    150})
                        (org.bson.Document.
                         {"_id"      (org.bson.Document. {"type" "B" "seq" 2})
                          "metadata" (org.bson.Document. {"category" "X"})
                          "value"    300})]]
              (.insertMany coll docs))

            (mt/with-temp [:model/Table table {:db_id (mt/id) :name coll-name}
                           :model/Field id-field {:table_id  (:id table)
                                                  :name      "_id"
                                                  :base_type :type/Dictionary}
                           :model/Field id-type-field {:table_id  (:id table)
                                                       :name      "type"
                                                       :base_type :type/Text
                                                       :parent_id (:id id-field)}
                           :model/Field metadata-field {:table_id  (:id table)
                                                        :name      "metadata"
                                                        :base_type :type/Dictionary}
                           :model/Field category-field {:table_id  (:id table)
                                                        :name      "category"
                                                        :base_type :type/Text
                                                        :parent_id (:id metadata-field)}
                           :model/Field value-field {:table_id  (:id table)
                                                     :name      "value"
                                                     :base_type :type/Integer}]

              (testing "Query grouping by both _id.type and metadata.category"
                (let [query  {:database (mt/id)
                              :type     :query
                              :query    {:source-table (:id table)
                                         :breakout     [[:field (:id id-type-field) nil]
                                                    [:field (:id category-field) nil]]
                                         :aggregation  [[:sum [:field (:id value-field) nil]]]}}
                      result (qp/process-query query)]
                  (is (= :completed (:status result)))
                  (is (= #{["A" "X" 100] ["A" "Y" 150] ["B" "X" 300] ["B" "Y" 200]}
                         (set (get-in result [:data :rows])))))))
            (finally
              (.drop coll))))))))

(deftest nested-id-similar-name-test
  (testing "KNOWN LIMITATION: Top-level fields with '_id.' prefix are not supported (#34577)"
    ;; I think MongoDB technically allows periods in field names, including "_id."
    ;; prefixes, but this is strongly discouraged due to conflicts with dot notation.
    ;; Metabase treats any field starting with "_id." as a nested _id field reference.
    ;; Users should avoid naming top-level fields with "_id." prefix.
    (mt/test-driver :mongo
      (mongo.connection/with-mongo-database [^com.mongodb.client.MongoDatabase db (mt/db)]
        (let [coll-name                                (str "test_similar_name_" (System/currentTimeMillis))
              ^com.mongodb.client.MongoCollection coll (.getCollection db coll-name)]
          (try
            ;; Insert documents with field names that could be confused
            ;; Note: We intentionally don't have a nested widget field in _id
            (let [docs [(org.bson.Document.
                         {"_id"        (org.bson.Document. {"seq" 1}) ; No widget field here
                          "_id.widget" "X" ; Top-level field that starts with "_id."
                          "count"      100})
                        (org.bson.Document.
                         {"_id"        (org.bson.Document. {"seq" 2})
                          "_id.widget" "Y"
                          "count"      200})
                        (org.bson.Document.
                         {"_id"        (org.bson.Document. {"seq" 3})
                          "_id.widget" "Z"
                          "count"      150})]]
              (.insertMany coll docs))

            (mt/with-temp [:model/Table table {:db_id (mt/id) :name coll-name}
                           :model/Field _id-field {:table_id  (:id table)
                                                   :name      "_id"
                                                   :base_type :type/Dictionary}
                           :model/Field confusing-field {:table_id  (:id table)
                                                         :name      "_id.widget"
                                                         :base_type :type/Text}
                           :model/Field count-field {:table_id  (:id table)
                                                     :name      "count"
                                                     :base_type :type/Integer}]

              (testing "LIMITATION: Top-level field named '_id.widget' is treated as nested field reference"
                ;; This query will not work as expected because Metabase interprets "_id.widget" 
                ;; as a reference to the nested _id.widget field (which doesn't exist),
                ;; not the top-level field with literal name "_id.widget"
                (let [query  {:database (mt/id)
                              :type     :query
                              :query    {:source-table (:id table)
                                         :breakout     [[:field (:id confusing-field) nil]]
                                         :aggregation  [[:sum [:field (:id count-field) nil]]]}}
                      result (qp/process-query query)]
                  (is (= :completed (:status result)))
                  ;; The query returns nil values because it's looking for a nested field
                  ;; that doesn't exist, instead of the top-level "_id.widget" field
                  (is (= #{[nil 450]} ; All docs grouped under nil
                         ;; not #{["X" 100] ["Y" 200] ["Z" 150]}
                         (set (get-in result [:data :rows])))))))
            (finally
              (.drop coll))))))))

(deftest nested-id-count-aggregation-test
  (testing "Count aggregation with nested _id field breakout (#34577 - matches e2e test)"
    ;; This test replicates the e2e test scenario: count of rows grouped by a nested _id field
    (mt/test-driver :mongo
      (mongo.connection/with-mongo-database [^com.mongodb.client.MongoDatabase db (mt/db)]
        (let [coll-name                                "nested_id_collection" ; Match e2e test collection name
              ^com.mongodb.client.MongoCollection coll (.getCollection db coll-name)]
          (try
            ;; Insert documents with Country nested in _id
            (let [docs [(org.bson.Document.
                         {"_id"  (org.bson.Document. {"Country" "USA" "id" 1})
                          "data" "some data"})
                        (org.bson.Document.
                         {"_id"  (org.bson.Document. {"Country" "USA" "id" 2})
                          "data" "more data"})
                        (org.bson.Document.
                         {"_id"  (org.bson.Document. {"Country" "Canada" "id" 3})
                          "data" "other data"})]]
              (.insertMany coll docs))

            (mt/with-temp [:model/Table table {:db_id (mt/id) :name coll-name}
                           :model/Field id-field {:table_id  (:id table)
                                                  :name      "_id"
                                                  :base_type :type/Dictionary}
                           :model/Field country-field {:table_id  (:id table)
                                                       :name      "Country"
                                                       :base_type :type/Text
                                                       :parent_id (:id id-field)}
                           :model/Field _data-field {:table_id  (:id table)
                                                     :name      "data"
                                                     :base_type :type/Text}]

              (testing "Count of rows grouped by _id.Country"
                (let [query  {:database (mt/id)
                              :type     :query
                              :query    {:source-table (:id table)
                                         :breakout     [[:field (:id country-field) nil]]
                                         :aggregation  [[:count]]}}
                      result (qp/process-query query)
                      rows   (get-in result [:data :rows])]

                  (is (= :completed (:status result)))

                  ;; Our test data has USA appearing twice
                  (is (= #{["Canada" 1] ["USA" 2]}
                         (set rows))
                      "Count aggregation with nested _id field works correctly")

                  ;; Column names should be correct
                  (let [col-names (mapv :name (get-in result [:data :cols]))]
                    (is (= ["_id.Country" "count"] col-names))))))
            (finally
              (.drop coll))))))))
