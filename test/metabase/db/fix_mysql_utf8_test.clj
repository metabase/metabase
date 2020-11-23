(ns metabase.db.fix-mysql-utf8-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.java.jdbc :as jdbc]
            [metabase
             [db :as mdb]
             [models :refer [Database]]
             [test :as mt]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [toucan.db :as db]))

(defn- create-test-db! []
  (jdbc/with-db-connection [server-conn (sql-jdbc.conn/connection-details->spec :mysql
                                          (mt/dbdef->connection-details :mysql :server nil))]
    (doseq [statement ["DROP DATABASE IF EXISTS utf8_test;"
                       "CREATE DATABASE utf8_test;"]]
      (jdbc/execute! server-conn statement))))

(defn- test-db-spec []
  (sql-jdbc.conn/connection-details->spec :mysql
    (mt/dbdef->connection-details :mysql :db {:database-name "utf8_test"})))

(defn- convert-to-charset!
  "Convert a MySQL/MariaDB database to the `latin1` character set."
  [jdbc-spec charset collation]
  (jdbc/with-db-connection [conn jdbc-spec]
    (doseq [statement [(format "ALTER DATABASE utf8_test CHARACTER SET = %s COLLATE = %s;" charset collation)
                       (format "ALTER TABLE metabase_database CONVERT TO CHARACTER SET %s COLLATE %s;" charset collation)]]
      (jdbc/execute! jdbc-spec [statement]))))

(defn- remove-utf8mb4-migrations!
  "Remove the entries for the migrations that convert a DB to utf8mb4 from the Liquibase migration log so they can be
  ran again."
  [jdbc-spec]
  (jdbc/execute! jdbc-spec [(format "DELETE FROM `DATABASECHANGELOG` WHERE ID IN (%s);"
                                    (str/join "," (map #(str \' % \')
                                                       (range 107 161))))]))

(defn- db-charset []
  (first (jdbc/query db/*db-connection*
                     (str "SELECT default_collation_name AS `collation`, default_character_set_name AS `character-set` "
                          "FROM information_schema.SCHEMATA "
                          "WHERE schema_name = 'utf8_test';"))))

(defn- table-charset []
  (first (jdbc/query db/*db-connection*
                     (str "SELECT ccsa.collation_name AS `collation`, ccsa.character_set_name AS `character-set` "
                          "FROM information_schema.`TABLES` t,"
                          " information_schema.`COLLATION_CHARACTER_SET_APPLICABILITY` ccsa "
                          "WHERE ccsa.collation_name = t.table_collation"
                          "  AND t.table_schema = 'utf8_test' "
                          "  AND t.table_name = 'metabase_database';"))))

(defn- column-charset []
  (first (jdbc/query db/*db-connection*
                     (str "SELECT collation_name AS `collation`, character_set_name AS `character-set` "
                          "FROM information_schema.`COLUMNS` "
                          "WHERE table_schema = 'utf8_test'"
                          "  AND table_name = 'metabase_database'"
                          "AND column_name = 'name';"))))

(def ^:private test-unicode-str "Cam 𝌆 Saul 💩")

(defn- insert-row! []
  (jdbc/execute! db/*db-connection* [(str "INSERT INTO metabase_database (engine, name, created_at, updated_at) "
                                          "VALUES ('mysql', ?, current_timestamp, current_timestamp)")
                                     test-unicode-str]))

;; The basic idea behind this test is:
;;
;; 1. Create a new application DB; convert the DB to `latin1` or `utf8` (effectively rolling back migrations 107-160),
;;    then verify that utf-8 is now broken. (This simulates the state app DBs are in before this fix)
;;
;; 2. Now run the migrations again and verify that things are fixed
(deftest utf8-test
  (mt/test-driver :mysql
    (testing "Migrations 107-160\n"
      (doseq [{:keys [charset collation]} [{:charset "utf8", :collation "utf8_general_ci"}
                                           {:charset "latin1", :collation "latin1_swedish_ci"}]]
        ;; create a new application DB and run migrations.
        (create-test-db!)
        (jdbc/with-db-connection [conn-spec (test-db-spec)]
          (mdb/migrate! conn-spec :up)
          (testing (format "Migrating %s charset -> utf8mb4\n" charset)
            ;; Roll back the DB to act as if migrations 107-160 had never been ran
            (convert-to-charset! conn-spec charset collation)
            (remove-utf8mb4-migrations! conn-spec)
            (binding [db/*db-connection* conn-spec]
              (testing (format "DB without migrations 107-160: UTF-8 shouldn't work when using the '%s' character set" charset)
                (is (= {:character-set charset, :collation collation}
                       (db-charset)
                       (table-charset)
                       (column-charset))
                    (format "Make sure we converted the DB to %s correctly" charset))
                (is (thrown?
                     Exception
                     (insert-row!))
                    "Shouldn't be able to insert UTF-8 values"))

              (testing "If we run the migrations 107-160 then the DB should get converted to utf8mb4"
                (mdb/migrate! conn-spec :up)
                (is (= {:character-set "utf8mb4", :collation "utf8mb4_unicode_ci"}
                       (db-charset)
                       (table-charset)
                       (column-charset))
                    "DB should be converted back to `utf8mb4` after running migrations")
                (testing "We should be able to insert UTF-8 values"
                  (insert-row!)
                  (is (= test-unicode-str
                         (db/select-one-field :name Database :name test-unicode-str))))))))))))
