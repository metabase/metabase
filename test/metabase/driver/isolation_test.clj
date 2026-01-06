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
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
      (let [result    (driver/init-workspace-isolation! driver/*driver* (mt/db) workspace)
            workspace (merge workspace result)]
        (try
          (testing "init-workspace-isolation! creates resources and returns expected structure"
            (is (contains? result :schema))
            (is (contains? result :database_details))
            (when-let [resources (isolation-resources-exist? driver/*driver* (mt/db) workspace)]
              (testing "isolation resources were created"
                (is (every? true? (vals resources))
                    (str "All resources should be removed. Got: " resources)))))

          (testing "destroy-workspace-isolation! removes resources"
            (driver/destroy-workspace-isolation! driver/*driver* (mt/db) workspace)
            (when-let [resources (isolation-resources-exist? driver/*driver* (mt/db) workspace)]
              (testing "isolation resources were removed"
                (is (every? false? (vals resources))
                    (str "All resources should be removed. Got: " resources)))))

          (testing "destroy is idempotent - calling twice should not error"
            (is (some? (driver/destroy-workspace-isolation! driver/*driver* (mt/db) workspace))))

          (finally
            (try
              (driver/destroy-workspace-isolation! driver/*driver* (mt/db) workspace)
              (catch Exception _))))))))

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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Grant Permissions Tests                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest grant-workspace-read-access-test
  (mt/test-drivers (mt/normal-drivers-with-feature :isolation)
    (let [workspace {:id (rand-int 100000)}
          query-venues-table (fn []
                               (try
                                 (mt/run-mbql-query venues {:limit 1})
                                 true
                                 (catch Exception _e
                                   false)))]
      (try
        (let [result           (driver/init-workspace-isolation! driver/*driver* (mt/db) workspace)
              database_details (:database_details result)
              venues-table     (t2/select-one :model/Table :id (mt/id :venues))
              categories-table (t2/select-one :model/Table :id (mt/id :categories))
              tables           [{:schema (:schema venues-table) :name (:name venues-table)}
                                {:schema (:schema categories-table) :name (:name categories-table)}]
              workspace        (merge workspace result)]

          (testing "sanity check: isolated user cannot query tables before grant"
            (driver/with-swapped-connection-details (mt/id) database_details
              (is (false? (query-venues-table))
                  "Query should fail before granting access")))

          (testing "grant-workspace-read-access! succeeds for valid tables"
            (is (some? (driver/grant-workspace-read-access! driver/*driver* (mt/db) workspace tables))))

          (testing "isolated user can query tables after grant"
            (driver/with-swapped-connection-details (mt/id) database_details
              (is (true? (query-venues-table))
                  "Query should succeed after granting access"))))
        (finally
          (driver/destroy-workspace-isolation! driver/*driver* (mt/db) workspace))))))

(deftest check-isolation-permissions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :isolation)
    (testing "success case - check perms use the lower level isolation methods for checking"
      (let [init-called?    (atom false)
            grant-called?   (atom false)
            destroy-called? (atom false)]
        (mt/with-dynamic-fn-redefs [driver/init-workspace-isolation!
                                    (fn [_driver _database _workspace]
                                      (reset! init-called? true)
                                      {:schema "test_schema" :database_details {:user "test_user"}})
                                    driver/grant-workspace-read-access!
                                    (fn [_driver _database _workspace _tables]
                                      (reset! grant-called? true)
                                      nil)
                                    driver/destroy-workspace-isolation!
                                    (fn [_driver _database _workspace]
                                      (reset! destroy-called? true)
                                      nil)]
          (let [test-table {:schema "public" :name "test_table"}
                result     (driver/check-isolation-permissions driver/*driver* (mt/db) test-table)]
            (is (nil? result) "should return nil on success")
            (is @init-called? "init-workspace-isolation! should be called")
            (is @grant-called? "grant-workspace-read-access! should be called when test-table provided")
            (is @destroy-called? "destroy-workspace-isolation! should be called")))))

    (testing "failure case - returns error message when init fails"
      (mt/with-dynamic-fn-redefs [driver/init-workspace-isolation!
                                  (fn [_driver _database _workspace]
                                    (throw (ex-info "Permission denied: CREATE SCHEMA" {:reason :no-permission})))]
        (let [result (driver/check-isolation-permissions driver/*driver* (mt/db) nil)]
          (is (string? result) "should return an error message string on failure")
          (is (re-find #"CREATE SCHEMA" result) "error message should mention the failed operation"))))))
