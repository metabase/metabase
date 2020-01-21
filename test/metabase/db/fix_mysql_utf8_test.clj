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

(defn- column-character-set-and-collation [spec database-name table-name column-name]
  (first (jdbc/query spec (str "SELECT collation_name AS `collation`, character_set_name AS `character-set` "
                               "FROM information_schema.`COLUMNS` "
                               (format "WHERE table_schema = \"%s\"" database-name)
                               (format "  AND table_name = \"%s\"" table-name)
                               (format "  AND column_name = \"%s\";" column-name)))))

(defn- create-utf8-test-db! [character-set collation]
  (jdbc/with-db-connection [server-conn (remove-unicode-connection-options
                                         (sql-jdbc.conn/connection-details->spec :mysql
                                           (mt/dbdef->connection-details :mysql :server nil)))]
    (doseq [statement ["DROP DATABASE IF EXISTS utf8_test;"
                       (format "CREATE DATABASE utf8_test CHARACTER SET %s COLLATE %s;" character-set collation)]]
      (jdbc/execute! server-conn statement))))

(def ^:private test-unicode-str "Cam 𝌆 Saul 💩")

(defn- utf8-test-db-spec []
  (sql-jdbc.conn/connection-details->spec :mysql
    (mt/dbdef->connection-details :mysql :db {:database-name "utf8_test"})))

(deftest utf8-test
  (doseq [{:keys [character-set collation]} [{:character-set "utf8",   :collation "utf8_general_ci"}
                                             {:character-set "latin1", :collation "latin1_swedish_ci"}]]
    (testing (format "character set = %s" character-set)
      (create-utf8-test-db! character-set collation)
      ;; make sure the Table is created without Unicode options set
      (jdbc/with-db-connection [conn (remove-unicode-connection-options (utf8-test-db-spec))]
        (jdbc/execute! conn (str (format "CREATE TABLE people (id INTEGER, name TEXT CHARACTER SET %s COLLATE %s NOT NULL)"
                                         character-set collation)
                                 (format " ENGINE InnoDB CHARACTER SET %s COLLATE %s;" character-set collation)))
        (testing "Verify character set and collation were set correctly"
          (is (= {:character-set character-set, :collation collation}
                 (#'fix-mysql-utf8/db-character-set-and-collation conn "utf8_test")
                 (#'fix-mysql-utf8/table-character-set-and-collation conn "utf8_test" "people")
                 (column-character-set-and-collation conn "utf8_test" "people" "name")))))
      ;; use spec with normal unicode options from this point on
      (jdbc/with-db-connection [conn (utf8-test-db-spec)]
        (testing "This is a latin1/utf8 DB/table, so we shouldn't be able to insert Unicode stuff in it"
          (is (thrown-with-msg?
               Exception
               #"Incorrect string value:"
               (jdbc/execute! conn ["INSERT INTO people(name) VALUES (?);" test-unicode-str]))))
        (fix-mysql-utf8/convert-to-utf8mb4! conn "utf8_test")
        (testing "Verify character set and collation were set correctly"
          (is (= {:character-set "utf8mb4", :collation "utf8mb4_unicode_ci"}
                 (#'fix-mysql-utf8/db-character-set-and-collation conn "utf8_test")
                 (#'fix-mysql-utf8/table-character-set-and-collation conn "utf8_test" "people")
                 (column-character-set-and-collation conn "utf8_test" "people" "name"))))
        (testing "Verify that we can now set UTF-8 values"
          (is true
              (jdbc/execute! conn ["INSERT INTO people(name) VALUES (?);" test-unicode-str])))
        (testing "Verify that UTF-8 values come back correctly"
          (is (= {:id nil, :name test-unicode-str}
                 (first (jdbc/query conn "SELECT * FROM people;"))))))
      (testing "if the Table is already `utf8mb4`, `convert-to-utf8mb4` should no-op"
        (is (= nil
               (#'fix-mysql-utf8/convert-to-utf8mb4-statements (utf8-test-db-spec) "utf8_test")))))))
