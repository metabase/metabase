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
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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
                                                              :conn-uri "mongodb://metabase:metasample123@localhost:27017/test-data?authSource=admin"}
                                                   :expected (not (tdm/ssl-required?))}
                                                  {:details  {:use-conn-uri true
                                                              :conn-uri "mongodb://localhost:3000/bad-db-name?connectTimeoutMS=50"}
                                                   :expected false}]
              :let [ssl-details (tdm/conn-details details)]]
        (testing (str "connect with " details)
          (is (= expected
                 (driver.u/can-connect-with-details? :mongo ssl-details))
              (str message)))))))

(deftest database-supports?-test
  (mt/test-driver :mongo
    (doseq [{:keys [dbms_version expected]}
            [{:dbms_version {:semantic-version [5 0 0 0]}
              :expected true}
             {:dbms_version  {}
              :expected false}
             {:dbms_version  {:semantic-version []}
              :expected false}
             {:dbms_version  {:semantic-version [2 2134234]}
              :expected false}]]
      (testing (str "supports with " dbms_version)
        (mt/with-temp [:model/Database db {:name "dummy", :engine "mongo", :dbms_version dbms_version}]
          (is (= expected
                 (driver/database-supports? :mongo :expressions db))))))
    (is (= #{:collection}
           (lib/required-native-extras (mt/metadata-provider))))))

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
                      :cols             [{:name         "count"
                                          :display_name "count"
                                          :base_type    :type/Integer
                                          :effective_type :type/Integer
                                          :source       :native
                                          :field_ref    [:field "count" {:base-type :type/Integer}]}]
                      :native_form      {:collection "venues"
                                         :query      native-query}
                      :results_timezone "UTC"
                      :results_metadata {:columns [{:name           "count"
                                                    :base_type      :type/Integer
                                                    :effective_type :type/Integer}]}}}
         (-> (qp/process-query {:native   {:query      native-query
                                           :collection "venues"}
                                :type     :native
                                :database (mt/id)})
             (m/dissoc-in [:data :insights]))))))

(deftest ^:parallel nested-native-query-test
  (mt/test-driver :mongo
    (testing "Mbql query with nested native source query _returns correct results_ (#30112)"
      (mt/with-temp [:model/Card {:keys [id]} {:dataset_query {:type     :native
                                                               :native   {:collection    "venues"
                                                                          :query         native-query}
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
                                                                 :native   {:collection    "venues"
                                                                            :query         query-str}
                                                                 :database (mt/id)}}]
          (let [query (mt/mbql-query venues
                        {:source-table (str "card__" id)
                         :aggregation [:count]
                         :breakout [*category_id/Integer]
                         :order-by [[:desc [:aggregation 0]]]
                         :limit 5})]
            (is (partial=
                 {:status :completed
                  :data   {:native_form
                           {:collection "venues"
                            :query (conj (mongo.qp/parse-query-string query-str)
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

(tx/defdataset nested-bindata-coll
  (let [not-uuid (Binary. (byte 0) (byte-array 1))
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
                :name "dogs",
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
                          {:name "nested_mixed_uuid", :database-type "object", :base-type :type/Dictionary, :database-position 8,
                           :nested-fields #{{:name "nested_data", :database-type "binData", :base-type :type/MongoBinData, :database-position 9}}
                           :visibility-type :details-only}
                          {:name "nested_mixed_not_uuid", :database-type "object", :base-type :type/Dictionary, :database-position 4,
                           :nested-fields #{{:name "nested_data_2", :database-type "binData", :base-type :type/MongoBinData, :database-position 5}}
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

          (testing "compound index"
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
      (is (= [{:name "_id",            :database_type "long",   :base_type :type/Integer, :semantic_type :type/PK}
              {:name "favorite_snack", :database_type "null",   :base_type :type/*,       :semantic_type nil}
              {:name "name",           :database_type "string", :base_type :type/Text,    :semantic_type :type/Name}]
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
          (is (= #{{:name "_id",            :database_type "long",   :base_type :type/Integer, :semantic_type :type/PK}
                   {:name "favorite_snack", :database_type "string", :base_type :type/Text,    :semantic_type :type/Category}
                   {:name "name",           :database_type "string", :base_type :type/Text,    :semantic_type :type/Name}
                   {:name "max_wingspan",   :database_type "long",   :base_type :type/Integer, :semantic_type nil}}
                 (into #{}
                       (map (partial into {}))
                       (t2/select [:model/Field :name :database_type :base_type :semantic_type]
                                  :table_id (mt/id :bird_species)
                                  {:order-by [:name]})))))))))

(deftest table-rows-sample-test
  (mt/test-driver :mongo
    (testing "Should return the latest `nested-field-sample-limit` rows"
      (let [table (t2/select-one :model/Table :id (mt/id :venues))
            fields (map #(t2/select-one :model/Field :id (mt/id :venues %)) [:name :category_id])
            rff (constantly conj)]
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
      (is (= [[{:semantic_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:semantic_type :type/Name,      :base_type :type/Text,     :name "name"}]
              [{:semantic_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:semantic_type nil,             :base_type :type/Instant,  :name "date"}
               {:semantic_type :type/FK,        :base_type :type/Integer,  :name "user_id"}
               {:semantic_type :type/FK,        :base_type :type/Integer,  :name "venue_id"}]
              [{:semantic_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:semantic_type nil,             :base_type :type/Instant,  :name "last_login"}
               {:semantic_type :type/Name,      :base_type :type/Text,     :name "name"}
               {:semantic_type :type/Category,  :base_type :type/Text,     :name "password"}]
              [{:semantic_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:semantic_type :type/FK,        :base_type :type/Integer,  :name "category_id"}
               {:semantic_type :type/Latitude,  :base_type :type/Float,    :name "latitude"}
               {:semantic_type :type/Longitude, :base_type :type/Float,    :name "longitude"}
               {:semantic_type :type/Name,      :base_type :type/Text,     :name "name"}
               {:semantic_type :type/Category,  :base_type :type/Integer,  :name "price"}]]
             (vec (for [table-name table-names]
                    (vec (for [field (t2/select [:model/Field :name :base_type :semantic_type]
                                                :active   true
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
                          {:fields [$id $bird_id]
                           :order-by [[:asc $bird_id]]}))))
        (is (= [[2 (ObjectId. "abcdefabcdefabcdefabcdef")]
                [1 (ObjectId. "012345678901234567890123")]
                [3 nil]]
               (mt/rows (mt/run-mbql-query birds
                          {:fields [$id $bird_id]
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
                          {:fields [$id $bird_uuid]
                           :order-by [[:asc $bird_uuid]]}))))
        (is (= [[2 #uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]
                [1 #uuid "11111111-1111-1111-1111-111111111111"]
                [3 nil]]
               (mt/rows (mt/run-mbql-query birds
                          {:fields [$id $bird_uuid]
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
      (is (nil?
           (lib.util.match/match-lite
             (->> (magic/automagic-analysis (t2/select-one :model/Field :id (mt/id :venues :price)) {})
                  :dashcards
                  (mapcat (comp :breakout :query :dataset_query :card)))
             [:field _ (_ :guard :binning)] true))))))

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
          (is (= {:rows [[1 "African"  nil]
                         [2 "American" nil]
                         [3 "Artisan"  nil]]}
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
                                      :active   true
                                      :table_id (mt/id :coll)
                                      {:order-by [:database_position]}))]
          (is (=? [{:name "_id",   :database_type "long",   :base_type :type/Integer,    :semantic_type :type/PK}
                   {:name "a",     :database_type "string", :base_type :type/Text,       :semantic_type :type/Category}
                   {:name "b",     :database_type "object", :base_type :type/Dictionary, :semantic_type nil}
                   {:name "b_c",   :database_type "string", :base_type :type/Text,       :semantic_type :type/Category}
                   {:name "b_d",   :database_type "int",    :base_type :type/Integer,    :semantic_type nil}
                   {:name "b_e",   :database_type "object", :base_type :type/Dictionary, :semantic_type nil}
                   {:name "b_e_f", :database_type "string", :base_type :type/Text,       :semantic_type :type/Category}
                   {:name "c",     :database_type "null",   :base_type :type/*,          :semantic_type nil}]
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
      (with-redefs [mongo.util/run-command (constantly {"version" "4.0.28-23"
                                                        "versionArray" [4 0 29 -100]})]
        (is (= {:version "4.0.28-23"
                :semantic-version [4 0 29]}
               (driver/dbms-version :mongo (mt/db))))))

    (testing "Any values after rubbish in versionArray are ignored"
      (with-redefs [mongo.util/run-command (constantly {"version" "4.0.28-23"
                                                        "versionArray" [4 0 "NaN" 29]})]
        (is (= {:version "4.0.28-23"
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
                                                                    :fields [(mt/id :coll :id)
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
               (->> {:filter [:is-empty
                              [:field (mt/id :dogs :person_id) {:base-type "type/MongoBinData"}]]
                     :source-table (mt/id :dogs)}
                    (mt/run-mbql-query dogs)
                    mt/rows)))
        (is (= [[1 #uuid "27e164bc-54f8-47a0-a85a-9f0e90dd7667" "Ivan" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]
                [2 #uuid "3a0c0508-6b00-40ff-97f6-549666b2d16b" "Zach" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]
                [3 #uuid "d6a82cf5-7dc9-48a3-a15d-61df91a6edeb" "Boss" #uuid "d39bbe77-4e2e-4b7b-8565-cce90c25c99b"]]
               (->> {:filter [:not-empty
                              [:field (mt/id :dogs :person_id) {:base-type "type/MongoBinData"}]]
                     :source-table (mt/id :dogs)}
                    (mt/run-mbql-query dogs)
                    mt/rows)))
        (is (= [[1 #uuid "27e164bc-54f8-47a0-a85a-9f0e90dd7667" "Ivan" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]
                [2 #uuid "3a0c0508-6b00-40ff-97f6-549666b2d16b" "Zach" #uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]]
               (->> {:filter [:!=
                              [:field (mt/id :dogs :person_id) {:base-type "type/MongoBinData"}]
                              "d39bbe77-4e2e-4b7b-8565-cce90c25c99b"]
                     :source-table (mt/id :dogs)}
                    (mt/run-mbql-query dogs)
                    mt/rows)))
        (is (= [[3 #uuid "d6a82cf5-7dc9-48a3-a15d-61df91a6edeb" "Boss" #uuid "d39bbe77-4e2e-4b7b-8565-cce90c25c99b"]]
               (->> {:filter [:=
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
               (->> {:filter [:and
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

  - `dbfields`     : result of [[mongo/fetch-dbfields]],
  - `ftree`        : result of [[mongo/dbfields->ftree]],
  - `nested-fields`: result of [[mongo/ftree->nested-fields]]."
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

(deftest dbref-field-test
  (mt/test-driver :mongo
    (let [id-1 (ObjectId. "68bee671b76da7388a01e6c1")
          id-2 (ObjectId. "68bee676e7c18921ff7dcf04")
          ref-1 (com.mongodb.DBRef. "some_collection" id-1)
          ref-2 (com.mongodb.DBRef. "some_db" "some_collection" id-2)]
      (mt/dataset (mt/dataset-definition
                   "dbref_db"
                   [["dbref_coll"
                     [{:field-name "name", :base-type :type/Text}
                      {:field-name "dbref", :base-type :type/*}]
                     [["ref1" ref-1]
                      ["ref2" ref-2]]]])
        (is (= [[1 "ref1" ref-1 "some_collection" id-1 nil]
                [2 "ref2" ref-2 "some_collection" id-2 "some_db"]]
               (mt/rows (mt/run-mbql-query dbref_coll))))))))

(deftest ^:parallel type->database-type-test
  (testing "type->database-type multimethod returns correct MongoDB types"
    (are [base-type expected] (= expected (driver/type->database-type :mongo base-type))
      :type/TextLike           "string"
      :type/Text               "string"
      :type/Number             "long"
      :type/Integer            "int"
      :type/BigInteger         "long"
      :type/Float              "double"
      :type/Decimal            "decimal"
      :type/Boolean            "bool"
      :type/Date               "date"
      :type/DateTime           "date"
      :type/DateTimeWithTZ     "date"
      :type/Time               "date"
      :type/TimeWithTZ         "date"
      :type/Instant            "date"
      :type/UUID               "uuid"
      :type/JSON               "object"
      :type/SerializedJSON     "string"
      :type/Array              "array"
      :type/Dictionary         "object"
      :type/MongoBSONID        "objectId"
      :type/MongoBinData       "binData"
      :type/IPAddress          "string")))

(deftest ^:parallel prettify-native-form-test
  (mt/test-driver :mongo
    (testing "prettifies normal lib query"
      (let [mp (mt/metadata-provider)
            products-table (lib.metadata/table mp (mt/id :products))
            product-category (lib.metadata/field mp (mt/id :products :category))
            query (-> (lib/query mp products-table)
                      (lib/filter (lib/= product-category
                                         "Widget")))]
        (is (= (str/join "\n"
                         ["["
                          "  {"
                          "    \"$match\": {"
                          "      \"category\": \"Widget\""
                          "    }"
                          "  },"
                          "  {"
                          "    \"$project\": {"
                          "      \"_id\": \"$_id\","
                          "      \"ean\": \"$ean\","
                          "      \"title\": \"$title\","
                          "      \"category\": \"$category\","
                          "      \"vendor\": \"$vendor\","
                          "      \"price\": \"$price\","
                          "      \"rating\": \"$rating\","
                          "      \"created_at\": \"$created_at\""
                          "    }"
                          "  },"
                          "  {"
                          "    \"$limit\": 1048575"
                          "  }"
                          "]"])
               (->> (qp.compile/compile-with-inline-parameters query)
                    :query
                    (driver/prettify-native-form :mongo))))))
    (testing "prettifies native query with variable that is valid json"
      (let [query {:database (mt/id)
                   :type :native
                   :native {:collection "products"
                            :query (str/join "\n"
                                             ["["
                                              "  {"
                                              "    \"$match\": {"
                                              "      \"category\": {{category_var}}"
                                              "    }},"
                                              "  {"
                                              "    \"$project\": {"
                                              "      \"_id\": \"$_id\","
                                              "      \"title\": \"$title\","
                                              "      \"category\": \"$category\""
                                              "    }},"
                                              "  {"
                                              "    \"$limit\": 1048575"
                                              "  }"
                                              "]"])
                            :template-tags {"category_var" {:name "category_var"
                                                            :display-name "Category Variable"
                                                            :type :text}}}
                   :parameters [{:type :text
                                 :target [:variable [:template-tag "category_var"]]
                                 :value "Gadget"}]}]
        (is (= (str/join "\n"
                         ["["
                          "  {"
                          "    \"$match\": {"
                          "      \"category\": \"Gadget\""
                          "    }"
                          "  },"
                          "  {"
                          "    \"$project\": {"
                          "      \"_id\": \"$_id\","
                          "      \"title\": \"$title\","
                          "      \"category\": \"$category\""
                          "    }"
                          "  },"
                          "  {"
                          "    \"$limit\": 1048575"
                          "  }"
                          "]"])
               (->> (qp.compile/compile-with-inline-parameters query)
                    :query
                    (driver/prettify-native-form :mongo))))))
    (testing "prettifies native query with variable that is not valid json"
      (let [query {:database (mt/id)
                   :type :native
                   :native {:collection "products"
                            :query (str/join "\n"
                                             ["["
                                              "  {"
                                              "    \"$match\": {"
                                              "      \"created_at\": {\"$gte\": {{created_at_var}}}"
                                              "    }},"
                                              "  {"
                                              "    \"$project\": {"
                                              "      \"_id\": \"$_id\","
                                              "      \"title\": \"$title\","
                                              "      \"category\": \"$category\""
                                              "    }},"
                                              "  {"
                                              "    \"$limit\": 1048575"
                                              "  }"
                                              "]"])
                            :template-tags {"created_at_var" {:name "created_at_var"
                                                              :display-name "Created At Variable"
                                                              :type :date}}}
                   :parameters [{:type :date/single
                                 :target [:variable [:template-tag "created_at_var"]]
                                 :value "2018-01-01"}]}]
        (is (= (str/join "\n"
                         ["["
                          "  {"
                          "    \"$match\": {"
                          "      \"created_at\": {\"$gte\": ISODate(\"2018-01-01\")}"
                          "    }},"
                          "  {"
                          "    \"$project\": {"
                          "      \"_id\": \"$_id\","
                          "      \"title\": \"$title\","
                          "      \"category\": \"$category\""
                          "    }},"
                          "  {"
                          "    \"$limit\": 1048575"
                          "  }"
                          "]"])
               (->> (qp.compile/compile-with-inline-parameters query)
                    :query
                    (driver/prettify-native-form :mongo))))))))
