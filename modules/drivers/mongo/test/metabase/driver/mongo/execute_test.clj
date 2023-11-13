(ns metabase.driver.mongo.execute-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.driver.mongo.execute :as mongo.execute]
   [metabase.driver.mongo.util :as mongo.util]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [monger.conversion :as m.conversion]
   [monger.util :as m.util])
  (:import
   (com.mongodb MongoCommandException)
   (com.mongodb.client ClientSession MongoCollection MongoDatabase)
   (java.util NoSuchElementException)))

(set! *warn-on-reflection* true)

(defn- make-mongo-cursor [rows]
  (let [counter (volatile! 0)]
    (reify com.mongodb.client.MongoCursor
      (hasNext [_] (< @counter (count rows)))
      (next [_] (let [i @counter]
                  (vswap! counter inc)
                  (if (< i (count rows))
                    (org.bson.Document. ^java.util.Map (get rows i))
                    (throw (NoSuchElementException. (str "no element at " i))))))
      (close [_]))))

(defn- make-mongo-aggregate-iterable [rows]
  (reify com.mongodb.client.AggregateIterable
    (cursor [_] (make-mongo-cursor rows))))

(deftest ^:parallel field-filter-relative-time-native-test
  (mt/test-driver :mongo
    (let [now (str (java.time.Instant/now))]
      (binding [mongo.execute/*aggregate*
                (fn [& _] (make-mongo-aggregate-iterable
                           [{"_id" 0
                             "name" "Crowberto"
                             "alias" "the Brave"}
                            {"_id" 1
                             "name" "Rasta"
                             "last_login" now
                             "nickname" "Blue"}]))]
        (testing "Projected and first-row fields are returned"
          (let [query {:database (mt/id)
                       :native
                       {:collection "users"
                        :query "[{\"$match\": {\"id\": {\"$lt\": 42}}},
                                 {\"$project\": {\"name\": true, \"last_login\": 1}}]"}
                       :type "native"}]
            (is (= {:rows [[0 "Crowberto" nil "the Brave"]
                           [1 "Rasta"     now nil]]
                    :columns ["_id" "name" "last_login" "alias"]}
                   (mt/rows+column-names (qp/process-query query))))))
        (testing "Columns can be suppressed"
          (let [query {:database (mt/id)
                       :native
                       {:collection "users"
                        :query "[{\"$project\": {\"name\": 2, \"last_login\": 1,
                                  \"suppressed0\": 0, \"supressed-false\": false}},
                                 {\"$match\": {\"id\": {\"$lt\": 42}}}]"}
                       :type "native"}]
            (is (= {:rows [[0 "Crowberto" nil "the Brave"]
                           [1 "Rasta"     now nil]]
                    :columns ["_id" "name" "last_login" "alias"]}
                   (mt/rows+column-names (qp/process-query query))))))))))

(deftest kill-an-in-flight-query-method-validation-test
  (testing "Confirm that method used to kill in-flight queries on mongo works"
    (mt/with-driver :mongo
      (mt/dataset
       sample-dataset
       (let [;; Following query runs on my m2 ~ 10 seconds.
             pipeline-document-raw
             (m.util/into-array-list
              (m.conversion/to-db-object
               [{"$lookup"
                 {"from" "people",
                  "let" {"let_user_id_164439" "$user_id"},
                  "pipeline" [{"$match" {"$expr" {"$eq" ["$$let_user_id_164439" "$id"]}}}],
                  "as" "join_alias_People - User"}}
                {"$unwind" {"path" "$join_alias_People - User", "preserveNullAndEmptyArrays" true}}
                {"$group"
                 {"_id"
                  {"created_at"
                   {"$dateTrunc" {"date" "$created_at", "unit" "month", "timezone" "UTC", "startOfWeek" "sunday"}}},
                  "sum" {"$sum" "$total"}}}
                {"$sort" {"_id" 1}}
                {"$project" {"_id" false, "created_at" "$_id.created_at", "sum" true}}]))]
         (mongo.util/with-mongo-connection [connection (mt/id)]
           (let [client-database ^MongoDatabase (#'mongo.execute/connection->database connection)
                 collection ^MongoCollection (. client-database (getCollection "orders"))]
             (with-open [session ^ClientSession (#'mongo.execute/start-session! connection)]
               (let [aggregate (.aggregate collection session ^java.util.ArrayList pipeline-document-raw)
                     ;; Manually tested: if session is closed before aggregation execution takes place (call to 
                     ;; eg. either `.into` or `.cursor`) aggregation is then executed.
                     ;; TODO: Find workaround!
                     result-ch (a/thread (try (.into aggregate (java.util.ArrayList.))
                                              (catch MongoCommandException ex
                                                (if (#'mongo.execute/interrupt-ex? ex)
                                                  :interrupted
                                                  :unrecognized-failure))))]
                 (future (Thread/sleep 100)
                         (#'mongo.execute/kill-session! client-database session))
                 ;; Using 15k timeout to handle unforseen circumstances.
                 (let [result (a/alt!! (a/timeout 15000) :timeout
                                       result-ch ([v] v))]
                   (is (= :interrupted result))))))))))))
