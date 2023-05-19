(ns metabase.driver.mongo-test
  "Tests for Mongo driver."
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver :as driver]
            [metabase.driver.mongo :as mongo]
            [metabase.driver.mongo.util :as mongo.util]
            [metabase.driver.util :as driver.u]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :as table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.query-processor-test :as qp.test :refer [rows]]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.mongo :as tdm]
            [metabase.util.log :as log]
            [monger.collection :as mcoll]
            [monger.core :as mg]
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
                                                           :user   "metabase"
                                                           :pass   "metasample123"
                                                           :dbname "metabase-test"}
                                                :expected true}
                                               {:details  {:host   "localhost"
                                                           :user   "metabase"
                                                           :pass   "metasample123"
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
                                               {:details  {:conn-uri "mongodb://metabase:metasample123@localhost:27017/metabase-test?authSource=admin"}
                                                :expected (not (tdm/ssl-required?))}
                                               {:details  {:conn-uri "mongodb://localhost:3000/bad-db-name?connectTimeoutMS=50"}
                                                :expected false}]
           :let [ssl-details (tdm/conn-details details)]]
     (testing (str "connect with " details)
       (is (= expected
              (driver.u/can-connect-with-details? :mongo ssl-details))
           (str message))))))

(deftest database-supports?-test
 (mt/test-driver
    :mongo
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
        (is (= expected
               (let [db (db/insert! Database {:name "dummy", :engine "mongo", :dbms_version dbms_version})]
                 (driver/database-supports? :mongo :expressions db))))))))


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
                      :results_timezone "UTC"}}
         (-> (qp/process-query {:native   {:query      native-query
                                           :collection "venues"}
                                :type     :native
                                :database (mt/id)})
             (m/dissoc-in [:data :results_metadata] [:data :insights]))))))

;; ## Tests for individual syncing functions

(deftest describe-database-test
  (mt/test-driver :mongo
    (is (= #{{:schema nil, :name "checkins"}
             {:schema nil, :name "categories"}
             {:schema nil, :name "users"}
             {:schema nil, :name "venues"}}
            (:tables (driver/describe-database :mongo (mt/db)))))))

(deftest describe-table-test
  (mt/test-driver :mongo
    (is (= {:schema nil
            :name   "venues"
            :fields #{{:name              "name"
                       :database-type     "java.lang.String"
                       :base-type         :type/Text
                       :database-position 1}
                      {:name              "latitude"
                       :database-type     "java.lang.Double"
                       :base-type         :type/Float
                       :database-position 3}
                      {:name              "longitude"
                       :database-type     "java.lang.Double"
                       :base-type         :type/Float
                       :database-position 4}
                      {:name              "price"
                       :database-type     "java.lang.Long"
                       :base-type         :type/Integer
                       :database-position 5}
                      {:name              "category_id"
                       :database-type     "java.lang.Long"
                       :base-type         :type/Integer
                       :database-position 2}
                      {:name              "_id"
                       :database-type     "java.lang.Long"
                       :base-type         :type/Integer
                       :pk?               true
                       :database-position 0}}}
           (driver/describe-table :mongo (mt/db) (db/select-one Table :id (mt/id :venues)))))))

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
      (is (= [{:name "_id",            :database_type "java.lang.Long",   :base_type :type/Integer, :semantic_type :type/PK}
              {:name "favorite_snack", :database_type "NULL",             :base_type :type/*,       :semantic_type nil}
              {:name "name",           :database_type "java.lang.String", :base_type :type/Text,    :semantic_type :type/Name}]
             (map
              (partial into {})
              (db/select [Field :name :database_type :base_type :semantic_type]
                :table_id (mt/id :bird_species)
                {:order-by [:name]})))))))

(deftest new-rows-take-precedence-when-collecting-metadata-test
  (mt/test-driver :mongo
    (with-redefs [metadata-queries/nested-field-sample-limit 2]
      (binding [tdm/*remove-nil?* true]
        (mt/with-temp-test-data
          ["bird_species"
           [{:field-name "name", :base-type :type/Text}
            {:field-name "favorite_snack", :base-type :type/Text}
            {:field-name "max_wingspan", :base-type :type/Integer}]
           [["Sharp-shinned Hawk" nil 68]
            ["Tropicbird" nil 112]
            ["House Finch" nil nil]
            ["Mourning Dove" nil nil]
            ["Common Blackbird" "earthworms" nil]
            ["Silvereye" "cherries" nil]]]
          ;; do a full sync on the DB to get the correct semantic type info
          (sync/sync-database! (mt/db))
          (is (= #{{:name "_id", :database_type "java.lang.Long", :base_type :type/Integer, :semantic_type :type/PK}
                   {:name "favorite_snack", :database_type "java.lang.String", :base_type :type/Text, :semantic_type :type/Category}
                   {:name "name", :database_type "java.lang.String", :base_type :type/Text, :semantic_type :type/Name}
                   {:name "max_wingspan", :database_type "java.lang.Long", :base_type :type/Integer, :semantic_type nil}}
                 (into #{}
                       (map (partial into {}))
                       (db/select [Field :name :database_type :base_type :semantic_type]
                         :table_id (mt/id :bird_species)
                         {:order-by [:name]})))))))))

(deftest table-rows-sample-test
  (mt/test-driver :mongo
    (testing "Should return the latest `nested-field-sample-limit` rows"
      (let [table (db/select-one Table :id (mt/id :venues))
            fields (map #(db/select-one Field :id (mt/id :venues %)) [:name :category_id])
            rff (constantly conj)]
        (with-redefs [metadata-queries/nested-field-sample-limit 5]
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
      (is (= [[{:semantic_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:semantic_type :type/Name,      :base_type :type/Text,     :name "name"}]
              [{:semantic_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:semantic_type nil,             :base_type :type/Instant,  :name "date"}
               {:semantic_type :type/Category,  :base_type :type/Integer,  :name "user_id"}
               {:semantic_type nil,             :base_type :type/Integer,  :name "venue_id"}]
              [{:semantic_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:semantic_type nil,             :base_type :type/Instant,  :name "last_login"}
               {:semantic_type :type/Name,      :base_type :type/Text,     :name "name"}
               {:semantic_type :type/Category,  :base_type :type/Text,     :name "password"}]
              [{:semantic_type :type/PK,        :base_type :type/Integer,  :name "_id"}
               {:semantic_type :type/Category,  :base_type :type/Integer,  :name "category_id"}
               {:semantic_type :type/Latitude,  :base_type :type/Float,    :name "latitude"}
               {:semantic_type :type/Longitude, :base_type :type/Float,    :name "longitude"}
               {:semantic_type :type/Name,      :base_type :type/Text,     :name "name"}
               {:semantic_type :type/Category,  :base_type :type/Integer,  :name "price"}]]
             (vec (for [table-name table-names]
                    (vec (for [field (db/select [Field :name :base_type :semantic_type]
                                       :active   true
                                       :table_id (mt/id table-name)
                                       {:order-by [:name]})]
                           (into {} field))))))))))

(tx/defdataset with-bson-ids
  [["birds"
     [{:field-name "name", :base-type :type/Text}
      {:field-name "bird_id", :base-type :type/MongoBSONID}
      {:field-name "bird_uuid", :base-type :type/UUID}]
     [["Rasta Toucan" (ObjectId. "012345678901234567890123") "11111111-1111-1111-1111-111111111111"]
      ["Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef") "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]
      ["Unlucky Raven" nil]]]])

(deftest bson-ids-test
  (mt/test-driver :mongo
    (mt/dataset with-bson-ids
      (testing "BSON IDs"
        (testing "Check that we support Mongo BSON ID and can filter by it (#1367)"
          (is (= [[2 "Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]
                 (rows (mt/run-mbql-query birds
                         {:filter [:= $bird_id "abcdefabcdefabcdefabcdef"]
                          :fields [$id $name $bird_id]})))))

        (testing "handle null ObjectId queries properly (#11134)"
          (is (= [[3 "Unlucky Raven" nil]]
                 (rows (mt/run-mbql-query birds
                         {:filter [:is-null $bird_id]
                          :fields [$id $name $bird_id]})))))

        (testing "treat null ObjectId as empty (#15801)"
          (is (= [[3 "Unlucky Raven" nil]]
                 (rows (mt/run-mbql-query birds
                        {:filter [:is-empty $bird_id]
                         :fields [$id $name $bird_id]})))))

        (testing "treat non-null ObjectId as not-empty (#15801)"
          (is (= [[1 "Rasta Toucan" (ObjectId. "012345678901234567890123")]
                  [2 "Lucky Pigeon" (ObjectId. "abcdefabcdefabcdefabcdef")]]
                 (rows (mt/run-mbql-query birds
                        {:filter [:not-empty $bird_id]
                         :fields [$id $name $bird_id]}))))))

      (testing "BSON UUIDs"
        (testing "Check that we support Mongo BSON UUID and can filter by it"
          (is (= [[2 "Lucky Pigeon" "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]]
                 (rows (mt/run-mbql-query birds
                         {:filter [:= $bird_uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]
                          :fields [$id $name $bird_uuid]})))))

        (testing "handle null UUID queries properly"
          (is (= [[3 "Unlucky Raven" nil]]
                 (rows (mt/run-mbql-query birds
                         {:filter [:is-null $bird_uuid]
                          :fields [$id $name $bird_uuid]})))))


        (testing "treat null UUID as empty"
          (is (= [[3 "Unlucky Raven" nil]]
                 (rows (mt/run-mbql-query birds
                         {:filter [:is-empty $bird_uuid]
                          :fields [$id $name $bird_uuid]}))))))

      (testing "treat non-null UUID as not-empty"
        (is (= [[1 "Rasta Toucan" "11111111-1111-1111-1111-111111111111"]
                [2 "Lucky Pigeon" "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]]
               (rows (mt/run-mbql-query birds
                         {:filter [:not-empty $bird_uuid]
                          :fields [$id $name $bird_uuid]}))))))))


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
      (is (empty?
           (mbql.u/match-one (->> (magic/automagic-analysis (db/select-one Field :id (mt/id :venues :price)) {})
                                  :ordered_cards
                                  (mapcat (comp :breakout :query :dataset_query :card)))
             [:field _ (_ :guard :binning)]))))))

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
                    {:order-by [[:asc $id]]
                     :limit    3})
                  qp.test/data
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

(defn- create-database-from-row-maps! [database-name collection-name row-maps]
  (or (db/select-one Database :engine "mongo", :name database-name)
      (let [dbdef {:database-name database-name}]
        ;; destroy Mongo database if it already exists.
        (tx/destroy-db! :mongo dbdef)
        (let [details (tx/dbdef->connection-details :mongo :db dbdef)]
          ;; load rows
          (mongo.util/with-mongo-connection [conn details]
            (doseq [[i row] (map-indexed vector row-maps)
                    :let    [row (assoc row :_id (inc i))]]
              (try
                (mcoll/insert conn collection-name row)
                (catch Throwable e
                  (throw (ex-info (format "Error inserting row: %s" (ex-message e))
                                  {:database database-name, :collection collection-name, :details details, :row row}
                                  e)))))
            (log/infof "Inserted %d rows into %s collection %s."
                       (count row-maps) (pr-str database-name) (pr-str collection-name)))
          ;; now sync the Database.
          (let [db (db/insert! Database {:name database-name, :engine "mongo", :details details})]
            (sync/sync-database! db)
            db)))))

(defn- json-from-file [^String filename]
  (with-open [rdr (java.io.FileReader. (java.io.File. filename))]
    (json/parse-stream rdr true)))

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
      (with-redefs [mg/command (constantly {"version" "4.0.28-23"
                                            "versionArray" [4 0 29 -100]})]
        (is (= {:version "4.0.28-23"
                :semantic-version [4 0 29]}
               (driver/dbms-version :mongo (mt/db))))))

    (testing "Any values after rubbish in versionArray are ignored"
      (with-redefs [mg/command (constantly {"version" "4.0.28-23"
                                            "versionArray" [4 0 "NaN" 29]})]
        (is (= {:version "4.0.28-23"
                :semantic-version [4 0]}
               (driver/dbms-version :mongo (mt/db))))))))
