(ns metabase.db.fix-mysql-utf8-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.db.fix-mysql-utf8 :as fix-mysql-utf8]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test :as mt]))

(defn- remove-unicode-connection-options [jdbc-spec]
  (dissoc jdbc-spec [:characterSetResults
                     :characterEncoding
                     :character_set_server
                     :connectionCollation
                     :useUnicode]))

(defn- db-character-set-and-collation [spec database-name]
  (first
   (jdbc/query spec (str "SELECT default_collation_name AS `collation`, default_character_set_name AS `character-set` "
                         "FROM information_schema.SCHEMATA "
                         (format "WHERE schema_name = \"%s\";" database-name)))))

(defn- table-character-set-and-collation [spec database-name table-name]
  (first (jdbc/query spec (str "SELECT ccsa.collation_name AS `collation`, ccsa.character_set_name AS `character-set` "
                               "FROM information_schema.`TABLES` t,"
                               " information_schema.`COLLATION_CHARACTER_SET_APPLICABILITY` ccsa "
                               "WHERE ccsa.collation_name = t.table_collation"
                               (format "  AND t.table_schema = \"%s\"" database-name)
                               (format "  AND t.table_name = \"%s\";" table-name)))))

(defn- column-character-set-and-collation [spec database-name table-name column-name]
  (first (jdbc/query spec (str "SELECT collation_name AS `collation`, character_set_name AS `character-set` "
                               "FROM information_schema.`COLUMNS` "
                               (format "WHERE table_schema = \"%s\"" database-name)
                               (format "  AND table_name = \"%s\"" table-name)
                               (format "  AND column_name = \"%s\";" column-name)))))

(deftest utf8-test
  (doseq [{:keys [character-set collation]} [#_{:character-set "utf8", :collation "utf8_general_ci"}
                                             {:character-set "latin1", :collation "latin1_swedish_ci"}]]
    (testing (format "character set = %s" character-set)
      (let [test-unicode-str "Cam 𝌆 Saul 💩"]
        (jdbc/with-db-connection [server-conn (remove-unicode-connection-options
                                               (sql-jdbc.conn/connection-details->spec :mysql
                                                 (mt/dbdef->connection-details :mysql :server nil)))]
          (doseq [statement ["DROP DATABASE IF EXISTS utf8_test;"
                             (format "CREATE DATABASE utf8_test CHARACTER SET %s COLLATE %s;" character-set collation)]]
            (jdbc/execute! server-conn statement)))
        (let [spec (sql-jdbc.conn/connection-details->spec :mysql
                     (mt/dbdef->connection-details :mysql :db {:database-name "utf8_test"}))]
          ;; make sure the Table is created without Unicode options set
          (jdbc/with-db-connection [conn (remove-unicode-connection-options spec)]
            (jdbc/execute! conn (str (format "CREATE TABLE people (id INTEGER, name TEXT CHARACTER SET %s COLLATE %s NOT NULL)"
                                             character-set collation)
                                     (format " ENGINE InnoDB CHARACTER SET %s COLLATE %s;" character-set collation)))
            (testing "Verify character set and collation were set correctly"
              (is (= {:character-set character-set, :collation collation}
                     (db-character-set-and-collation conn "utf8_test")
                     (table-character-set-and-collation conn "utf8_test" "people")
                     (column-character-set-and-collation conn "utf8_test" "people" "name")))))
          ;; use spec with normal unicode options from this point on
          (jdbc/with-db-connection [conn spec]
            (testing "This is a latin1 DB/table, so we shouldn't be able to insert Unicode stuff in it"
              (is (thrown-with-msg?
                   Exception
                   #"Incorrect string value:"
                   (jdbc/execute! conn ["INSERT INTO people(name) VALUES (?);" test-unicode-str]))))
            (fix-mysql-utf8/change-to-utf8mb4 spec "utf8_test")
            (testing "Verify character set and collation were set correctly"
              (is (= {:character-set "utf8mb4", :collation "utf8mb4_unicode_ci"}
                     (db-character-set-and-collation conn "utf8_test")
                     (table-character-set-and-collation conn "utf8_test" "people")
                     (column-character-set-and-collation conn "utf8_test" "people" "name"))))
            (testing "Verify that we can now set UTF-8 values"
              (is true
                  (jdbc/execute! conn ["INSERT INTO people(name) VALUES (?);" test-unicode-str])))
            (testing "Verify that UTF-8 values come back correctly"
              (is (= {:id nil, :name test-unicode-str}
                     (first (jdbc/query conn "SELECT * FROM people;")))))))))))
