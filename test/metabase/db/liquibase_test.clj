(ns metabase.db.liquibase-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.liquibase :as liquibase]
   [metabase.db.test-util :as mdb.test-util]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [next.jdbc :as next.jdbc]))

(deftest mysql-engine-charset-test
  (mt/test-driver :mysql
    (testing "Make sure MySQL CREATE DATABASE statements have ENGINE/CHARACTER SET appended to them (#10691)"
      (sql-jdbc.tx/do-with-connection-for-loading-test-data
       :mysql
       (sql-jdbc.conn/connection-details->spec :mysql
                                               (mt/dbdef->connection-details :mysql :server nil))
       (fn [^java.sql.Connection conn]
         (doseq [statement ["DROP DATABASE IF EXISTS liquibase_test;"
                            "CREATE DATABASE liquibase_test;"]]
           (next.jdbc/execute! conn [statement]))))
      (liquibase/with-liquibase [liquibase (->> (mt/dbdef->connection-details :mysql :db {:database-name "liquibase_test"})
                                                (sql-jdbc.conn/connection-details->spec :mysql)
                                                mdb.test-util/->ClojureJDBCSpecDataSource)]
        (testing "Make sure the first line actually matches the shape we're testing against"
          (is (= (str "CREATE TABLE liquibase_test.DATABASECHANGELOGLOCK ("
                      "ID INT NOT NULL, "
                      "`LOCKED` BIT(1) NOT NULL, "
                      "LOCKGRANTED datetime NULL, "
                      "LOCKEDBY VARCHAR(255) NULL, "
                      "CONSTRAINT PK_DATABASECHANGELOGLOCK PRIMARY KEY (ID)"
                      ") ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
                 (first (liquibase/migrations-lines liquibase)))))
        (testing "Make sure *every* line contains ENGINE ... CHARACTER SET ... COLLATE"
          (doseq [line  (liquibase/migrations-lines liquibase)
                  :when (str/starts-with? line "CREATE TABLE")]
            (is (= true
                   (str/includes? line "ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
                (format "%s should include ENGINE ... CHARACTER SET ... COLLATE ..." (pr-str line)))))))))
