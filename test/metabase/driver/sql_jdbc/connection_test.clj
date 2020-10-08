(ns metabase.driver.sql-jdbc.connection-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase
             [db :as mdb]
             [test :as mt]
             [util :as u]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.util :as driver.u]
            [metabase.models.database :refer [Database]]
            [metabase.test.data :as data]
            [metabase.test.util.log :as tu.log]))

;; ## TESTS FOR CAN-CONNECT?

;; Check that we can connect to the Test DB
(expect
  true
  (driver.u/can-connect-with-details? :h2 (:details (data/db))))

;; Lie and say Test DB is Postgres. CAN-CONNECT? should fail
(expect
  false
  (tu.log/suppress-output
    (driver.u/can-connect-with-details? :postgres (:details (data/db)))))

;; Random made-up DBs should fail
(expect
  false
  (tu.log/suppress-output
    (driver.u/can-connect-with-details? :postgres {:host "localhost", :port 5432, :dbname "ABCDEFGHIJKLMNOP", :user "rasta"})))

;; Things that you can connect to, but are not DBs, should fail
(expect
  false
  (tu.log/suppress-output
    (driver.u/can-connect-with-details? :postgres {:host "google.com", :port 80})))

(deftest db->pooled-connection-spec-test
  (mt/test-driver :h2
    (testing "creating and removing specs works"
      ;; need to create a new, nonexistent h2 db
      (binding [mdb/*allow-potentailly-unsafe-connections* true]
        (let [destroyed?       (atom false)
              original-destroy @#'sql-jdbc.conn/destroy-pool!
              spec             (sql-jdbc.conn/connection-details->spec
                                   :h2
                                 (mt/dbdef->connection-details :h2 :server {:database-name "connection_test"}))]
          (with-redefs [sql-jdbc.conn/destroy-pool! (fn [id destroyed-spec]
                                                      (original-destroy id destroyed-spec)
                                                      (reset! destroyed? true))]
            (jdbc/with-db-connection [conn spec]
              (jdbc/execute! spec ["CREATE TABLE birds (name varchar)"])
              (jdbc/execute! spec ["INSERT INTO birds values ('rasta'),('lucky')"])
              (mt/with-temp Database [database {:engine :h2 :details spec}]
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
                  (is @destroyed?))))))))))
