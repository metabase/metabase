(ns metabase.sample-data.impl-test
  "Tests to make sure the Sample Database syncs the way we would expect."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.permissions.core :as perms]
   [metabase.plugins.impl :as plugins]
   [metabase.query-processor :as qp]
   [metabase.sample-data.impl :as sample-data]
   [metabase.sync.core :as sync]
   [metabase.sync.task.sync-databases-test :as task.sync-databases-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouses-rest.api-test :as api.database-test]
   [toucan2.core :as t2])
  (:import (org.sqlite SQLiteException)))

;;; ---------------------------------------------------- Tooling -----------------------------------------------------

;; These tools are pretty sophisticated for the amount of tests we have!

(defn- sample-database-db
  "Sample DB is SQLite-backed and always read-only: `try-to-extract-sample-database!` returns details with
  `:read-only? true`, which the SQLite driver honors by opening the connection in read-only `open_mode`."
  []
  {:details (#'sample-data/try-to-extract-sample-database! :sqlite)
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

(deftest migrate-sample-database-engine-in-place-test
  (testing "Upgrade path: migrating the sample DB from H2 to SQLite in place keeps every Database/Table/Field
           id, so content referencing those ids survives with no remapping and still queries correctly."
    (mt/with-model-cleanup [:model/Database :model/Card]
      ;; Install the pre-upgrade (v62-shape) H2 sample database and a user question that references a field.
      (let [h2-db (t2/insert-returning-instance! :model/Database
                                                 {:name "Sample Database" :engine :h2 :is_sample true
                                                  :details (#'sample-data/try-to-extract-sample-database! :h2)})]
        (sync/sync-database! h2-db)
        (let [orders-id  (t2/select-one-pk :model/Table :db_id (:id h2-db) :name "ORDERS")
              total-id   (t2/select-one-pk :model/Field :table_id orders-id :name "TOTAL")
              user-card  (t2/insert-returning-instance! :model/Card
                                                        {:name "user q" :database_id (:id h2-db) :table_id orders-id
                                                         :display "scalar" :visualization_settings {} :creator_id (mt/user->id :rasta)
                                                         :dataset_query {:database (:id h2-db) :type :query
                                                                         :query {:source-table orders-id
                                                                                 :aggregation [[:sum [:field total-id nil]]]}}})
              before-tables  (t2/select-fn-set :id :model/Table :db_id (:id h2-db))
              before-fields  (t2/select-fn-set :id :model/Field :table_id [:in before-tables])]
          (is (= #{"PUBLIC"} (t2/select-fn-set :schema :model/Table :db_id (:id h2-db)))
              "precondition: H2 tables live in the PUBLIC schema")
          ;; ---- the migration under test ----
          (#'sample-data/migrate-sample-database-engine-in-place! :sqlite (t2/select-one :model/Database :id (:id h2-db)))
          (testing "the database record is now SQLite"
            (is (= :sqlite (:engine (t2/select-one :model/Database :id (:id h2-db))))))
          (testing "the same tables remain (no new ones), now with schema = nil"
            (is (= before-tables (t2/select-fn-set :id :model/Table :db_id (:id h2-db))))
            (is (= #{nil} (t2/select-fn-set :schema :model/Table :db_id (:id h2-db)))))
          (testing "the same fields remain (ids preserved), so embedded query refs stay valid"
            (is (= before-fields (t2/select-fn-set :id :model/Field :table_id [:in before-tables]))))
          (testing "the user card survives with its id and still queries the (now SQLite) sample DB"
            (is (t2/exists? :model/Card :id (:id user-card)))
            (let [result (qp/process-query (:dataset_query (t2/select-one :model/Card :id (:id user-card))))]
              (is (= :completed (:status result)))
              (is (pos? (count (mt/rows result)))))))))))

(deftest migrate-sample-database-engine-in-place-downgrade-test
  (testing "Downgrade path: migrating the sample DB from SQLite back to H2 in place keeps every id, so
           sample and user content survive with no remapping and still query correctly."
    (mt/with-model-cleanup [:model/Database :model/Collection :model/Card :model/Dashboard]
      ;; Install the SQLite sample database (the state a newer version leaves behind) and a user question
      ;; that references a field.
      (let [sqlite-db (t2/insert-returning-instance! :model/Database
                                                     {:name "Sample Database" :engine :sqlite :is_sample true
                                                      :details (#'sample-data/try-to-extract-sample-database! :sqlite)})]
        (sync/sync-database! sqlite-db)
        (let [orders-id (t2/select-one-pk :model/Table :db_id (:id sqlite-db) :name "ORDERS")
              total-id  (t2/select-one-pk :model/Field :table_id orders-id :name "TOTAL")
              user-card (t2/insert-returning-instance! :model/Card
                                                       {:name "user q" :database_id (:id sqlite-db) :table_id orders-id
                                                        :display "scalar" :visualization_settings {} :creator_id (mt/user->id :rasta)
                                                        :dataset_query {:database (:id sqlite-db) :type :query
                                                                        :query {:source-table orders-id
                                                                                :aggregation [[:sum [:field total-id nil]]]}}})
              before-tables (t2/select-fn-set :id :model/Table :db_id (:id sqlite-db))
              before-fields (t2/select-fn-set :id :model/Field :table_id [:in before-tables])]
          (is (= #{nil} (t2/select-fn-set :schema :model/Table :db_id (:id sqlite-db)))
              "precondition: SQLite tables have a nil schema")
          ;; ---- the migration under test ----
          (#'sample-data/migrate-sample-database-engine-in-place! :h2 (t2/select-one :model/Database :id (:id sqlite-db)))
          (testing "the database record is now H2"
            (is (= :h2 (:engine (t2/select-one :model/Database :id (:id sqlite-db))))))
          (testing "the same tables remain (no new ones), now with schema = PUBLIC"
            (is (= before-tables (t2/select-fn-set :id :model/Table :db_id (:id sqlite-db))))
            (is (= #{"PUBLIC"} (t2/select-fn-set :schema :model/Table :db_id (:id sqlite-db)))))
          (testing "the same fields remain (ids preserved)"
            (is (= before-fields (t2/select-fn-set :id :model/Field :table_id [:in before-tables]))))
          (testing "the user card survives with its id and still queries the (now H2) sample DB"
            (is (t2/exists? :model/Card :id (:id user-card)))
            (let [result (qp/process-query (:dataset_query (t2/select-one :model/Card :id (:id user-card))))]
              (is (= :completed (:status result)))
              (is (pos? (count (mt/rows result)))))))))))

(deftest migrate-sample-database-engine-in-place-disables-actions-test
  (testing "Migrating the sample DB to an engine that doesn't support actions disables the actions settings
           instead of failing the update (GHY-4133: actions enabled on the H2 sample DB blocked the v62->v63
           upgrade because SQLite doesn't support actions)."
    (mt/with-model-cleanup [:model/Database]
      (let [h2-db (t2/insert-returning-instance! :model/Database
                                                 {:name "Sample Database" :engine :h2 :is_sample true
                                                  :settings {:database-enable-actions       true
                                                             :database-enable-table-editing true}
                                                  :details (#'sample-data/try-to-extract-sample-database! :h2)})]
        (#'sample-data/migrate-sample-database-engine-in-place! :sqlite (t2/select-one :model/Database :id (:id h2-db)))
        (let [db (t2/select-one :model/Database :id (:id h2-db))]
          (testing "the migration succeeds"
            (is (= :sqlite (:engine db))))
          (testing "the unsupported feature settings are disabled"
            (is (false? (get-in db [:settings :database-enable-actions])))
            (is (false? (get-in db [:settings :database-enable-table-editing])))))))))

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
                     SQLiteException
                     #"(?i)readonly"
                     (jdbc/execute! conn-spec sql)))))))))))

(deftest update-sample-database-same-engine-test
  (testing "When the bundled engine is unchanged, the sample DB is kept and only its details refreshed"
    (mt/with-temp [:model/Database db (assoc (sample-database-db)
                                             :is_sample true
                                             :details {:db "/stale/path/sample-database.sqlite"})]
      (let [extract-called? (atom false)]
        (mt/with-dynamic-fn-redefs [sample-data/extract-and-sync-sample-database! (fn [] (reset! extract-called? true))]
          (#'sample-data/update-sample-database-if-needed! db))
        (testing "the existing sample DB row is not replaced"
          (is (false? @extract-called?))
          (is (t2/exists? :model/Database :id (:id db))))
        (testing "its details were refreshed to the intended path"
          (is (re-matches extracted-db-path-regex
                          (get-in (t2/select-one :model/Database :id (:id db)) [:details :db]))))))))

(defn- db-level-perms
  "DB-level data-permission rows for `db-id` as a comparable map {[group-id perm-type] perm-value}."
  [db-id]
  (into {}
        (for [{:keys [group_id perm_type perm_value]} (t2/select :model/DataPermissions :db_id db-id :table_id nil)]
          [[group_id perm_type] perm_value])))

(deftest sample-database-upgrade-preserves-permissions-test
  (testing "The H2->SQLite sample-database swap re-applies each group's permissions to the new sample DB"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (mt/with-temp [:model/PermissionsGroup custom-group {}
                     :model/Database         old-sample {:engine :h2, :is_sample true, :details {:db "mem:old-sample"}}]
        ;; Put the old sample DB into a distinctive, non-default permission state, so we test that real custom
        ;; permissions carry forward - not just that the defaults happen to line up.
        (perms/set-database-permission! (perms/all-users-group) (:id old-sample) :perms/create-queries :no)
        (perms/set-database-permission! custom-group            (:id old-sample) :perms/create-queries :query-builder)
        (let [expected-perms (db-level-perms (:id old-sample))]
          (with-redefs [config/load-sample-content? (constantly true)]
            (#'sample-data/update-sample-database-if-needed! old-sample))
          (let [new-sample (t2/select-one :model/Database :is_sample true :engine :sqlite)]
            (is (some? new-sample) "the swap created a SQLite sample database")
            (testing "every group's db-level permissions match the old sample DB exactly"
              (is (= expected-perms (db-level-perms (:id new-sample)))))
            (testing "the custom permission state specifically carried forward"
              (let [new-perms (db-level-perms (:id new-sample))]
                (is (= :no            (new-perms [(:id (perms/all-users-group)) :perms/create-queries])))
                (is (= :query-builder (new-perms [(:id custom-group)            :perms/create-queries])))))))))))

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
