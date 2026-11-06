(ns ^:mb/driver-tests metabase.driver.postgres.workspace-provisioning-check-test
  "Tests for the Postgres [[driver/check-workspace-provisioning!]] against a real warehouse."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(set! *warn-on-reflection* true)

(def ^:private db-name "workspace_provisioning_check_test")

(def ^:private login {:user "mb_ws_check_login" :password "CheckLoginPassw0rd"})

(defn- superuser-details [] (mt/dbdef->connection-details :postgres :db {:database-name db-name}))

(defn- exec! [spec & sqls]
  (doseq [sql sqls]
    (jdbc/execute! spec [sql])))

(defn- do-with-login!
  "Calls `(f spec database)` with `database` a Database whose provisioning login is [[login]], created with no
  privileges, and `spec` the superuser's spec."
  [f]
  (mt/test-driver :postgres
    (tx/drop-if-exists-and-create-db! :postgres db-name)
    (let [spec (sql-jdbc.conn/connection-details->spec :postgres (superuser-details))]
      (when (seq (jdbc/query spec ["SELECT 1 FROM pg_roles WHERE rolname = ?" (:user login)]))
        (exec! spec (format "DROP OWNED BY %s" (:user login)) (format "DROP ROLE %s" (:user login))))
      (exec! spec (format "CREATE ROLE %s LOGIN PASSWORD '%s'" (:user login) (:password login)))
      (mt/with-temp [:model/Database {db-id :id} {:engine :postgres, :details (superuser-details)}]
        (mt/with-dynamic-fn-redefs [driver.conn/database-workspace-provisioning-details (constantly login)]
          (f spec (driver.u/lib-database db-id)))))))

(defn- check! [database]
  (try
    (driver/check-workspace-provisioning! :postgres database)
    (catch clojure.lang.ExceptionInfo e
      {:status-code (:status-code (ex-data e)), :message (ex-message e)})))

(deftest check-workspace-provisioning-test
  (do-with-login!
   (fn [spec database]
     (testing "no privileges: a 412 naming CREATEROLE and CREATE on the database, with the SQL for each"
       (is (=? {:status-code 412
                :message     #(and (str/includes? % (format "ALTER ROLE \"%s\" CREATEROLE" (:user login)))
                                   (str/includes? % (format "GRANT CREATE ON DATABASE \"%s\" TO \"%s\""
                                                            db-name (:user login))))}
               (check! database))))
     (testing "CREATEROLE alone: the 412 names only CREATE on the database"
       (exec! spec (format "ALTER ROLE %s CREATEROLE" (:user login)))
       (is (=? {:status-code 412
                :message     #(and (not (str/includes? % "CREATEROLE"))
                                   (str/includes? % "GRANT CREATE ON DATABASE"))}
               (check! database))))
     (testing "both: nil"
       (exec! spec (format "GRANT CREATE ON DATABASE %s TO %s" db-name (:user login)))
       (is (nil? (check! database)))))))

(deftest check-workspace-provisioning-ignores-search-path-test
  (testing "a pg_roles planted ahead of pg_catalog on the login's search_path cannot vouch for it"
    (do-with-login!
     (fn [spec database]
       (exec! spec
              (format "GRANT CREATE ON DATABASE %s TO %s" db-name (:user login))
              "CREATE SCHEMA planted"
              (str "CREATE VIEW planted.pg_roles AS SELECT rolname, rolsuper, true AS rolcreaterole "
                   "FROM pg_catalog.pg_roles")
              (format "GRANT USAGE ON SCHEMA planted TO %s" (:user login))
              (format "GRANT SELECT ON planted.pg_roles TO %s" (:user login))
              (format "ALTER ROLE %s SET search_path = planted, pg_catalog" (:user login)))
       (is (=? {:status-code 412, :message #(str/includes? % "CREATEROLE")}
               (check! database)))))))

(deftest audit-database-is-refused-test
  (testing "the workspace methods refuse the audit database, whose pool is Metabase's own app DB"
    (do-with-login!
     (fn [_spec database]
       (is (= {:status-code 400, :message "Workspaces are not supported on the audit database."}
              (check! (assoc database :is-audit true))))))))
