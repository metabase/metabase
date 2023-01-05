(ns metabase.driver.mongo.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.mongo.execute :as mongo.execute]
   [metabase.query-processor :as qp]
   [metabase.test :as mt])
  (:import
   (java.util NoSuchElementException)))

(defn- make-mongo-cursor [rows]
  (let [counter (volatile! 0)]
    (reify com.mongodb.Cursor
      (hasNext [_] (< @counter (count rows)))
      (next [_] (let [i @counter]
                  (vswap! counter inc)
                  (if (< i (count rows))
                    (org.bson.BasicBSONObject. (get rows i))
                    (throw (NoSuchElementException. (str "no element at " i)))))))))

(deftest field-filter-relative-time-native-test
  (mt/test-driver :mongo
    (let [now (java.time.Instant/now)]
      (with-redefs [mongo.execute/aggregate
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
            (is (= [["Crowberto" nil       0  "the Brave"]
                    ["Rasta"     (str now) 1  nil]]
                   (mt/rows (qp/process-query query))))))

        (testing "columns can be suppressed"
          (let [query {:database (mt/id)
                       :native
                       {:collection "users"
                        :query "[{\"$project\": {\"name\": 2, \"last_login\": 1,
                                  \"suppressed0\": 0, \"supressed-false\": false}},
                                 {\"$match\": {\"id\": {\"$lt\": 42}}}]"}
                       :type "native"}]
            (is (= [["Crowberto" nil       0 "the Brave"]
                    ["Rasta"     (str now) 1 nil]]
                   (mt/rows (qp/process-query query))))))))))
