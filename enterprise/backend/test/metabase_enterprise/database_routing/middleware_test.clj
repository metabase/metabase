(ns metabase-enterprise.database-routing.middleware-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.middleware :as routing.middleware]
   [metabase.query-processor.interface :as qp.i]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest attach-destination-db-middleware-respects-skip-app-db-access-test
  (testing "no app-db access, and no destination rejection, when *skip-middleware-because-app-db-access* is bound true"
    (mt/with-temp [:model/Database {router-id :id} {}
                   :model/Database {destination-id :id} {:router_database_id router-id}]
      (mt/with-metadata-provider destination-id
        (binding [qp.i/*skip-middleware-because-app-db-access* true]
          (let [query {:database destination-id, :type :query, :query {}}]
            ;; the first invocation warms the metadata provider's Database cache, so the second
            ;; measures the middleware alone
            (routing.middleware/attach-destination-db-middleware query)
            (t2/with-call-count [call-count]
              (is (= query (routing.middleware/attach-destination-db-middleware query)))
              (is (zero? (call-count))))))))))

(deftest attach-destination-db-middleware-scrubs-client-supplied-destination-test
  (testing "a client-supplied :destination-database/id never survives preprocessing"
    (testing "for a plain un-routed database"
      (mt/with-temp [:model/Database {db-id :id} {}]
        (mt/with-metadata-provider db-id
          (let [query {:database db-id, :type :query, :query {}, :destination-database/id 99999}]
            (is (not (contains? (routing.middleware/attach-destination-db-middleware query)
                                :destination-database/id)))))))
    (testing "in skip-middleware contexts"
      (mt/with-temp [:model/Database {router-id :id} {}
                     :model/Database {destination-id :id} {:router_database_id router-id}]
        (mt/with-metadata-provider destination-id
          (binding [qp.i/*skip-middleware-because-app-db-access* true]
            (let [query {:database destination-id, :type :query, :query {}, :destination-database/id 99999}]
              (is (not (contains? (routing.middleware/attach-destination-db-middleware query)
                                  :destination-database/id))))))))))

(deftest attach-destination-db-middleware-rejects-direct-destination-access-test
  (testing "outside skip-middleware contexts, direct destination-database access is rejected"
    (mt/with-temp [:model/Database {router-id :id} {}
                   :model/Database {destination-id :id} {:router_database_id router-id}]
      (mt/with-metadata-provider destination-id
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"(?i)cannot query a destination database directly"
             (routing.middleware/attach-destination-db-middleware
              {:database destination-id, :type :query, :query {}})))))))
