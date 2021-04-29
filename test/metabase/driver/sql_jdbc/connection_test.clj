(ns metabase.driver.sql-jdbc.connection-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
            [metabase.driver.util :as driver.u]
            [metabase.models.database :refer [Database]]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.util :as u]))

(deftest can-connect-with-details?-test
  (is (= true
         (driver.u/can-connect-with-details? :h2 (:details (data/db)))))
  (testing "Lie and say Test DB is Postgres. CAN-CONNECT? should fail"
    (is (= false
           (driver.u/can-connect-with-details? :postgres (:details (data/db))))))
  (testing "Random made-up DBs should fail"
    (is (= false
           (driver.u/can-connect-with-details? :postgres {:host   "localhost"
                                                          :port   5432
                                                          :dbname "ABCDEFGHIJKLMNOP"
                                                          :user   "rasta"}))))
  (testing "Things that you can connect to, but are not DBs, should fail"
    (is (= false
           (driver.u/can-connect-with-details? :postgres {:host "google.com", :port 80})))))

(deftest db->pooled-connection-spec-test
  (mt/test-driver :h2
    (testing "creating and removing specs works"
      ;; need to create a new, nonexistent h2 db
      (let [destroyed?         (atom false)
            original-destroy   @#'sql-jdbc.conn/destroy-pool!
            connection-details {:db "mem:connection_test"}
            spec               (db.spec/h2 connection-details)]
        (with-redefs [sql-jdbc.conn/destroy-pool! (fn [id destroyed-spec]
                                                    (original-destroy id destroyed-spec)
                                                    (reset! destroyed? true))]
          (jdbc/with-db-connection [conn spec]
            (jdbc/execute! spec ["CREATE TABLE birds (name varchar)"])
            (jdbc/execute! spec ["INSERT INTO birds values ('rasta'),('lucky')"])
            (mt/with-temp Database [database {:engine :h2, :details connection-details}]
              (testing "database id is not in our connection map initially"
                ;; deref'ing a var to get the atom. looks weird
                (is (not (contains? @@#'sql-jdbc.conn/database-id->connection-pool
                                    (u/id database)))))
              (testing "when getting a pooled connection it is now in our connection map"
                (let [stored-spec (sql-jdbc.conn/db->pooled-connection-spec database)
                      birds       (jdbc/query stored-spec ["SELECT * FROM birds"])]
                  (is (seq birds))
                  (is (contains? @@#'sql-jdbc.conn/database-id->connection-pool
                                 (u/id database)))))
              (testing "and is no longer in our connection map after cleanup"
                (#'sql-jdbc.conn/set-pool! (u/id database) nil)
                (is (not (contains? @@#'sql-jdbc.conn/database-id->connection-pool
                                    (u/id database)))))
              (testing "the pool has been destroyed"
                (is @destroyed?)))))))))

(deftest c3p0-datasource-name-test
  (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
    (testing "The dataSourceName c3p0 property is set properly for a database"
      (let [db       (mt/db)
            props    (sql-jdbc.conn/data-warehouse-connection-pool-properties driver/*driver* db)
            expected (format "db-%d-%s-%s" (u/the-id db) (name driver/*driver*) (-> db :details :db))]
        (is (= expected
               (get props "dataSourceName")))))))
