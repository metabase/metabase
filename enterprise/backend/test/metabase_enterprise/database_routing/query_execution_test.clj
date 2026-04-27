(ns ^:mb/driver-tests metabase-enterprise.database-routing.query-execution-test
  "Integration tests that verify `is_db_routed` is recorded on `:model/QueryExecution` rows when a query is routed
  to a destination database via DB routing. Drives a full userland query through the QP and inspects the persisted
  row."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.database-routing.e2e-test :as e2e]
   [metabase-enterprise.test :as met]
   [metabase.driver.settings :as driver.settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- latest-query-execution []
  (t2/select-one :model/QueryExecution {:order-by [[:id :desc]]}))

(deftest is-db-routed-true-when-routed-to-destination-test
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true
              qp.util/*execute-async?* false]
      (met/with-user-attributes! :rasta {"db_name" "destination-db"}
        (e2e/with-temp-dbs! [router-db destination-db]
          (t2/update! :model/Database (u/the-id destination-db)
                      {:name "destination-db" :router_database_id (u/the-id router-db)})
          (sync/sync-database! router-db)
          (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                  :user_attribute "db_name"}]
            (e2e/execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('hi')")
            (mt/with-model-cleanup [:model/QueryExecution]
              (mt/with-test-user :rasta
                (qp/process-query
                 (qp/userland-query
                  {:database (u/the-id router-db)
                   :type     :query
                   :query    {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}}
                  {:context :question})))
              (let [qe (latest-query-execution)]
                (is (true? (:is_db_routed qe))
                    "QueryExecution.is_db_routed should be true when query was routed to a destination DB")
                (is (= (u/the-id destination-db) (:database_id qe))
                    "QueryExecution.database_id should be the destination DB id, not the router DB id")))))))))

(deftest is-db-routed-false-without-routing-test
  (mt/with-model-cleanup [:model/QueryExecution]
    (binding [qp.util/*execute-async?* false]
      (mt/with-test-user :rasta
        (qp/process-query (qp/userland-query (mt/mbql-query venues {:limit 1}) {:context :question}))
        (is (false? (:is_db_routed (latest-query-execution))))))))
