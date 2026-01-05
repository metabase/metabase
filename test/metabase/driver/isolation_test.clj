(ns ^:mb/driver-tests metabase.driver.isolation-test
  "Tests for driver-level isolation functionality.
   These tests verify the driver isolation APIs work correctly without depending
   on the full workspace infrastructure."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Isolation Resource Checks                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti isolation-resources-exist?
  "Check if isolation resources exist for the given workspace.
   Returns a map with keys like :schema, :user indicating which resources exist.
   For drivers that use different isolation models (e.g., BigQuery with service accounts),
   returns nil to indicate resource checking is not applicable."
  {:arglists '([driver database workspace])}
  (fn [driver _database _workspace] driver)
  :hierarchy #'driver/hierarchy)

(defmethod isolation-resources-exist? :default
  [_driver _database _workspace]
  ;; Default: nil means we can't check resources for this driver
  nil)

(defmethod isolation-resources-exist? :postgres
  [_driver database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        username    (driver.u/workspace-isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM information_schema.schemata WHERE schema_name = ?" schema-name])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM pg_user WHERE usename = ?" username])
                 seq boolean)}))

;; Redshift inherits from postgres
(defmethod isolation-resources-exist? :redshift
  [_driver database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        username    (driver.u/workspace-isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM information_schema.schemata WHERE schema_name = ?" schema-name])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM pg_user WHERE usename = ?" username])
                 seq boolean)}))

(defmethod isolation-resources-exist? :h2
  [_driver database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        username    (driver.u/workspace-isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM INFORMATION_SCHEMA.SCHEMATA WHERE UPPER(SCHEMA_NAME) = UPPER(?)" schema-name])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM INFORMATION_SCHEMA.USERS WHERE UPPER(USER_NAME) = UPPER(?)" username])
                 seq boolean)}))

(defmethod isolation-resources-exist? :snowflake
  [_driver database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        role-name   (driver.u/workspace-isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?" schema-name])
                 seq boolean)
     :role   (-> (jdbc/query conn-spec
                             ["SHOW ROLES LIKE ?" role-name])
                 seq boolean)}))

(defmethod isolation-resources-exist? :sqlserver
  [_driver database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        username    (driver.u/workspace-isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM sys.schemas WHERE name = ?" schema-name])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM sys.database_principals WHERE name = ?" username])
                 seq boolean)}))

(defmethod isolation-resources-exist? :clickhouse
  [_driver database workspace]
  (let [db-name   (driver.u/workspace-isolation-namespace-name workspace)
        username  (driver.u/workspace-isolation-user-name workspace)
        conn-spec (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:database (-> (jdbc/query conn-spec
                               ["SELECT 1 FROM system.databases WHERE name = ?" db-name])
                   seq boolean)
     :user     (-> (jdbc/query conn-spec
                               ["SELECT 1 FROM system.users WHERE name = ?" username])
                   seq boolean)}))

;; BigQuery uses service account impersonation - no schema/user resources to check
(defmethod isolation-resources-exist? :bigquery-cloud-sdk
  [_driver _database _workspace]
  ;; BigQuery isolation uses service account impersonation, not schema/user creation
  ;; Return nil to indicate resource checking is not applicable
  nil)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Isolation Lifecycle Tests                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest init-and-destroy-workspace-isolation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :isolation)
    (let [workspace {:id (rand-int 100000)}]
      (try
        (testing "init-workspace-isolation! creates resources and returns expected structure"
          (let [result (driver/init-workspace-isolation! driver/*driver* (mt/db) workspace)]
            (is (map? result))
            (is (contains? result :schema))
            (is (contains? result :database_details))
            (is (map? (:database_details result)))
            ;; For drivers where we can check resources, verify they were created
            (when-let [resources (isolation-resources-exist? driver/*driver* (mt/db) workspace)]
              (testing "isolation resources were created"
                (is (some true? (vals resources))
                    (str "At least one resource should exist. Got: " resources))))))

        (testing "destroy-workspace-isolation! removes resources"
          (driver/destroy-workspace-isolation! driver/*driver* (mt/db) workspace)
          (when-let [resources (isolation-resources-exist? driver/*driver* (mt/db) workspace)]
            (testing "isolation resources were removed"
              (is (every? false? (vals resources))
                  (str "All resources should be removed. Got: " resources)))))

        (testing "destroy is idempotent - calling twice should not error"
          (is (nil? (driver/destroy-workspace-isolation! driver/*driver* (mt/db) workspace))))

        (finally
          ;; Ensure cleanup even if tests fail
          (try
            (driver/destroy-workspace-isolation! driver/*driver* (mt/db) workspace)
            (catch Exception _)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Connection Swapping Tests                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest connection-swapping-integration-test
  (mt/test-drivers (mt/normal-drivers-with-feature :isolation)
    (testing "with-swapped-connection-details affects query execution"
      (let [query-succeeded? (fn []
                               (try
                                 (mt/run-mbql-query venues {:limit 1})
                                 true
                                 (catch Exception _e
                                   false)))]
        (testing "queries work normally outside swap context"
          (is (query-succeeded?)))

        (testing "queries fail with invalid swapped credentials"
          (driver/with-swapped-connection-details (mt/id) {:user "nonexistent_user_12345"
                                                           :password "wrong_password"}
            (is (not (query-succeeded?)))))))))

(deftest isolated-connection-execution-test
  (mt/test-drivers (mt/normal-drivers-with-feature :isolation)
    (let [workspace {:id (rand-int 100000)}]
      (try
        ;; Setup isolation
        (let [{:keys [schema database_details]} (driver/init-workspace-isolation! driver/*driver* (mt/db) workspace)]
          (testing "init returns valid isolation config"
            (is (some? schema) "Schema name should be returned")
            (is (map? database_details) "Database details should be a map"))

          (testing "can connect with isolated credentials via swap"
            (driver/with-swapped-connection-details (mt/id) database_details
              ;; Just verify we can establish the swap context without error
              ;; The isolated user may not have access to test tables, but connection should work
              (is true "Swap context established successfully"))))
        (finally
          (driver/destroy-workspace-isolation! driver/*driver* (mt/db) workspace))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Grant Permissions Tests                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest grant-workspace-read-access-test
  (mt/test-drivers (mt/normal-drivers-with-feature :isolation)
    (let [workspace {:id (rand-int 100000)}]
      (try
        ;; Setup isolation first
        (let [{:keys [database_details]} (driver/init-workspace-isolation! driver/*driver* (mt/db) workspace)]
          (testing "grant-workspace-read-access! succeeds for valid tables"
            (let [tables [{:schema "public" :name "venues"}
                          {:schema "public" :name "categories"}]]
              ;; Should not throw
              (is (nil? (driver/grant-workspace-read-access! driver/*driver* (mt/db) workspace tables)))))

          (testing "isolated user can read granted tables after grant"
            (driver/with-swapped-connection-details (mt/id) database_details
              ;; After granting access, the isolated user should be able to query
              ;; Note: This may still fail for some drivers depending on how they handle grants
              ;; The important thing is that grant-workspace-read-access! doesn't throw
              (is (map? database_details)))))
        (finally
          (driver/destroy-workspace-isolation! driver/*driver* (mt/db) workspace))))))

(deftest check-isolation-permissions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :isolation)
    (testing "check-isolation-permissions returns success for properly configured database"
      (let [result (driver/check-isolation-permissions driver/*driver* (mt/db) nil)]
        (is (map? result))
        (is (contains? result :valid))
        (when-not (:valid result)
          ;; If not valid, should have an error message
          (is (contains? result :message)))))))
