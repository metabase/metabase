(ns metabase.sample-data.impl-test
  "Tests to make sure the Sample Database syncs the way we would expect."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.plugins.impl :as plugins]
   [metabase.sample-data.impl :as sample-data]
   [metabase.sync.core :as sync]
   [metabase.sync.task.sync-databases-test :as task.sync-databases-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouses-rest.api-test :as api.database-test]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Tooling -----------------------------------------------------

;; These tools are pretty sophisticated for the amount of tests we have!

(defn- sample-database-db
  "Sample DB is SQLite-backed and always read-only: `try-to-extract-sample-database!` returns details with
  `:read-only? true`, which the SQLite driver honors by opening the connection in read-only `open_mode`."
  []
  {:details (#'sample-data/try-to-extract-sample-database!)
   :engine  :sqlite
   :name    "Sample Database"})

(defmacro ^:private with-temp-sample-database-db
  "Execute `body` with a temporary Sample Database DB bound to `db-binding`."
  {:style/indent 1}
  [[db-binding] & body]
  `(mt/with-temp [:model/Database db# (sample-database-db)]
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

(def ^:private extracted-db-path-regex #".*plugins/sample-database\.sqlite$")

(deftest extract-sample-database-test
  (testing "The Sample Database is copied out of the JAR into the plugins directory before the DB details are saved."
    (mt/with-dynamic-fn-redefs [sync/sync-database! (constantly nil)]
      (with-temp-sample-database-db [db]
        (let [db-path (get-in db [:details :db])]
          (is (re-matches extracted-db-path-regex db-path))))))
  (memoize/memo-clear! @#'plugins/plugins-dir*))

(deftest sync-sample-database-test
  (testing "Make sure the Sample Database is getting synced correctly."
    (with-temp-sample-database-db [db]
      ;; Manually activate Field values since they are not created during sync (#53387)
      (field-values/get-or-create-full-field-values! (field db "PEOPLE" "NAME"))
      (is (= {:description      "The name of the user who owns an account"
              :database_type    "CHARACTER VARYING"
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

(deftest sample-database-is-read-only-test
  (testing "The Sample Database connection is read-only: reads succeed but INSERT/UPDATE/DELETE are rejected"
    (mt/with-temp [:model/Database db (sample-database-db)]
      (sync/sync-database! db)
      (mt/with-db db
        (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
          (testing "reads succeed"
            (is (= [2]
                   (->> (jdbc/query conn-spec "SELECT QUANTITY FROM ORDERS WHERE ID = 1;")
                        (map :quantity)))))
          (testing "writes are rejected because the connection is read-only"
            (doseq [[op sql] [["UPDATE" "UPDATE ORDERS SET QUANTITY = 1 WHERE ID = 1;"]
                              ["INSERT" "INSERT INTO PRODUCTS (price, rating) VALUES (12.345, 6.789);"]
                              ["DELETE" "DELETE FROM PRODUCTS WHERE PRICE = 12.345;"]]]
              (testing op
                (is (thrown-with-msg?
                     org.sqlite.SQLiteException
                     #"(?i)readonly"
                     (jdbc/execute! conn-spec sql)))))))))))

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
