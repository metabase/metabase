(ns metabase.driver.mongo.execute.simple-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.mongo.execute.session :as mongo.execute.session]
   [metabase.driver.mongo.execute.simple :as mongo.execute.simple]
   [metabase.query-processor :as qp]
   [metabase.test :as mt])
  (:import
   (java.util NoSuchElementException)))

(set! *warn-on-reflection* true)

(defn- make-mongo-cursor [rows]
  (let [counter (volatile! 0)]
    (reify com.mongodb.Cursor
      (hasNext [_] (< @counter (count rows)))
      (next [_] (let [i @counter]
                  (vswap! counter inc)
                  (if (< i (count rows))
                    (org.bson.BasicBSONObject. ^java.util.Map (get rows i))
                    (throw (NoSuchElementException. (str "no element at " i)))))))))

(deftest ^:parallel field-filter-relative-time-native-test
  (mt/test-driver
   :mongo
   (with-redefs [mongo.execute.session/start-session! 
                 (fn [_] (throw (com.mongodb.MongoClientException. "Sessions are not supported by the MongoDB...")))]
     (let [now (str (java.time.Instant/now))]
       (binding [mongo.execute.simple/*aggregate*
                 (fn [& _] (make-mongo-cursor [{"_id" 0
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
                    (mt/rows+column-names (qp/process-query query)))))))))))
