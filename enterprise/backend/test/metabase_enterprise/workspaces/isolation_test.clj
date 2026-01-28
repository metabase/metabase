(ns ^:mb/driver-tests metabase-enterprise.workspaces.isolation-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(ws.tu/ws-fixtures!)

(set! *warn-on-reflection* true)

;;; Test helper multimethod to verify cleanup

(defmulti workspace-isolation-resources-exist?
  "Check if isolation resources still exist for the workspace.
  Returns a map with keys indicating which resources exist."
  {:arglists '([database workspace])}
  (fn [database _workspace]
    (driver/the-driver (:engine database)))
  :hierarchy #'driver/hierarchy)

(defmethod workspace-isolation-resources-exist? :postgres
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        username    (ws.u/isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM information_schema.schemata WHERE schema_name = ?" schema-name])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM pg_user WHERE usename = ?" username])
                 seq boolean)}))

(defmethod workspace-isolation-resources-exist? :h2
  [database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        username    (driver.u/workspace-isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM INFORMATION_SCHEMA.SCHEMATA WHERE UPPER(SCHEMA_NAME) = UPPER(?)" schema-name])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM INFORMATION_SCHEMA.USERS WHERE UPPER(USER_NAME) = UPPER(?)" username])
                 seq boolean)}))

(defmethod workspace-isolation-resources-exist? :snowflake
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        db-name     (-> database :details :db)
        role-name   (format "MB_ISOLATION_ROLE_%s" (:id workspace))
        username    (ws.u/isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             [(format "SHOW SCHEMAS LIKE '%s' IN DATABASE \"%s\"" schema-name db-name)])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             [(format "SHOW USERS LIKE '%s'" username)])
                 seq boolean)
     :role   (-> (jdbc/query conn-spec
                             [(format "SHOW ROLES LIKE '%s'" role-name)])
                 seq boolean)}))

(defmethod workspace-isolation-resources-exist? :sqlserver
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        username    (ws.u/isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM sys.schemas WHERE name = ?" schema-name])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM sys.database_principals WHERE name = ?" username])
                 seq boolean)
     :login  (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM master.sys.server_principals WHERE name = ?" username])
                 seq boolean)}))

(defmethod workspace-isolation-resources-exist? :clickhouse
  [database workspace]
  (let [db-name   (ws.u/isolation-namespace-name workspace)
        username  (ws.u/isolation-user-name workspace)
        conn-spec (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:database (-> (jdbc/query conn-spec
                               ["SELECT 1 FROM system.databases WHERE name = ?" db-name])
                   seq boolean)
     :user     (-> (jdbc/query conn-spec
                               ["SELECT 1 FROM system.users WHERE name = ?" username])
                   seq boolean)}))

;;; Tests
(deftest destroy-workspace-isolation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (ws.tu/with-workspaces! [workspace {:name "Test destroy isolation"}]
      (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                   :transform nil
                                   {:name   "Transform A"
                                    :source {:type "query" :query (mt/mbql-query orders {:limit 1})}
                                    :target {:database (mt/id)
                                             :schema   "analytics"
                                             :name     "table_a"}})
      (let [workspace (ws.tu/ws-done! workspace)
            database  (mt/db)]
        (testing "resources are created during workspace initialization"
          (let [resources (workspace-isolation-resources-exist? database workspace)]
            (is (every? true? (vals resources)))))

        (testing "destroy removes all isolation resources"
          (driver/destroy-workspace-isolation! (driver.u/database->driver database) database workspace)
          (let [resources (workspace-isolation-resources-exist? database workspace)]
            (is (every? false? (vals resources)))))

        (testing "destroy is idempotent"
          (driver/destroy-workspace-isolation! (driver.u/database->driver database) database workspace))))))

;;; check-isolation-permissions tests

(deftest check-isolation-permissions-success-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (testing "returns nil when connection has all required permissions"
      (let [database   (mt/db)
            test-table (t2/select-one [:model/Table :schema :name] (mt/id :orders))]
        (is (nil? (driver/check-isolation-permissions
                   (driver/the-driver (:engine database))
                   database
                   test-table)))))))

(deftest check-isolation-permissions-no-artifacts-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (testing "leaves no artifacts after check due to transaction rollback"
      (let [database       (mt/db)
            test-workspace {:id   "00000000-0000-0000-0000-000000000000"
                            :name "_mb_perm_check_"}
            test-table     (t2/select-one [:model/Table :schema :name] (mt/id :orders))]
        ;; Run the check
        (driver/check-isolation-permissions
         (driver/the-driver (:engine database))
         database
         test-table)
        ;; Verify no artifacts remain - the test workspace should not have any resources
        (let [resources (workspace-isolation-resources-exist? database test-workspace)]
          (is (every? false? (vals resources))
              "No isolation resources should exist after permission check"))))))

(deftest check-isolation-permissions-init-failure-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (testing "returns error message when init fails"
      (let [database   (mt/db)
            test-table (t2/select-one [:model/Table :schema :name] (mt/id :orders))]
        (with-redefs [driver/init-workspace-isolation!
                      (fn [_driver _database _workspace]
                        (throw (ex-info "permission denied" {:step :init})))]
          (is (some? (driver/check-isolation-permissions
                      (driver/the-driver (:engine database))
                      database
                      test-table))
              "Should return error message when init fails"))))))

(deftest check-isolation-permissions-grant-failure-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (testing "returns error message when grant fails"
      (let [database   (mt/db)
            test-table (t2/select-one [:model/Table :schema :name] (mt/id :orders))]
        (with-redefs [driver/grant-workspace-read-access!
                      (fn [_driver _database _workspace _tables]
                        (throw (ex-info "permission denied" {:step :grant})))]
          (is (some? (driver/check-isolation-permissions
                      (driver/the-driver (:engine database))
                      database
                      test-table))
              "Should return error message when grant fails"))))))

(deftest check-isolation-permissions-destroy-failure-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (testing "returns error message when destroy fails"
      (let [database   (mt/db)
            test-table (t2/select-one [:model/Table :schema :name] (mt/id :orders))]
        (with-redefs [driver/destroy-workspace-isolation!
                      (fn [_driver _database _workspace]
                        (throw (ex-info "permission denied" {:step :destroy})))]
          (is (some? (driver/check-isolation-permissions
                      (driver/the-driver (:engine database))
                      database
                      test-table))
              "Should return error message when destroy fails"))))))

(deftest check-isolation-permissions-nil-table-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (testing "returns nil when test-table is nil (skips grant step)"
      (let [database (mt/db)]
        (is (nil? (driver/check-isolation-permissions
                   (driver/the-driver (:engine database))
                   database
                   nil))
            "Should succeed when test-table is nil")))))
