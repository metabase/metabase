(ns metabase-enterprise.database-routing.writes-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.e2e-test :as e2e]
   [metabase-enterprise.test :as met]
   [metabase.app-db.core :as mdb]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- query-h2
  "Rows of `sql` run straight against the H2 file of `db`."
  [db sql]
  (sql-jdbc.execute/do-with-connection-with-options
   :h2 (mdb/spec :h2 (:details db)) {}
   (fn [^java.sql.Connection conn]
     (jdbc/query {:connection conn} [sql]))))

(defn- owner-of-row-1
  "The `owner` of row 1 of `acct` in the H2 file of `db`."
  [db]
  (:owner (first (query-h2 db "SELECT \"owner\" FROM \"acct\" WHERE \"id\" = 1"))))

(defn- set-owner-of-row-1!
  "Sets the `owner` of row 1 of `acct` through the connection that implicit actions open on `router-id`."
  [router-id owner]
  (sql-jdbc.actions/do-with-jdbc-transaction
   router-id
   (fn [^java.sql.Connection conn]
     (jdbc/execute! {:connection conn} ["UPDATE \"acct\" SET \"owner\" = ? WHERE \"id\" = 1" owner] {:transaction? false}))))

(deftest implicit-actions-write-to-the-destination-test
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes! :rasta {"db_name" "destination-db-1"}
        (e2e/with-routing-setup! [router-db [[dest-1 "destination-db-1"]]]
          (doseq [db [router-db dest-1]]
            (e2e/execute-statement! db "CREATE TABLE \"acct\" (\"id\" INT PRIMARY KEY, \"owner\" TEXT NOT NULL)")
            (e2e/execute-statement! db "GRANT ALL ON \"acct\" TO GUEST"))
          (e2e/execute-statement! router-db "INSERT INTO \"acct\" VALUES (1, 'tenant-b')")
          (e2e/execute-statement! dest-1 "INSERT INTO \"acct\" VALUES (1, 'tenant-a')")
          (let [router-id (u/the-id router-db)]
            (mt/with-temp [:model/DatabaseRouter _ {:database_id router-id :user_attribute "db_name"}]
              (mt/with-current-user (mt/user->id :rasta)
                (set-owner-of-row-1! router-id "by-rasta"))
              (testing "a routed user's implicit action writes with the destination's credentials"
                (is (= {:router "tenant-b" :destination "by-rasta"}
                       {:router (owner-of-row-1 router-db) :destination (owner-of-row-1 dest-1)})))
              (mt/with-current-user (mt/user->id :crowberto)
                (set-owner-of-row-1! router-id "by-crowberto"))
              (testing "an admin without the attribute writes with the router's credentials"
                (is (= {:router "by-crowberto" :destination "by-rasta"}
                       {:router (owner-of-row-1 router-db) :destination (owner-of-row-1 dest-1)}))))))))))
