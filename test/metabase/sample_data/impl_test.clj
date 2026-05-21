(ns metabase.sample-data.impl-test
  "Tests to make sure the Sample Database syncs the way we would expect."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.sample-data.embedded-postgres :as embedded-postgres]
   [metabase.sample-data.impl :as sample-data]
   [metabase.sync.core :as sync]
   [metabase.sync.task.sync-databases-test :as task.sync-databases-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouses-rest.api-test :as api.database-test]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Tooling -----------------------------------------------------

(defn- sample-database-db
  "POC: sample DB is hosted by an embedded Postgres started via
   [[metabase.sample-data.embedded-postgres/ensure-started!]]. The
   `read-write?` argument exists for historical parity; PG doesn't have an
   easy URL-level read-only toggle and the existing write tests rely on a
   fresh sync after every test, so we ignore the flag."
  [_read-write?]
  {:details (embedded-postgres/ensure-started!)
   :engine  :postgres
   :name    "Sample Database"})

(defmacro ^:private with-temp-sample-database-db
  "Execute `body` with a temporary Sample Database DB bound to `db-binding`."
  {:style/indent 1}
  [[db-binding] & body]
  `(mt/with-temp [:model/Database db# (sample-database-db false)]
     (sync/sync-database! db#)
     (let [~db-binding db#]
       ~@body)))

(defn- table
  "Get the Table in a `db` with `table-name`."
  [db table-name]
  (t2/select-one :model/Table :name table-name, :db_id (u/the-id db)))

(defn- field
  "Get the Field in a `db` with `table-name` and `field-name.`"
  [db table-name field-name]
  (t2/select-one :model/Field :name field-name, :table_id (u/the-id (table db table-name))))

;;; ----------------------------------------------------- Tests ------------------------------------------------------

(deftest start-embedded-postgres-test
  (testing "ensure-started! returns details usable for a Metabase Database row"
    (let [details (embedded-postgres/ensure-started!)]
      (is (= "localhost" (:host details)))
      (is (integer? (:port details)))
      (is (pos-int? (:port details)))
      (is (= "sample" (:dbname details)))
      (is (= "postgres" (:user details))))))

(deftest sync-sample-database-test
  (testing "Make sure the Sample Database is getting synced correctly."
    (with-temp-sample-database-db [db]
      ;; Manually activate Field values since they are not created during sync (#53387)
      (field-values/get-or-create-full-field-values! (field db "PEOPLE" "NAME"))
      (is (= {:description      "The name of the user who owns an account"
              :database_type    "varchar"
              :semantic_type    :type/Name
              :name             "NAME"
              :has_field_values :list
              :active           true
              :visibility_type  :normal
              :preview_display  true
              :display_name     "Name"
              :fingerprint      {:global {:distinct-count 2499
                                          :nil%           0.0}
                                 :type   {:type/Text {:percent-json   0.0
                                                      :percent-url    0.0
                                                      :percent-email  0.0
                                                      :percent-state  0.0
                                                      :average-length 13.532
                                                      :max-length     23.0
                                                      :min-length     7.0
                                                      :mode-fraction  4.0E-4
                                                      :top-3-fraction 0.0012
                                                      :percent-blank  0.0}}}
              :base_type        :type/Text}
             (-> (field db "PEOPLE" "NAME")
                 ;; it should be `nil` after sync but get set to `search` by the auto-inference. We only set `list` in
                 ;; sync and setting anything else is reserved for admins, however we fill in what we think should be
                 ;; the appropiate value with the hydration fn
                 (t2/hydrate :has_field_values)
                 (select-keys [:name :description :database_type :semantic_type :has_field_values :active :visibility_type
                               :preview_display :display_name :fingerprint :base_type])))))))

(deftest write-rows-sample-database-test
  (testing "should be able to execute INSERT, UPDATE, and DELETE statements on the Sample Database"
    (mt/with-temp [:model/Database db (sample-database-db true)]
      (sync/sync-database! db)
      (mt/with-db db
        (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
          (testing "update row"
            (let [quantity (fn []
                             (->> (jdbc/query conn-spec ["SELECT \"QUANTITY\" FROM \"ORDERS\" WHERE \"ID\" = 1"])
                                  (map :quantity)))]
              (testing "before"
                (is (= [2]
                       (quantity))))
              (is (= [1]
                     (jdbc/execute! conn-spec ["UPDATE \"ORDERS\" SET \"QUANTITY\" = 1 WHERE \"ID\" = 1"])))
              (testing "after"
                (is (= [1]
                       (quantity))))
              (testing "restore"
                (is (= [1]
                       (jdbc/execute! conn-spec ["UPDATE \"ORDERS\" SET \"QUANTITY\" = 2 WHERE \"ID\" = 1"]))))))
          (let [rating (fn []
                         (->> (jdbc/query conn-spec ["SELECT \"RATING\" FROM \"PRODUCTS\" WHERE \"PRICE\" = 12.345"])
                              (map :rating)))]
            (testing "before"
              (is (= []
                     (rating))))
            (testing "insert row"
              (is (= [1]
                     (jdbc/execute! conn-spec ["INSERT INTO \"PRODUCTS\" (\"PRICE\", \"RATING\") VALUES (12.345, 6.789)"])))
              (is (= [6.789]
                     (rating))))
            (testing "delete row"
              (testing "before"
                (is (= [6.789]
                       (rating))))
              (is (= [1]
                     (jdbc/execute! conn-spec ["DELETE FROM \"PRODUCTS\" WHERE \"PRICE\" = 12.345"])))
              (testing "after"
                (is (= []
                       (rating)))))))))))

(deftest ddl-sample-database-test
  (testing "should be able to execute DDL statements on the Sample Database"
    (mt/with-temp [:model/Database db (sample-database-db true)]
      (sync/sync-database! db)
      (mt/with-db db
        (let [conn-spec       (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              get-tables      (fn [] (set (mapv :table_name
                                                (jdbc/query conn-spec
                                                            ["SELECT table_name FROM information_schema.tables
                                                              WHERE table_schema = current_schema()"]))))
              show-columns    (fn [table-name]
                                (set (mapv :column_name
                                           (jdbc/query conn-spec
                                                       ["SELECT column_name FROM information_schema.columns
                                                         WHERE table_schema = current_schema() AND table_name = ?"
                                                        table-name]))))
              get-schemas     (fn [] (set (mapv :schema_name
                                                (jdbc/query conn-spec
                                                            ["SELECT schema_name FROM information_schema.schemata"]))))]
          (testing "create schema"
            (is (not (contains? (get-schemas) "new_schema")))
            (jdbc/execute! conn-spec ["CREATE SCHEMA new_schema"])
            (is (contains? (get-schemas) "new_schema")))
          (testing "drop schema"
            (jdbc/execute! conn-spec ["DROP SCHEMA new_schema"])
            (is (not (contains? (get-schemas) "new_schema"))))
          (testing "create table"
            (is (not (contains? (get-tables) "new_table")))
            (jdbc/execute! conn-spec ["CREATE TABLE new_table (id INTEGER)"])
            (is (contains? (get-tables) "new_table"))
            (testing "add column"
              (is (not (contains? (show-columns "new_table") "new_column")))
              (jdbc/execute! conn-spec ["ALTER TABLE new_table ADD COLUMN new_column VARCHAR(255)"])
              (is (contains? (show-columns "new_table") "new_column"))
              (testing "remove column"
                (jdbc/execute! conn-spec ["ALTER TABLE new_table DROP COLUMN new_column"])
                (is (not (contains? (show-columns "new_table") "new_column")))
                (testing "drop table"
                  (jdbc/execute! conn-spec ["DROP TABLE new_table"])
                  (is (not (contains? (get-tables) "new_table"))))))))))))

(deftest sample-database-schedule-sync-test
  (testing "Check that the sample database has scheduled sync jobs, just like a newly created database"
    (mt/with-temp-empty-app-db [_conn :h2]
      (api.database-test/with-db-scheduler-setup!
        (mdb/setup-db! :create-sample-content? true)
        (sample-data/extract-and-sync-sample-database!)
        (testing "Sense check: a newly created database should have sync jobs scheduled"
          (mt/with-temp [:model/Database db {}]
            (is (= (task.sync-databases-test/all-db-sync-triggers-name db)
                   (task.sync-databases-test/query-all-db-sync-triggers-name db)))))
        (testing "The sample database should also have sync jobs scheduled"
          (let [sample-db (t2/select-one :model/Database :is_sample true)]
            (is (= (task.sync-databases-test/all-db-sync-triggers-name sample-db)
                   (task.sync-databases-test/query-all-db-sync-triggers-name sample-db)))))))))
