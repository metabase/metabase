(ns metabase.driver.vertica-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.models.database :refer [Database]]
            [metabase.test :as mt]
            [metabase.test.data
             [datasets :refer [expect-with-driver]]
             [interface :as tx]]
            [metabase.test.util :as tu]))

(deftest db-timezone-test
  (mt/test-driver :vertica
    (is (= "UTC" (tu/db-timezone-id)))))

(deftest additional-connection-string-options-test
  (mt/test-driver :vertica
    (testing "Make sure you can add additional connection string options (#6651)"
      (is (= {:classname   "com.vertica.jdbc.Driver"
              :subprotocol "vertica"
              :subname     "//localhost:5433/birds-near-me?ConnectionLoadBalance=1"}
             (sql-jdbc.conn/connection-details->spec :vertica {:host               "localhost"
                                                               :port               5433
                                                               :db                 "birds-near-me"
                                                               :additional-options "ConnectionLoadBalance=1"}))))))

(deftest determine-select-privilege
  (mt/test-driver :vertica
    (testing "Do we correctly determine SELECT privilege"
      (let [db-name "privilege_test"
            spec    (sql-jdbc.conn/connection-details->spec :vertica (tx/dbdef->connection-details :vertica :server nil))]
        (doseq [statement [(format "DROP DATABASE IF EXISTS %s;" db-name)
                           (format "CREATE DATABASE %s;" db-name)]]
          (jdbc/execute! spec [statement] {:transaction? false}))
        (let [details (mt/dbdef->connection-details :vertica :db {:database-name db-name})
              spec    (sql-jdbc.conn/connection-details->spec :vertica details)]
          (mt/with-temp Database [db {:engine  :vertica
                                      :details details}]
            (doseq [statement ["create user if not exists GUEST;"
                               "drop table if exists `birds`;"
                               "create table `birds` ();"
                               "grant all on `birds` to GUEST;"]]
              (jdbc/execute! spec [statement]))
            (is (= #{{:table_name "birds" :table_schem nil}}
                   (sql-jdbc.sync/accessible-tables-for-user :vertica db "GUEST")))
            (jdbc/execute! spec ["revoke all on `birds` from GUEST;"])
            (is (empty? (sql-jdbc.sync/accessible-tables-for-user :vertica db "GUEST")))))))))
