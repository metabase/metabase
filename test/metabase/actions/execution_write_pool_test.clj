(ns ^:mb/driver-tests metabase.actions.execution-write-pool-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.execution :as actions.execution]
   [metabase.actions.models :as action]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

(deftest query-action-creates-write-pool-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc, :+features [:actions/custom]})
    (mt/with-actions-test-data-and-actions-enabled
      (let [db-id           (mt/id)
            write-cache-key [db-id :write-data]]
        (with-redefs [driver.conn/effective-connection-type
                      (fn [_database]
                        (if (= driver.conn/*connection-type* :write-data)
                          :write-data
                          :default))]
          (try
            (sql-jdbc.conn/invalidate-pool-for-db! (mt/db))
            (testing "write pool does not exist before query action execution"
              (is (not (contains? @@#'sql-jdbc.conn/pool-cache-key->connection-pool write-cache-key))))
            (mt/with-test-user :crowberto
              (mt/with-actions [{_card-id :id} {:type :model :dataset_query (mt/mbql-query categories)}
                                {action-id :action-id} {:type :query}]
                (actions.execution/execute-action!
                 (action/select-action :id action-id)
                 {"id" 1})))
            (testing "write pool is created during query action execution"
              (is (contains? @@#'sql-jdbc.conn/pool-cache-key->connection-pool write-cache-key)))
            (finally
              (sql-jdbc.conn/invalidate-pool-for-db! (mt/db)))))))))
