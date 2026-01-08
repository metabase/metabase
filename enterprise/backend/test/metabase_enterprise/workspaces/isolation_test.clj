(ns ^:mb/driver-tests metabase-enterprise.workspaces.isolation-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

(ws.tu/ws-fixtures!)

(set! *warn-on-reflection* true)

(def isolated-prefix @#'ws.u/isolated-prefix)

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
                             [(format "SHOW ROLES IN ACCOUNT LIKE '%s'" role-name)])
                 seq boolean)}))

(defmethod workspace-isolation-resources-exist? :sqlserver
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        login-name  (format "%s_%s_login" isolated-prefix (:id workspace))
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
    (ws.tu/with-workspaces! [workspace {:name "Test destroy isolation"}]
      (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                   :transform nil
                                   {:name   "Transform A"
                                    :source {:type "query" :query (mt/mbql-query orders {:limit 1})}
                                    :target {:database (mt/id)
                                             :schema   "analytics"
                                             :name     "table_a"}})
      (let [database (mt/db)]
        (testing "resources are creeated during workspace initialization"
          (let [resources (workspace-isolation-resources-exist? database workspace)]
            (is (every? true? (vals resources)))))

        (testing "destroy removes all isolation resources"
          (isolation/destroy-workspace-isolation! database workspace)
          (let [resources (workspace-isolation-resources-exist? database workspace)]
            (is (every? false? (vals resources)))))

        (testing "destroy is idempotent"
          (isolation/destroy-workspace-isolation! database workspace))))))
