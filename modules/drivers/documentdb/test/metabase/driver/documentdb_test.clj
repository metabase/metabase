(ns ^:mb/driver-tests metabase.driver.documentdb-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.documentdb :as documentdb]
   [metabase.driver.documentdb.connection :as documentdb.connection]
   [metabase.driver.documentdb.execute :as documentdb.execute]
   [metabase.driver.documentdb.query-processor :as documentdb.qp]
   [metabase.driver.settings :as driver.settings]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta])
  (:import
   (com.mongodb MongoCredential ServerAddress)
   (com.mongodb.client MongoCollection MongoDatabase)
   (java.nio ByteBuffer)
   (java.util Date UUID)
   (org.bson Document)
   (org.bson.types Binary Decimal128 ObjectId)))

(set! *warn-on-reflection* true)

(deftest ^:parallel connection-string-test
  (testing "DocumentDB Local defaults"
    (is (= (format "mongodb://localhost:10260/?connectTimeoutMS=%d&serverSelectionTimeoutMS=%d&tls=true"
                   (driver.settings/db-connection-timeout-ms)
                   (driver.settings/db-connection-timeout-ms))
           (documentdb.connection/details->connection-string {}))))
  (testing "host settings can disable TLS and add supported URI options"
    (is (str/ends-with? (documentdb.connection/details->connection-string
                         {:host "documentdb.internal"
                          :port 27017
                          :ssl false
                          :additional-options "retryWrites=false&directConnection=true"})
                        "tls=false&retryWrites=false&directConnection=true")))
  (testing "a supplied URI is not rewritten"
    (let [uri "mongodb://bird:secret@example.test:10260/aviary?tls=true"]
      (is (= uri (documentdb.connection/details->connection-string {:use-conn-uri true :conn-uri uri}))))))

(deftest ^:parallel client-settings-test
  (let [settings (documentdb.connection/details->client-settings
                  {:host "localhost" :port 10260 :user "bird" :pass "secret" :authdb "admin"})
        ^MongoCredential credential (.getCredential settings)
        ^ServerAddress address (-> settings .getClusterSettings .getHosts first)]
    (is (= "localhost" (.getHost address)))
    (is (= 10260 (.getPort address)))
    (is (= "SCRAM-SHA-256" (.getMechanism credential)))
    (is (= "bird" (.getUserName credential)))
    (is (= "secret" (str/join (.getPassword credential))))
    (is (= "admin" (.getSource credential)))
    (is (true? (-> settings .getSslSettings .isEnabled)))))

(deftest ^:parallel missing-password-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"password is required"
                        (documentdb.connection/details->client-settings {:user "bird"}))))

(deftest ^:parallel uri-database-name-test
  (is (= "aviary"
         (documentdb.connection/database-name
          {:use-conn-uri true :conn-uri "mongodb://localhost:10260/aviary?tls=true"})))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"No database name"
                        (documentdb.connection/database-name
                         {:use-conn-uri true :conn-uri "mongodb://localhost:10260/?tls=true"}))))

(deftest ^:parallel inferred-fields-test
  (let [object-id (ObjectId.)
        fields (#'documentdb/inferred-fields
                [(Document. {"_id" object-id
                             "name" "Heron"
                             "observed_at" (Date.)
                             "location" (Document. {"latitude" 51.5})})]
                [])
        fields-by-name (into {} (map (juxt :name identity)) fields)]
    (is (= :type/MongoBSONID (get-in fields-by-name ["_id" :base-type])))
    (is (true? (get-in fields-by-name ["_id" :pk?])))
    (is (= :type/Text (get-in fields-by-name ["name" :base-type])))
    (is (= :type/Instant (get-in fields-by-name ["observed_at" :base-type])))
    (is (= #{["location" "latitude"]}
           (into #{} (map :nfc-path) (get-in fields-by-name ["location" :nested-fields]))))))

(deftest ^:parallel mixed-and-null-field-inference-test
  (let [fields (#'documentdb/inferred-fields
                [(Document. {"sometimes" nil "mixed" 1})
                 (Document. {"sometimes" nil "mixed" "one"})]
                [])
        fields-by-name (into {} (map (juxt :name identity)) fields)]
    (is (= {:database-type "null" :base-type :type/*}
           (select-keys (fields-by-name "sometimes") [:database-type :base-type])))
    (is (= {:database-type "mixed" :base-type :type/*}
           (select-keys (fields-by-name "mixed") [:database-type :base-type])))))

(deftest ^:parallel bson-conversion-test
  (let [object-id (ObjectId.)
        uuid      (random-uuid)
        bytes     (-> (ByteBuffer/allocate 16)
                      (.putLong (.getMostSignificantBits ^UUID uuid))
                      (.putLong (.getLeastSignificantBits ^UUID uuid))
                      .array)]
    (is (= (.toHexString object-id) (#'documentdb.execute/from-bson object-id)))
    (is (= 12.5M (#'documentdb.execute/from-bson (Decimal128. 12.5M))))
    (is (= uuid (#'documentdb.execute/from-bson (Binary. (byte 4) bytes))))
    (is (= {"bird" [(.toHexString object-id)]}
           (#'documentdb.execute/from-bson (Document. {"bird" [object-id]}))))))

(defn- compile-query
  [inner-query]
  (driver/with-driver :documentdb
    (documentdb.qp/mbql->native
     (lib/query meta/metadata-provider
                {:database (meta/id)
                 :type :query
                 :query inner-query}))))

(deftest ^:parallel structured-fields-query-test
  (let [compiled (compile-query {:source-table (meta/id :venues)
                                 :fields [[:field (meta/id :venues :name) nil]]
                                 :filter [:> [:field (meta/id :venues :price) nil] 2]
                                 :order-by [[:asc [:field (meta/id :venues :name) nil]]]
                                 :limit 10})]
    (is (= "VENUES" (:collection compiled)))
    (is (= ["NAME"] (:projections compiled)))
    (is (= [{"$match" {"PRICE" {"$gt" 2}}}
            {"$project" {"_id" false "NAME" "$NAME"}}
            {"$sort" {"NAME" 1}}
            {"$limit" 10}]
           (:query compiled)))))

(deftest ^:parallel structured-aggregation-query-test
  (let [compiled (compile-query {:source-table (meta/id :venues)
                                 :aggregation [[:count]
                                               [:distinct [:field (meta/id :venues :name) nil]]]
                                 :breakout [[:field (meta/id :venues :category-id) nil]]})]
    (is (= ["CATEGORY_ID" "count" "count_2"] (:projections compiled)))
    (is (= {"_id" {"CATEGORY_ID" "$CATEGORY_ID"}
            "count" {"$sum" 1}
            "count_2" {"$addToSet" "$NAME"}}
           (get-in compiled [:query 0 "$group"])))
    (is (= {"_id" false
            "CATEGORY_ID" "$_id.CATEGORY_ID"
            "count" true
            "count_2" {"$size" "$count_2"}}
           (get-in compiled [:query 1 "$project"])))))

(deftest live-documentdb-test
  (if-let [connection-uri (System/getenv "MB_DOCUMENTDB_TEST_URI")]
    (let [details         {:use-conn-uri true, :conn-uri connection-uri}
          collection-name (str "metabase_e2e_" (random-uuid))]
      (is (driver/can-connect? :documentdb details))
      (documentdb.connection/do-with-database
       (fn [^MongoDatabase database]
         (let [^MongoCollection collection (.getCollection database collection-name)]
           (try
             (.insertMany collection
                          (java.util.List/of
                           (Document. {"name" "Heron", "count" 2})
                           (Document. {"name" "Egret", "count" 5})))
             (is (contains? (into #{} (map :name) (:tables (driver/describe-database :documentdb details)))
                            collection-name))
             (let [fields (driver/describe-table :documentdb details {:name collection-name})]
               (is (= #{"_id" "name" "count"} (into #{} (map :name) (:fields fields)))))
             (with-redefs [driver-api/metadata-provider (constantly nil)
                           driver-api/database          (constantly details)]
               (let [result (promise)]
                 (documentdb.execute/execute-reducible-query
                  {:native {:collection  collection-name
                            :projections ["name" "count"]
                            :query       [{"$match" {"count" {"$gt" 2}}}
                                          {"$project" {"_id" false, "name" true, "count" true}}]}}
                  (fn [metadata rows]
                    (deliver result [metadata (into [] rows)])))
                 (is (= [{:name "name"} {:name "count"}] (get-in @result [0 :cols])))
                 (is (= [["Egret" 5]] (second @result)))))
             (finally
               (.drop collection)))))
       details))
    (is true "Set MB_DOCUMENTDB_TEST_URI to run the live DocumentDB integration test.")))

(deftest ^:parallel feature-claims-test
  (is (true? (driver/database-supports? :documentdb :nested-fields nil)))
  (is (true? (driver/database-supports? :documentdb :native-requires-specified-collection nil)))
  (is (true? (driver/database-supports? :documentdb :basic-aggregations nil)))
  (is (false? (driver/database-supports? :documentdb :native-parameters nil))))
