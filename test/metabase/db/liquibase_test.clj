(ns metabase.db.liquibase-test
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.liquibase :as liquibase]
   [metabase.db.test-util :as mdb.test-util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test :as mt]
   [metabase.util.yaml :as u.yaml]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2])
  (:import
   (java.io StringWriter)
   (liquibase Liquibase)))

(set! *warn-on-reflection* true)

(defn- sql-for-init-liquibase
  [^Liquibase liquibase]
  (let [writer (StringWriter.)]
    ;; run 0 updates, just to get the needed SQL to initiate liquibase like creating the DBchangelog table
    (.update liquibase 1 ""  writer)
    (.toString writer)))

(defn- split-migrations-sqls
  "Splits a sql migration string to multiple lines."
  [sql]
  (->> (str/split sql #"(;(\r)?\n)|(--.*\n)")
       (map str/trim)
       (remove (fn [s] (or
                        (str/blank? s)
                        (str/starts-with? s "--"))))))

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
           (is (= (str "CREATE TABLE liquibase_test.DATABASECHANGELOGLOCK ("
                       "ID INT NOT NULL, "
                       "`LOCKED` BIT(1) NOT NULL, "
                       "LOCKGRANTED datetime NULL, "
                       "LOCKEDBY VARCHAR(255) NULL, "
                       "CONSTRAINT PK_DATABASECHANGELOGLOCK PRIMARY KEY (ID)"
                       ") ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                  (first (split-migrations-sqls (sql-for-init-liquibase liquibase))))))
         (testing "Make sure *every* line contains ENGINE ... CHARACTER SET ... COLLATE"
           (doseq [line  (split-migrations-sqls (liquibase/migrations-sql liquibase))
                   :when (str/starts-with? line "CREATE TABLE")]
             (is (= true
                    (or
                     (str/includes? line "ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                     (str/includes? line "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")))
                 (format "%s should include ENGINE ... CHARACTER SET ... COLLATE ..." (pr-str line)))))))))

(defn liquibase-file->included-ids
  "Read a liquibase migration file and returns all the migration id that is applied to `db-type`.
  Ids are orderer in the order it's defined in migration file."
  [file-path db-type]
  (let [content (u.yaml/from-file (io/resource file-path))]
    (->> (:databaseChangeLog content)
         ;; if the changelog has filter by dbms, remove the ones that doens't apply for the current db-type
         (remove (fn [{{:keys [dbms]} :changeSet}] (and (not (str/blank? dbms))
                                                        (not (str/includes? dbms (name db-type))))))
         (map #(str (get-in % [:changeSet :id])))
         (remove str/blank?))))

(deftest consolidate-liquibase-changesets-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      ;; fake a db where we ran all the migrations, including the legacy ones
      (with-redefs [liquibase/decide-liquibase-file (fn [& _args] @#'liquibase/changelog-legacy-file)]
        (liquibase/with-liquibase [liquibase conn]
          (.update liquibase ""))
        (t2/update! (liquibase/changelog-table-name conn) {:filename "migrations/000_migrations.yaml"})
        (liquibase/consolidate-liquibase-changesets! conn)
        (testing "makes sure the change log filename are correctly set"
          (is (= (set (liquibase-file->included-ids "migrations/000_legacy_migrations.yaml" driver/*driver*))
                 (t2/select-fn-set :id (liquibase/changelog-table-name conn) :filename "migrations/000_legacy_migrations.yaml")))

          (is (= (set (liquibase-file->included-ids "migrations/001_update_migrations.yaml" driver/*driver*))
                 (t2/select-fn-set :id (liquibase/changelog-table-name conn) :filename "migrations/001_update_migrations.yaml"))))

        (is (= (t2/select-fn-set :id (liquibase/changelog-table-name conn))
               (set/union
                (set (liquibase-file->included-ids "migrations/000_legacy_migrations.yaml" driver/*driver*))
                (set (liquibase-file->included-ids "migrations/001_update_migrations.yaml" driver/*driver*)))))))))
