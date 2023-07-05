(ns metabase.db.liquibase-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.liquibase :as liquibase]
   [metabase.db.test-util :as mdb.test-util]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test :as mt]
   [next.jdbc :as next.jdbc]))

(defn- sql-migrations-lines
  [liquibase]
  (for [line  (str/split-lines (liquibase/migrations-sql liquibase))
        :when (not (or (str/blank? line)
                       (re-find #"^--" line)))]
    line))

(deftest mysql-engine-charset-test
  (mt/test-driver :mysql
    (testing "Make sure MySQL CREATE DATABASE statements have ENGINE/CHARACTER SET appended to them (#10691)"
      (sql-jdbc.execute/do-with-connection-with-options
        :mysql
        (sql-jdbc.conn/connection-details->spec :mysql
                                                (mt/dbdef->connection-details :mysql :server nil))
        {:write? true}
        (fn [^java.sql.Connection conn]
          (doseq [statement ["DROP DATABASE IF EXISTS liquibase_test;"
                             "CREATE DATABASE liquibase_test;"]]
            (next.jdbc/execute! conn [statement]))))
      (liquibase/with-liquibase [liquibase (->> (mt/dbdef->connection-details :mysql :db {:database-name "liquibase_test"})
                                                (sql-jdbc.conn/connection-details->spec :mysql)
                                                mdb.test-util/->ClojureJDBCSpecDataSource)]
        (testing "Make sure the first line actually matches the shape we're testing against"
          (is (= (str "UPDATE liquibase_test.DATABASECHANGELOGLOCK "
                      "SET `LOCKED` = 1, LOCKEDBY = '192.168.1.102 (192.168.1.102)', "
                      "LOCKGRANTED = current_timestamp(6) WHERE ID = 1 AND `LOCKED` = 0;")
                 (first (sql-migrations-lines liquibase)))))
        (testing "Make sure *every* line contains ENGINE ... CHARACTER SET ... COLLATE"
          (doseq [line  (sql-migrations-lines liquibase)
                  :when (str/starts-with? line "CREATE TABLE")]
            (is (= true
                   (str/includes? line "ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
                (format "%s should include ENGINE ... CHARACTER SET ... COLLATE ..." (pr-str line)))))))))
