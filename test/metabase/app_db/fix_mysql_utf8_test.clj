(ns metabase.app-db.fix-mysql-utf8-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- create-test-db! []
  (let [spec (sql-jdbc.conn/connection-details->spec
              :mysql
              (mt/dbdef->connection-details :mysql :server nil))]
    (sql-jdbc.execute/do-with-connection-with-options
     :mysql
     spec
     {:write? true}
     (fn [^java.sql.Connection server-conn]
       (doseq [statement ["DROP DATABASE IF EXISTS utf8_test;"
                          "CREATE DATABASE utf8_test;"]]
         (jdbc/execute! {:connection server-conn} statement))))))

(defn- test-data-source ^javax.sql.DataSource []
  (mdb.data-source/broken-out-details->DataSource
   :mysql
   (mt/dbdef->connection-details :mysql :db {:database-name "utf8_test"})))

(defn- db-charset []
  (t2/query-one {:select [[:default_collation_name :collation] [:default_character_set_name :character-set]]
                 :from   [:information_schema.SCHEMATA]
                 :where  [:= :schema_name "utf8_test"]}))

(defn- table-charset []
  (t2/query-one {:select [[:ccsa.collation_name :collation] [:ccsa.character_set_name :character-set]]
                 :from   [[:information_schema.TABLES :t]]
                 :join   [[:information_schema.COLLATION_CHARACTER_SET_APPLICABILITY :ccsa]
                          [:= :ccsa.collation_name :t.table_collation]]
                 :where  [:and [:= :t.table_schema "utf8_test"] [:= :t.table_name (name (t2/table-name :model/Database))]]}))

(defn- column-charset []
  (t2/query-one {:select [[:collation_name :collation] [:character_set_name :character-set]]
                 :from   [:information_schema.COLUMNS]
                 :where  [:and
                          [:= :table_schema "utf8_test"]
                          [:= :table_name (name (t2/table-name :model/Database))]
                          [:= :column_name "name"]]}))

(def ^:private test-unicode-str "Cam 𝌆 Saul 💩")

(defn- insert-row! []
  (t2/query {:insert-into (t2/table-name :model/Database)
             :values      [{:engine     "mysql"
                            :name       test-unicode-str
                            :created_at :%now
                            :updated_at :%now
                            :details    "{}"}]}))

(deftest utf8-test
  (testing "makes sure mysql uses utf-8 charset (#10691)"
    (mt/test-driver :mysql
      ;; create a new application DB and run migrations.
      (create-test-db!)
      (let [data-source (test-data-source)]
        (mdb/migrate! data-source :up)
        (is (= {:character-set "utf8mb4", :collation "utf8mb4_unicode_ci"}
               (db-charset)
               (table-charset)
               (column-charset)))
        (testing "We should be able to insert UTF-8 values"
          (insert-row!)
          (is (= test-unicode-str
                 (t2/select-one-fn :name :model/Database :name test-unicode-str))))))))
