(ns ^:mb/driver-tests metabase.driver.postgres.workspace-test
  "Tests for the Postgres workspace isolation methods against a real warehouse, run as the database's admin connection,
  whose login is not a superuser."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.postgres :as postgres]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(set! *warn-on-reflection* true)

(def ^:private db-name "workspace_isolation_test")

(def ^:private admin-login {:user "mb_ws_test_provisioner" :password "ProvisionerPassw0rd"})

(defn- superuser-details [] (mt/dbdef->connection-details :postgres :db {:database-name db-name}))

(defn- exec! [spec sqls]
  (doseq [sql sqls]
    (jdbc/execute! spec [sql])))

(defn- drop-role-if-exists! [spec role]
  (when (seq (jdbc/query spec ["SELECT 1 FROM pg_roles WHERE rolname = ?" role]))
    (exec! spec [(format "DROP OWNED BY \"%s\"" role) (format "DROP ROLE \"%s\"" role)])))

(defn- create-warehouse!
  "A fresh database with an admin login that is not a superuser, and `sales`, an input schema owned by
  `mb_ws_test_etl`, a role the admin login is a member of."
  [spec]
  (exec! spec ["DROP SCHEMA IF EXISTS sales, noselect CASCADE"])
  (doseq [role ["mb_ws_test_etl" (:user admin-login)]]
    (drop-role-if-exists! spec role))
  (exec! spec [(format "CREATE ROLE %s LOGIN CREATEROLE PASSWORD '%s'" (:user admin-login) (:password admin-login))
               (format "GRANT CREATE ON DATABASE %s TO %s" db-name (:user admin-login))
               "CREATE ROLE mb_ws_test_etl NOLOGIN"
               (format "GRANT mb_ws_test_etl TO %s" (:user admin-login))
               "CREATE SCHEMA sales AUTHORIZATION mb_ws_test_etl"
               "CREATE TABLE sales.orders (id int)"
               "ALTER TABLE sales.orders OWNER TO mb_ws_test_etl"
               "INSERT INTO sales.orders VALUES (1), (2)"
               ;; tables in `noselect` grant nothing to the admin login
               "CREATE SCHEMA noselect"
               "CREATE TABLE noselect.other (id int)"]))

(defn- do-with-warehouse!
  "Calls `(f superuser-spec database)`, with `database` the Lib metadata of a Database whose own login is the superuser
  and whose admin connection logs in as `admin-login`."
  [f]
  (mt/test-driver :postgres
    (mt/with-premium-features #{:workspaces}
      (tx/drop-if-exists-and-create-db! :postgres db-name)
      (let [spec (sql-jdbc.conn/connection-details->spec :postgres (superuser-details))]
        (create-warehouse! spec)
        (mt/with-temp [:model/Database {db-id :id} {:engine        :postgres
                                                    :details       (superuser-details)
                                                    :admin_details admin-login}]
          ;; teardown runs DROP OWNED in every database of the cluster the workspace user may connect to: here only this
          ;; test's, since the other databases of a shared test cluster are not this suite's to change
          (mt/with-dynamic-fn-redefs [postgres/connectable-databases (constantly [db-name])]
            (f spec (driver.u/lib-database db-id))))))))

(defn- workspace-with-details [database id]
  (let [workspace {:id id, :name (str "wsd-" id)}]
    (merge workspace (driver.conn/with-admin-connection
                       (driver/workspace-isolation-details :postgres database workspace)))))

(defn- provisioning [f]
  (driver.conn/with-admin-connection (f)))

(defn- new-workspace!
  "A workspace with its isolation details, and no role left over from an earlier run under its user name."
  [spec database id]
  (let [workspace (workspace-with-details database id)]
    (drop-role-if-exists! spec (-> workspace :database_details :user))
    workspace))

(defn- role-exists? [spec role]
  (boolean (seq (jdbc/query spec ["SELECT 1 FROM pg_roles WHERE rolname = ?" role]))))

(defn- schema-owner [spec schema]
  (:owner (first (jdbc/query spec ["SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = ?"
                                   schema]))))

(deftest methods-run-as-the-admin-login-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (workspace-with-details database 2001)
           user      (-> workspace :database_details :user)]
       (drop-role-if-exists! spec user)
       (driver.conn/with-admin-connection
         (testing "init creates the output schema as the admin login"
           (driver/init-workspace-isolation! :postgres database workspace)
           (is (= (:user admin-login) (schema-owner spec (:schema workspace))))
           (is (role-exists? spec user)))
         (testing "grant reads the input schema with the admin login's grant options"
           (driver/grant-workspace-read-access! :postgres database workspace ["sales"])
           (is (= [{:count 2}]
                  (jdbc/query (sql-jdbc.conn/connection-details->spec
                               :postgres (merge (superuser-details) (:database_details workspace)))
                              ["SELECT count(*) FROM sales.orders"]))))
         (testing "destroy drops the output schema and the user"
           (driver/destroy-workspace-isolation! :postgres database workspace)
           (is (nil? (schema-owner spec (:schema workspace))))
           (is (not (role-exists? spec user)))))))))

(defn- user-spec [workspace]
  (sql-jdbc.conn/connection-details->spec :postgres (merge (superuser-details) (:database_details workspace))))

(defn- as-workspace-user
  "Runs `sql` as the workspace user; returns the rows, the update count, or the error message."
  [workspace sql]
  (try
    (if (str/starts-with? sql "SELECT")
      (jdbc/query (user-spec workspace) [sql])
      (jdbc/execute! (user-spec workspace) [sql]))
    (catch java.sql.SQLException e
      (ex-message e))))

(defn- hold-session!
  "Opens a session as the workspace user, runs `sqls` in a transaction it leaves open, and returns the connection."
  ^java.sql.Connection [workspace sqls]
  ;; a raw connection is the point here: the session must stay open across the code under test
  (let [{:keys [host port db]} (superuser-details)
        {:keys [user password]} (:database_details workspace)
        conn (java.sql.DriverManager/getConnection (format "jdbc:postgresql://%s:%s/%s" host port db)
                                                   ^String user ^String password)]
    (.setAutoCommit conn false)
    (with-open [stmt (.createStatement conn)]
      (doseq [^String sql sqls]
        (.execute stmt sql)))
    conn))

(defn- server-version [spec]
  (:v (first (jdbc/query spec ["SELECT current_setting('server_version_num')::int AS v"]))))

(defn- grants-to
  "Every ACL entry naming `role` on a schema or relation."
  [spec role]
  (jdbc/query spec [(str "SELECT 'schema' AS kind, nspname::text AS name FROM pg_namespace n, aclexplode(n.nspacl) a "
                         "WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = ?) "
                         "UNION ALL SELECT 'relation', relname::text FROM pg_class c, aclexplode(c.relacl) a "
                         "WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = ?) ORDER BY 1, 2")
                    role role]))

(defn- within-a-minute
  "Calls `f` and returns what it returns, or `::timed-out` when it takes longer than a minute, as a statement waiting on
  a lock without a timeout does."
  [f]
  (deref (future (f)) 60000 ::timed-out))

(defn- provisioned!
  "Inits `workspace` and grants it read access to `sales`, as the admin login."
  [database workspace]
  (provisioning #(driver/init-workspace-isolation! :postgres database workspace))
  (provisioning #(driver/grant-workspace-read-access! :postgres database workspace ["sales"])))

(deftest init-refuses-an-existing-user-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2101)
           user      (-> workspace :database_details :user)]
       (provisioning #(driver/init-workspace-isolation! :postgres database workspace))
       (testing "a second init of the same workspace throws a 409 that tells the caller not to clean up"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/init-workspace-isolation!
                                              :postgres database
                                              (assoc-in workspace [:database_details :password] "AnotherParents0Password")))))]
           (is (= {:status-code 409, :workspace/cleanup? false, :user user} (ex-data e)))))
       (testing "the existing user is unchanged: it still logs in with its own password"
         (is (= [{:one 1}] (as-workspace-user workspace "SELECT 1 AS one"))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))))

(deftest concurrent-init-test
  (do-with-warehouse!
   (fn [spec database]
     (testing "two inits of one workspace: one creates the user, the other gets the 409 that forbids cleanup"
       (dotimes [_ 5]
         (let [workspace (new-workspace! spec database 2102)
               latch     (java.util.concurrent.CountDownLatch. 1)
               inits     (vec (for [_ (range 2)]
                                (future
                                  (.await latch)
                                  (try
                                    (provisioning #(driver/init-workspace-isolation! :postgres database workspace))
                                    :created
                                    (catch clojure.lang.ExceptionInfo e
                                      (ex-data e))))))
               _         (.countDown latch)
               results   (mapv #(deref % 60000 :timed-out) inits)]
           (is (= #{:created {:status-code 409, :workspace/cleanup? false, :user (-> workspace :database_details :user)}}
                  (set results)))
           (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))))))

(deftest init-keeps-the-password-out-of-statements-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2103)
           password  (-> workspace :database_details :password)
           messages  (fn [^Throwable t]
                       (->> t
                            (iterate #(or (ex-cause %) (when (instance? java.sql.SQLException %)
                                                         (.getNextException ^java.sql.SQLException %))))
                            (take-while some?)
                            (map ex-message)))]
       (exec! spec [(format "ALTER ROLE %s NOCREATEROLE" (:user admin-login))])
       (testing "the statements sent to the server never carry the password, which the server logs when one fails"
         ;; the batch wrapper's message quotes the statement as sent
         (mt/with-dynamic-fn-redefs [driver.u/batch-exception identity]
           (let [e (is (thrown? java.sql.SQLException
                                (provisioning #(driver/init-workspace-isolation! :postgres database workspace))))]
             (is (some #(str/includes? % "CREATE USER") (messages e)))
             (is (not-any? #(str/includes? % "PASSWORD") (messages e)))
             (is (not-any? #(str/includes? % password) (messages e))))))
       (exec! spec [(format "ALTER ROLE %s CREATEROLE" (:user admin-login))])
       (provisioning #(driver/init-workspace-isolation! :postgres database workspace))
       (testing "the password is stored as a SCRAM verifier and logs in"
         (is (str/starts-with? (:rolpassword (first (jdbc/query spec ["SELECT rolpassword FROM pg_authid WHERE rolname = ?"
                                                                      (-> workspace :database_details :user)])))
                               "SCRAM-SHA-256$"))
         (is (= [{:one 1}] (as-workspace-user workspace "SELECT 1 AS one"))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))))

(deftest destroy-ends-the-workspace-users-sessions-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2104)
           user      (-> workspace :database_details :user)
           output    (:schema workspace)]
       (provisioned! database workspace)
       (is (= [0] (as-workspace-user workspace (format "CREATE TABLE \"%s\".t (x int)" output))))
       (let [reader (hold-session! workspace ["SELECT count(*) FROM sales.orders"])
             locker (hold-session! workspace [(format "LOCK TABLE \"%s\".t IN ACCESS SHARE MODE" output)])]
         (try
           (testing "destroy ends an open session and one holding a lock on an output table, then drops everything"
             (is (nil? (within-a-minute #(provisioning (fn [] (driver/destroy-workspace-isolation! :postgres database workspace))))))
             (is (not (role-exists? spec user)))
             (is (nil? (schema-owner spec output)))
             (doseq [^java.sql.Connection conn [reader locker]]
               (is (thrown? java.sql.SQLException
                            (with-open [stmt (.createStatement conn)]
                              (.execute stmt "SELECT 1"))))))
           (finally
             (doseq [^java.sql.Connection conn [reader locker]]
               (.close conn)))))))))

(deftest destroy-fails-closed-while-a-session-stays-open-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2105)
           user      (-> workspace :database_details :user)]
       (provisioned! database workspace)
       (let [session (hold-session! workspace ["SELECT 1"])]
         (try
           (testing "destroy throws a 409 naming the open session, after taking away the login and the input grants"
             (let [e (is (thrown? clojure.lang.ExceptionInfo
                                  ;; a session this login could not end, as when another role's membership was revoked
                                  (mt/with-dynamic-fn-redefs [postgres/end-sessions! (constantly nil)]
                                    (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace)))))]
               (is (= {:status-code 409, :user user, :sessions 1} (ex-data e)))
               (is (re-find #"still open" (ex-message e))))
             (is (= [{:rolcanlogin false}] (jdbc/query spec ["SELECT rolcanlogin FROM pg_roles WHERE rolname = ?" user])))
             (is (= [{:kind "schema", :name (:schema workspace)}] (distinct (grants-to spec user))))
             (is (re-find #"permission denied" (with-open [stmt (.createStatement session)]
                                                 (try
                                                   (.executeQuery stmt "SELECT count(*) FROM sales.orders")
                                                   "read"
                                                   (catch java.sql.SQLException e
                                                     (ex-message e)))))))
           (finally
             (.close session))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))))

(deftest destroy-while-the-user-holds-its-own-role-row-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2106)
           user      (-> workspace :database_details :user)]
       (provisioned! database workspace)
       (when (> 160000 (server-version spec))
         ;; before Postgres 16 the user may also have taken away the membership that lets teardown end its sessions
         (is (= [0] (as-workspace-user workspace (format "REVOKE \"%s\" FROM %s" user (:user admin-login))))))
       (let [session (hold-session! workspace ["ALTER ROLE CURRENT_USER PASSWORD 'HeldOpenPassw0rd'"])]
         (try
           (testing "an uncommitted ALTER ROLE on itself, held open in another session, does not stop destroy"
             (with-redefs [postgres/workspace-lock-timeout "2s"]
               (is (nil? (within-a-minute #(provisioning (fn [] (driver/destroy-workspace-isolation! :postgres database workspace)))))))
             (is (not (role-exists? spec user))))
           (finally
             (.close session))))))))

(deftest destroy-restores-its-membership-and-drops-other-members-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2107)
           user      (-> workspace :database_details :user)
           members   #(map :member (jdbc/query spec [(str "SELECT m.rolname AS member FROM pg_auth_members am "
                                                          "JOIN pg_roles r ON r.oid = am.roleid "
                                                          "JOIN pg_roles m ON m.oid = am.member WHERE r.rolname = ?")
                                                     user]))]
       (drop-role-if-exists! spec "mb_ws_test_accomplice")
       (exec! spec ["CREATE ROLE mb_ws_test_accomplice NOLOGIN"])
       (provisioned! database workspace)
       (is (= [0] (as-workspace-user workspace "DO $$BEGIN PERFORM lo_create(0); END$$")))
       (when (> 160000 (server-version spec))
         (testing "before Postgres 16, the user can revoke the admin login's membership and share itself"
           (is (= [0] (as-workspace-user workspace (format "REVOKE \"%s\" FROM %s" user (:user admin-login)))))
           (is (= [0] (as-workspace-user workspace (format "GRANT \"%s\" TO mb_ws_test_accomplice" user))))
           (is (= ["mb_ws_test_accomplice"] (members)))))
       ;; a grant the admin login cannot revoke stops destroy at DROP USER, after the lock-out has committed
       (exec! spec [(format "GRANT SELECT ON noselect.other TO \"%s\"" user)])
       (testing "a destroy stopped at DROP USER has already restored this login's membership and dropped the other"
         (is (thrown? clojure.lang.ExceptionInfo
                      (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))
         (is (= [(:user admin-login)] (distinct (members)))))
       (exec! spec [(format "REVOKE SELECT ON noselect.other FROM \"%s\"" user)])
       (testing "destroy restores its membership, drops the other, and drops the user"
         (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))
         (is (not (role-exists? spec user)))
         (is (empty? (jdbc/query spec [(str "SELECT 1 FROM pg_auth_members am JOIN pg_roles m ON m.oid = am.member "
                                            "WHERE m.rolname = 'mb_ws_test_accomplice'")]))))
       (exec! spec ["DROP ROLE mb_ws_test_accomplice"])))))

(deftest a-failed-destroy-leaves-the-user-locked-out-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2108)
           user      (-> workspace :database_details :user)]
       (provisioned! database workspace)
       ;; a grant from a role the admin login cannot act for, which neither REVOKE nor DROP OWNED removes
       (exec! spec [(format "GRANT SELECT ON noselect.other TO \"%s\"" user)])
       (testing "destroy fails loudly, but the user can no longer log in and keeps none of the admin login's grants"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))]
           (is (= {:status-code 409, :user user} (ex-data e))))
         (is (role-exists? spec user))
         (is (re-find #"FATAL" (as-workspace-user workspace "SELECT 1 AS one")))
         (is (= [{:rolcanlogin false}] (jdbc/query spec ["SELECT rolcanlogin FROM pg_roles WHERE rolname = ?" user])))
         (is (= [{:kind "relation", :name "other"}] (grants-to spec user))))
       (exec! spec [(format "REVOKE SELECT ON noselect.other FROM \"%s\"" user)])
       (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))))

(def ^:private other-db-name "workspace_isolation_other")

(defn- other-db-details [] (mt/dbdef->connection-details :postgres :db {:database-name other-db-name}))

(deftest destroy-drops-what-the-user-made-in-another-database-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2109)
           user      (-> workspace :database_details :user)]
       (tx/drop-if-exists-and-create-db! :postgres other-db-name)
       (mt/with-dynamic-fn-redefs [postgres/connectable-databases (constantly [db-name other-db-name])]
         (provisioned! database workspace)
         (testing "a large object the user makes in another database it may connect to does not stop destroy"
           (is (= [0] (jdbc/execute! (sql-jdbc.conn/connection-details->spec
                                      :postgres (merge (other-db-details) (:database_details workspace)))
                                     ["DO $$BEGIN PERFORM lo_create(0); END$$"])))
           (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))
           (is (not (role-exists? spec user)))))))))

(deftest destroy-reports-objects-in-another-database-test
  (do-with-warehouse!
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2110)
           user      (-> workspace :database_details :user)
           other     (sql-jdbc.conn/connection-details->spec :postgres (other-db-details))]
       (tx/drop-if-exists-and-create-db! :postgres other-db-name)
       (provisioned! database workspace)
       ;; in a database teardown does not sweep: here every database but this test's
       (exec! other ["CREATE TABLE planted (x int)" (format "ALTER TABLE planted OWNER TO \"%s\"" user)])
       (testing "a DROP USER that fails on objects elsewhere is a 409 naming them"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))]
           (is (= {:status-code 409, :user user} (ex-data e)))
           (is (re-find #"(?s)cannot be dropped yet: .*objects? in database workspace_isolation_other" (ex-message e)))))
       (exec! other ["DROP TABLE planted"])
       (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))
       (is (not (role-exists? spec user)))))))

(deftest destroy-maps-a-refused-drop-to-a-409-test
  (testing "a DROP OWNED or DROP USER this login may not run is a 409 saying what to grant"
    (let [e (#'postgres/drop-user-error "mb__isolation_abcde_1"
                                        (java.sql.SQLException. "ERROR: permission denied to drop objects" "42501"))]
      (is (= {:status-code 409, :user "mb__isolation_abcde_1"} (ex-data e)))
      (is (str/includes? (ex-message e) "`GRANT \"mb__isolation_abcde_1\" TO <login>`")))))
