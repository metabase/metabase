(ns ^:mb/driver-tests metabase.driver.clickhouse-impersonation-test
  "SET ROLE (connection impersonation feature) tests with single node or on-premise cluster setups."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.tu]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.query-processor.store :as qp.store]
   [metabase.sync.core :as sync.core]
   [metabase.test :as mt]
   [metabase.test.data.clickhouse :as ctd]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import [java.sql SQLException]))

(set! *warn-on-reflection* true)

(defn- set-role-test!
  [details-map]
  (let [default-role (driver.sql/default-database-role :clickhouse nil)
        spec         (sql-jdbc.conn/connection-details->spec :clickhouse details-map)]
    (testing "default role is NONE"
      (is (= "NONE" default-role)))
    (testing "does not throw with an existing role"
      (sql-jdbc.execute/do-with-connection-with-options
       :clickhouse spec nil
       (fn [^java.sql.Connection conn]
         (driver/set-role! :clickhouse conn "metabase_test_role")))
      (is true))
    (testing "does not throw with a role containing hyphens"
      (sql-jdbc.execute/do-with-connection-with-options
       :clickhouse spec nil
       (fn [^java.sql.Connection conn]
         (driver/set-role! :clickhouse conn "metabase-test-role")))
      (is true))
    (testing "does not throw with the default role"
      (sql-jdbc.execute/do-with-connection-with-options
       :clickhouse spec nil
       (fn [^java.sql.Connection conn]
         (driver/set-role! :clickhouse conn default-role)
         (fn [^java.sql.Connection conn]
           (driver/set-role! :clickhouse conn default-role)
           (with-open [stmt (.prepareStatement conn "SELECT * FROM `metabase_test_role_db`.`some_table` ORDER BY i ASC;")
                       rset (.executeQuery stmt)]
             (is (.next rset) true)
             (is (.getInt rset 1) 42)
             (is (.next rset) true)
             (is (.getInt rset 1) 144)
             (is (.next rset) false)))))
      (is true))))

(defn- set-role-throws-test!
  [details-map]
  (testing "throws when assigning a non-existent role"
    (is (thrown-with-msg? SQLException #"There is no role `asdf` in user directories."
                          (sql-jdbc.execute/do-with-connection-with-options
                           :clickhouse (sql-jdbc.conn/connection-details->spec :clickhouse details-map) nil
                           (fn [^java.sql.Connection conn]
                             (driver/set-role! :clickhouse conn "asdf")))))))

(defn- do-with-new-metadata-provider
  [details thunk]
  (t2.with-temp/with-temp
    [:model/Database db {:engine :clickhouse :details details}]
    (qp.store/with-metadata-provider (u/the-id db) (thunk db))))

(deftest clickhouse-set-role
  (mt/test-driver :clickhouse
    (let [user-details                   {:user "metabase_test_user"}
          ;; See docker-compose.yml for the port mappings
          ;; 24.4+
          single-node-port-details       {:port (mt/db-test-env-var :clickhouse :port)}
          single-node-details            (merge user-details single-node-port-details)
          cluster-port-details           {:port (mt/db-test-env-var :clickhouse :nginx-port)}
          cluster-details                (merge user-details cluster-port-details)]
      (testing "single node"
        (testing "should support the impersonation feature"
          (is (true? (driver/database-supports? :clickhouse :connection-impersonation (mt/db)))))
        (let [statements ["CREATE DATABASE IF NOT EXISTS `metabase_test_role_db`;"
                          "CREATE OR REPLACE TABLE `metabase_test_role_db`.`some_table` (i Int32) ENGINE = MergeTree ORDER BY (i);"
                          "INSERT INTO `metabase_test_role_db`.`some_table` VALUES (42), (144);"
                          "CREATE ROLE IF NOT EXISTS `metabase_test_role`;"
                          "CREATE ROLE IF NOT EXISTS `metabase-test-role`;"
                          "CREATE USER IF NOT EXISTS `metabase_test_user` NOT IDENTIFIED;"
                          "GRANT SELECT ON `metabase_test_role_db`.* TO `metabase_test_role`,`metabase-test-role`;"
                          "GRANT `metabase_test_role`, `metabase-test-role` TO `metabase_test_user`;"]]
          (ctd/exec-statements statements single-node-port-details)
          (do-with-new-metadata-provider
           single-node-details
           (fn [_db]
             (set-role-test!        single-node-details)
             (set-role-throws-test! single-node-details)))))
      (testing "on-premise cluster"
        (testing "should support the impersonation feature"
          (t2.with-temp/with-temp
            [:model/Database db {:engine :clickhouse :details {:user "default" :port (mt/db-test-env-var :clickhouse :nginx-port)}}]
            (is (true? (driver/database-supports? :clickhouse :connection-impersonation db)))))
        (let [statements ["CREATE DATABASE IF NOT EXISTS `metabase_test_role_db` ON CLUSTER '{cluster}';"
                          "CREATE OR REPLACE TABLE `metabase_test_role_db`.`some_table` ON CLUSTER '{cluster}' (i Int32)
                          ENGINE ReplicatedMergeTree('/clickhouse/{cluster}/tables/{database}/{table}/{shard}', '{replica}')
                          ORDER BY (i);"
                          "INSERT INTO `metabase_test_role_db`.`some_table` VALUES (42), (144);"
                          "CREATE ROLE IF NOT EXISTS `metabase_test_role` ON CLUSTER '{cluster}';"
                          "CREATE ROLE IF NOT EXISTS `metabase-test-role` ON CLUSTER '{cluster}';"
                          "CREATE USER IF NOT EXISTS `metabase_test_user` ON CLUSTER '{cluster}' NOT IDENTIFIED;"
                          "GRANT ON CLUSTER '{cluster}' SELECT ON `metabase_test_role_db`.* TO `metabase_test_role`, `metabase-test-role`;"
                          "GRANT ON CLUSTER '{cluster}' `metabase_test_role`, `metabase-test-role` TO `metabase_test_user`;"]]
          (ctd/exec-statements statements cluster-port-details)
          (do-with-new-metadata-provider
           cluster-details
           (fn [_db]
             (set-role-test!        cluster-details)
             (set-role-throws-test! cluster-details)))))
      (testing "older ClickHouse version" ;; 23.3
        (testing "should NOT support the impersonation feature"
          (t2.with-temp/with-temp
            [:model/Database db {:engine :clickhouse :details {:user "default" :port (mt/db-test-env-var :clickhouse :old-port)}}]
            (is (false? (driver/database-supports? :clickhouse :connection-impersonation db)))))))))

(deftest conn-impersonation-test-clickhouse
  (mt/test-driver :clickhouse
    (mt/with-premium-features #{:advanced-permissions}
      (let [table-name       (str "metabase_impersonation_test.test_" (System/currentTimeMillis))
            select-query     (format "SELECT * FROM %s;" table-name)
            cluster-port     {:port (mt/db-test-env-var :clickhouse :nginx-port)}
            cluster-details  {:engine :clickhouse
                              :details {:user   "metabase_impersonation_test_user"
                                        :dbname "metabase_impersonation_test"
                                        :port   (mt/db-test-env-var :clickhouse :nginx-port)}}
            ddl-statements   ["CREATE DATABASE IF NOT EXISTS metabase_impersonation_test ON CLUSTER '{cluster}';"
                              (format "CREATE TABLE %s ON CLUSTER '{cluster}' (s String)
                                      ENGINE ReplicatedMergeTree('/clickhouse/{cluster}/tables/{database}/{table}/{shard}', '{replica}')
                                      ORDER BY (s);" table-name)]
            insert-statements [(format "INSERT INTO %s VALUES ('a'), ('b'), ('c');" table-name)]
            grant-statements  ["CREATE USER IF NOT EXISTS metabase_impersonation_test_user ON CLUSTER '{cluster}' NOT IDENTIFIED;"
                               "CREATE ROLE IF NOT EXISTS row_a ON CLUSTER '{cluster}';"
                               "CREATE ROLE IF NOT EXISTS row_b ON CLUSTER '{cluster}';"
                               "CREATE ROLE IF NOT EXISTS row_c ON CLUSTER '{cluster}';"
                               "GRANT ON CLUSTER '{cluster}' row_a, row_b, row_c TO metabase_impersonation_test_user;"
                               (format "GRANT ON CLUSTER '{cluster}' SELECT ON %s TO metabase_impersonation_test_user;" table-name)
                               (format "CREATE ROW POLICY OR REPLACE policy_row_a ON CLUSTER '{cluster}'
                                       ON %s FOR SELECT USING s = 'a' TO row_a;" table-name)
                               (format "CREATE ROW POLICY OR REPLACE policy_row_b ON CLUSTER '{cluster}'
                                       ON %s FOR SELECT USING s = 'b' TO row_b;" table-name)
                               (format "CREATE ROW POLICY OR REPLACE policy_row_c ON CLUSTER '{cluster}'
                                       ON %s FOR SELECT USING s = 'c' TO row_c;" table-name)]]
        (ctd/exec-statements ddl-statements    cluster-port {"wait_end_of_query" "1"})
        (ctd/exec-statements insert-statements cluster-port {"wait_end_of_query" "1"
                                                             "insert_quorum" "2"})
        (ctd/exec-statements grant-statements  cluster-port {"wait_end_of_query" "1"})
        (t2.with-temp/with-temp [:model/Database db cluster-details]
          (mt/with-db db (sync.core/sync-database! db)

            (letfn [(check-impersonation! [roles expected]
                      (impersonation.tu/with-impersonations!
                        {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                         :attributes     {"impersonation_attr" roles}}
                        (is (= expected
                               (-> {:query select-query}
                                   mt/native-query
                                   mt/process-query
                                   mt/rows)))))]

              (is (= [["a"] ["b"] ["c"]]
                     (-> {:query select-query}
                         mt/native-query
                         mt/process-query
                         mt/rows)))

              (check-impersonation! "row_a" [["a"]])
              (check-impersonation! "row_b" [["b"]])
              (check-impersonation! "row_c" [["c"]])
              (check-impersonation! "row_a,row_c" [["a"] ["c"]])
              (check-impersonation! "row_b,row_c" [["b"] ["c"]])
              (check-impersonation! "row_a,row_b,row_c" [["a"] ["b"] ["c"]]))))))))
