(ns metabase-enterprise.database-routing.middleware-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.middleware :as routing.middleware]
   [metabase.test :as mt]))

(deftest attach-destination-db-middleware-scrubs-client-supplied-destination-test
  (testing "a client-supplied :destination-database/id never survives preprocessing"
    (mt/with-temp [:model/Database {db-id :id} {}]
      (mt/with-metadata-provider db-id
        (let [query {:database db-id, :type :query, :query {}, :destination-database/id 99999}]
          (is (not (contains? (routing.middleware/attach-destination-db-middleware query)
                              :destination-database/id))))))))

(deftest attach-destination-db-middleware-rejects-direct-destination-access-test
  (testing "direct destination-database access is rejected"
    (mt/with-temp [:model/Database {router-id :id} {}
                   :model/Database {destination-id :id} {:router_database_id router-id}]
      (mt/with-metadata-provider destination-id
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"(?i)cannot query a destination database directly"
             (routing.middleware/attach-destination-db-middleware
              {:database destination-id, :type :query, :query {}})))))))
