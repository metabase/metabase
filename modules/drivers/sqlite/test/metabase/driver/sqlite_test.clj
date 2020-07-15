(ns metabase.driver.sqlite-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]
             [sync :as sync]
             [test :as mt]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]))

(deftest timezone-id-test
  (mt/test-driver :sqlite
    (is (= "UTC"
           (tu/db-timezone-id)))))

(deftest filter-by-date-test
  "Make sure filtering against a LocalDate works correctly in SQLite"
  (mt/test-driver :sqlite
    (is (= [[225 "2014-03-04T00:00:00Z"]
            [409 "2014-03-05T00:00:00Z"]
            [917 "2014-03-05T00:00:00Z"]
            [995 "2014-03-05T00:00:00Z"]
            [159 "2014-03-06T00:00:00Z"]
            [951 "2014-03-06T00:00:00Z"]]
           (qp.test/rows
             (data/run-mbql-query checkins
               {:fields   [$id $date]
                :filter   [:and
                           [:>= $date "2014-03-04"]
                           [:<= $date "2014-03-06"]]
                :order-by [[:asc $date]]}))
           (qp.test/rows
             (data/run-mbql-query checkins
               {:fields   [$id $date]
                :filter   [:between $date "2014-03-04" "2014-03-07"]
                :order-by [[:asc $date]]}))))))

(defn- default-table-result [table-name]
  {:name table-name
   :schema nil
   :description nil})

(deftest timestamp-test-db
  (let [driver :sqlite]
    (mt/test-driver driver
      (let [db-name "timestamp_test"
            details (mt/dbdef->connection-details :sqlite :db {:database-name db-name})]
        (doseq [stmt ["DROP TABLE IF EXISTS timestamp_table;"
                      "CREATE TABLE timestamp_table (created_at timestamp);"
                      "INSERT INTO timestamp_table (created_at) VALUES (datetime('now'));"]]
          (jdbc/execute! (sql-jdbc.conn/connection-details->spec driver details)
                         [stmt]))
        (mt/with-temp Database [db {:engine driver :details (assoc details :dbname db-name)}]
          (sync/sync-database! db)
          (mt/with-db db
            (testing "timestamp columns"
              (testing "database should be synced"
                (is (= {:tables (set (map default-table-result ["timestamp_table"]))}
                       (driver/describe-database driver db))))

              (testing "timestamp column should exist"
                (is (= {:name "timestamp_table"
                        :schema nil
                        :fields #{{:name "created_at"
                                   :database-type "TIMESTAMP"
                                   :base-type :type/DateTime
                                   :database-position 0}}}
                       (driver/describe-table driver db (Table (mt/id :timestamp_table)))))))))))))
