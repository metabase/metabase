(ns metabase.db.liquibase-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase.db :as mdb]
            [metabase.db.liquibase :as liquibase]))

(deftest mysql-engine-charset-test
  (when (= (mdb/db-type) :mysql)
    (testing "Make sure MySQL CREATE DATABASE statements have ENGINE/CHARACTER SET appended to them (#10691)"
      (liquibase/with-liquibase [liquibase (mdb/jdbc-spec)]
        (testing "Make sure the first line actually matches the shape we're testing against"
          (is (= (str (format "CREATE TABLE %s.DATABASECHANGELOGLOCK (" (:dbname (mdb/jdbc-spec)))
                      "ID INT NOT NULL, "
                      "`LOCKED` BIT(1) NOT NULL, "
                      "LOCKGRANTED datetime NULL, "
                      "LOCKEDBY VARCHAR(255) NULL, "
                      "CONSTRAINT PK_DATABASECHANGELOGLOCK PRIMARY KEY (ID)"
                      ") ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"))))
        (testing "Make sure *every* line contains ENGINE ... CHARACTER SET ... COLLATE"
          (doseq [line  (liquibase/migrations-lines liquibase)
                  :when (str/starts-with? line "CREATE TABLE")]
            (is (= true
                   (str/includes? line "ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
                (format "%s should include ENGINE ... CHARACTER SET ... COLLATE ..." (pr-str line)))))))))
