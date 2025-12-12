(ns ^:mb/driver-tests metabase-enterprise.workspaces.isolation-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

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
                             ["SELECT 1 FROM pg_roles WHERE rolname = ?" username])
                 seq boolean)}))

(defmethod workspace-isolation-resources-exist? :h2
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        username    (ws.u/isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?" schema-name])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM INFORMATION_SCHEMA.USERS WHERE NAME = ?" username])
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
        login-name  (format "mb_isolation_%s_login" (:id workspace))
        username    (ws.u/isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    {:schema (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM sys.schemas WHERE name = ?" schema-name])
                 seq boolean)
     :user   (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM sys.database_principals WHERE name = ?" username])
                 seq boolean)
     :login  (-> (jdbc/query conn-spec
                             ["SELECT 1 FROM master.sys.server_principals WHERE name = ?" login-name])
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
    (let [workspace {:id (random-uuid)}
          database  (mt/db)]
      (testing "init creates isolation resources"
        (isolation/init-workspace-database-isolation! database workspace)
        (let [resources (workspace-isolation-resources-exist? database workspace)]
          (is (every? true? (vals resources))
              (str "All resources should exist after init: " resources))))

      (testing "destroy removes all isolation resources"
        (isolation/destroy-workspace-isolation! database workspace)
        (let [resources (workspace-isolation-resources-exist? database workspace)]
          (is (every? false? (vals resources))
              (str "All resources should be gone after destroy: " resources))))

      (testing "destroy is idempotent"
        (is (nil? (isolation/destroy-workspace-isolation! database workspace))
            "Calling destroy again should not throw")))))
