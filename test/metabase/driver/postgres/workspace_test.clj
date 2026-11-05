(ns ^:mb/driver-tests metabase.driver.postgres.workspace-test
  "Tests for the Postgres workspace isolation methods, against a real warehouse: each runs inside the
  `:workspace-provisioning` connection scope as a provisioning login that is not a superuser."
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

(def ^:private db-name "workspace_isolation_test")

(def ^:private provisioner {:user "mb_ws_test_provisioner" :password "ProvisionerPassw0rd"})

(defn- superuser-details [] (mt/dbdef->connection-details :postgres :db {:database-name db-name}))

(defn- exec! [spec sqls]
  (doseq [sql sqls]
    (jdbc/execute! spec [sql])))

(defn- create-warehouse!
  "A fresh database holding: `sales`, owned by `mb_ws_test_etl` and writable by `mb_ws_test_loader` (the provisioning
  login is a member of both); `fresh`, owned by `mb_ws_test_etl` and still empty; and one schema per precondition
  the provisioning login fails."
  [spec]
  (exec! spec ["DROP SCHEMA IF EXISTS sales, fresh, pubcreate, pubwrite, nogrant, noselect, foreignowner, managed, loose CASCADE"])
  (doseq [role ["mb_ws_test_etl" "mb_ws_test_loader" "mb_ws_test_other" "mb_ws_test_super" (:user provisioner)]]
    (when (seq (jdbc/query spec ["SELECT 1 FROM pg_roles WHERE rolname = ?" role]))
      (exec! spec [(format "DROP OWNED BY %s" role) (format "DROP ROLE %s" role)])))
  (exec! spec
         [(format "CREATE ROLE %s LOGIN CREATEROLE PASSWORD '%s'" (:user provisioner) (:password provisioner))
          (format "GRANT CREATE ON DATABASE %s TO %s" db-name (:user provisioner))
          "CREATE ROLE mb_ws_test_etl NOLOGIN"
          "CREATE ROLE mb_ws_test_other NOLOGIN"
          "CREATE ROLE mb_ws_test_loader NOLOGIN"
          (format "GRANT mb_ws_test_etl, mb_ws_test_loader TO %s" (:user provisioner))
          "CREATE SCHEMA sales AUTHORIZATION mb_ws_test_etl"
          "GRANT USAGE, CREATE ON SCHEMA sales TO mb_ws_test_loader"
          "CREATE TABLE sales.orders (id int)"
          "ALTER TABLE sales.orders OWNER TO mb_ws_test_etl"
          "INSERT INTO sales.orders VALUES (1), (2)"
          "CREATE SCHEMA fresh AUTHORIZATION mb_ws_test_etl"
          "CREATE SCHEMA pubcreate"
          "GRANT CREATE ON SCHEMA pubcreate TO PUBLIC"
          (format "GRANT USAGE ON SCHEMA pubcreate TO %s WITH GRANT OPTION" (:user provisioner))
          "CREATE SCHEMA nogrant"
          "CREATE SCHEMA noselect"
          (format "GRANT USAGE ON SCHEMA noselect TO %s WITH GRANT OPTION" (:user provisioner))
          "CREATE TABLE noselect.secret (id int)"
          "CREATE SCHEMA foreignowner AUTHORIZATION mb_ws_test_etl"
          (format "GRANT USAGE ON SCHEMA foreignowner TO %s WITH GRANT OPTION" (:user provisioner))
          "GRANT USAGE ON SCHEMA foreignowner TO mb_ws_test_other"
          "CREATE TABLE foreignowner.t (id int)"
          "ALTER TABLE foreignowner.t OWNER TO mb_ws_test_other"
          (format "GRANT SELECT ON foreignowner.t TO %s WITH GRANT OPTION" (:user provisioner))
          "CREATE SCHEMA pubwrite AUTHORIZATION mb_ws_test_etl"
          "CREATE TABLE pubwrite.audit (id int)"
          "ALTER TABLE pubwrite.audit OWNER TO mb_ws_test_etl"
          "GRANT INSERT ON pubwrite.audit TO PUBLIC"
          "CREATE ROLE mb_ws_test_super SUPERUSER NOLOGIN"
          "CREATE SCHEMA managed AUTHORIZATION mb_ws_test_etl"
          "CREATE TABLE managed.t (id int)"
          "ALTER TABLE managed.t OWNER TO mb_ws_test_super"
          (format "GRANT SELECT ON managed.t TO %s WITH GRANT OPTION" (:user provisioner))
          "CREATE SCHEMA loose"
          "GRANT USAGE, CREATE ON SCHEMA loose TO PUBLIC"]))

(defn- do-with-warehouse!
  "Calls `(f superuser-spec database)` with `database` the Lib metadata of a Database whose own login is the
  superuser and whose provisioning login is [[provisioner]]."
  [f]
  (mt/test-driver :postgres
    (tx/drop-if-exists-and-create-db! :postgres db-name)
    (let [spec (sql-jdbc.conn/connection-details->spec :postgres (superuser-details))]
      (create-warehouse! spec)
      (mt/with-temp [:model/Database {db-id :id} {:engine :postgres, :details (superuser-details)}]
        (mt/with-dynamic-fn-redefs [driver.conn/database-workspace-provisioning-details (constantly provisioner)]
          (f spec (driver.u/lib-database db-id)))))))

(defn- provisioning [f]
  (driver.conn/with-workspace-provisioning-connection (f)))

(defn- new-wsd
  "A `workspace_database` row with a new isolation id and its isolation details."
  [database wsd-id]
  (let [wsd {:id wsd-id, :isolation_id (driver.u/random-isolation-id)}]
    (assoc wsd :database_details (provisioning #(driver/workspace-isolation-details :postgres database wsd)))))

(defn- without-password [wsd]
  (update wsd :database_details dissoc :password))

(defn- scratch-name [database wsd schema-id main]
  (provisioning #(driver/workspace-scratch-namespace :postgres database wsd {:id schema-id :main_schema main})))

(defn- role-exists? [spec role]
  (boolean (seq (jdbc/query spec ["SELECT 1 FROM pg_roles WHERE rolname = ?" role]))))

(defn- schema-owner [spec schema]
  (:owner (first (jdbc/query spec ["SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = ?"
                                   schema]))))

(defn- grants-to
  "Every ACL entry naming `role` on a schema, relation or default privilege."
  [spec role]
  (jdbc/query spec [(str "SELECT 'schema' AS kind, nspname::text AS name FROM pg_namespace n, aclexplode(n.nspacl) a "
                         "WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = ?) "
                         "UNION ALL SELECT 'relation', relname::text FROM pg_class c, aclexplode(c.relacl) a "
                         "WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = ?) "
                         "UNION ALL SELECT 'default', defaclnamespace::regnamespace::text FROM pg_default_acl d, "
                         "aclexplode(d.defaclacl) a WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = ?)")
                    role role role]))

(defn- as-workspace-user
  "Runs `sql` as the workspace user; returns the rows, the update count, or the error message."
  [wsd sql]
  (let [spec (sql-jdbc.conn/connection-details->spec :postgres (merge (superuser-details) (:database_details wsd)))]
    (try
      (if (str/starts-with? sql "SELECT")
        (jdbc/query spec [sql])
        (jdbc/execute! spec [sql]))
      (catch java.sql.SQLException e
        (ex-message e)))))

(deftest workspace-isolation-details-test
  (do-with-warehouse!
   (fn [_spec database]
     (let [wsd     {:id 17, :isolation_id "ab2c3d4e"}
           details (provisioning #(driver/workspace-isolation-details :postgres database wsd))]
       (testing "the user is named for the isolation id alone"
         (is (= "mb__isolation_ab2c3d4e" (:user details))))
       (testing "the password is 32 characters from [A-Za-z0-9]"
         (is (re-matches #"[A-Za-z0-9]{32}" (:password details))))
       (testing "the scratch namespace extends the user name, and fits Postgres's 63-character limit"
         (is (= "mb__isolation_ab2c3d4e_s42_sales" (scratch-name database wsd 42 "sales")))
         (is (= 63 (count (scratch-name database wsd 42 (apply str (repeat 80 "x")))))))
       (testing "a missing or malformed isolation id is refused"
         (doseq [bad [nil "" "AB2C3D4E" "ab2c3d4" "ab2c3d4e%"]]
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid workspace isolation id"
                                 (provisioning #(driver/workspace-isolation-details :postgres database
                                                                                    (assoc wsd :isolation_id bad)))))))))))

(deftest workspace-lifecycle-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd     (new-wsd database 1001)
           user    (-> wsd :database_details :user)
           scratch (scratch-name database wsd 1 "sales")]
       (testing "init creates the workspace user with its password"
         (is (nil? (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))
         (is (role-exists? spec user))
         (is (= [{:one 1}] (as-workspace-user wsd "SELECT 1 AS one"))))
       (testing "add creates the scratch schema as the provisioning login"
         (is (nil? (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" scratch))))
         (is (= (:user provisioner) (schema-owner spec scratch))))
       (testing "the workspace user reads the main schema, including tables created there later"
         (exec! spec ["SET ROLE mb_ws_test_etl; CREATE TABLE sales.later (id int); RESET ROLE"])
         (is (= [{:count 2}] (as-workspace-user wsd "SELECT count(*) FROM sales.orders")))
         (is (= [{:count 0}] (as-workspace-user wsd "SELECT count(*) FROM sales.later"))))
       (testing "the workspace user writes to scratch and nowhere in the main schema"
         (is (= [2] (as-workspace-user wsd (format "CREATE TABLE %s.daily AS SELECT * FROM sales.orders" scratch))))
         (is (re-find #"permission denied" (as-workspace-user wsd "CREATE TABLE sales.evil (id int)")))
         (is (re-find #"permission denied" (as-workspace-user wsd "INSERT INTO sales.orders VALUES (3)"))))
       (testing "remove drops scratch and leaves no grant on the main schema; a second remove is a no-op"
         (dotimes [_ 2]
           (is (nil? (provisioning #(driver/remove-workspace-schema! :postgres database (without-password wsd)
                                                                     "sales" scratch))))
           (is (nil? (schema-owner spec scratch)))
           (is (= [] (grants-to spec user)))))
       (testing "destroy drops every scratch schema, its tables, and the user; a second destroy is a no-op"
         (let [scratch-2 (scratch-name database wsd 2 "sales")]
           (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" scratch-2))
           (as-workspace-user wsd (format "CREATE TABLE %s.t AS SELECT 1 AS x" scratch-2))
           (dotimes [_ 2]
             (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database (without-password wsd)))))
             (is (nil? (schema-owner spec scratch-2)))
             (is (not (role-exists? spec user))))))))))

(deftest add-workspace-schema-preconditions-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1002)
           user (-> wsd :database_details :user)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (doseq [[schema message extra]
               [["pubcreate"    #"Run `REVOKE CREATE ON SCHEMA \"pubcreate\" FROM PUBLIC`" {}]
                ["pubwrite"     #"Run `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE \"pubwrite\".\"audit\" FROM PUBLIC;`"
                 {:objects ["audit"]}]
                ["nogrant"      #"run `GRANT USAGE ON SCHEMA \"nogrant\" TO \"mb_ws_test_provisioner\" WITH GRANT OPTION`" {}]
                ["noselect"     #"run `GRANT SELECT ON ALL TABLES IN SCHEMA \"noselect\" TO \"mb_ws_test_provisioner\" WITH GRANT OPTION`"
                 {:objects ["secret"]}]
                ["foreignowner" #"Run `GRANT \"mb_ws_test_other\" TO \"mb_ws_test_provisioner\";`" {:owners ["mb_ws_test_other"]}]]]
         (testing (format "add on %s throws a 412 naming the fix, before any change" schema)
           (let [scratch (scratch-name database wsd 1 schema)
                 e       (is (thrown? clojure.lang.ExceptionInfo
                                      (provisioning #(driver/add-workspace-schema! :postgres database wsd schema scratch))))]
             (is (= (merge {:status-code 412, :schema schema} extra) (ex-data e)))
             (is (re-find message (ex-message e)))
             (is (nil? (schema-owner spec scratch)))
             (is (= [] (grants-to spec user))))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest remove-workspace-schema-verifies-revoke-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd     (new-wsd database 1003)
           user    (-> wsd :database_details :user)
           scratch (scratch-name database wsd 1 "foreignowner")]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (testing "a grant the provisioning login cannot revoke fails remove, which rolls back"
         (exec! spec [(format "SET ROLE %s; CREATE SCHEMA %s; RESET ROLE" (:user provisioner) scratch)
                      (format "GRANT USAGE ON SCHEMA foreignowner TO %s" user)])
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/remove-workspace-schema! :postgres database wsd "foreignowner" scratch))))]
           (is (= {:schema "foreignowner"} (ex-data e)))
           (is (re-find #"survived their REVOKE" (ex-message e)))
           (is (some? (schema-owner spec scratch)))))
       (exec! spec [(format "REVOKE USAGE ON SCHEMA foreignowner FROM %s" user)])
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest warehouse-errors-scrub-the-password-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd      (new-wsd database 1004)
           password (-> wsd :database_details :password)
           messages (fn [^Throwable t]
                      (->> t
                           (iterate #(or (ex-cause %) (when (instance? java.sql.SQLException %)
                                                        (.getNextException ^java.sql.SQLException %))))
                           (take-while some?)
                           (map ex-message)))]
       (exec! spec [(format "ALTER ROLE %s NOCREATEROLE" (:user provisioner))])
       (testing "a failed CREATE USER throws the server's message, not pgjdbc's batch wrapper"
         (let [e (is (thrown? java.sql.SQLException (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))]
           (is (re-find #"permission denied to create role" (ex-message e)))
           (is (not (instance? java.sql.BatchUpdateException e)))
           (is (not (str/starts-with? (ex-message e) "Batch entry")))))
       (testing "the statements sent to the server never carry the password, which a server would log"
         (mt/with-dynamic-fn-redefs [driver.u/batch-exception identity]
           (let [e (is (thrown? java.sql.SQLException (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))]
             (is (some #(str/includes? % "CREATE USER") (messages e)))
             (is (not-any? #(str/includes? % "PASSWORD") (messages e)))
             (is (not-any? #(str/includes? % password) (messages e))))))
       (exec! spec [(format "ALTER ROLE %s CREATEROLE" (:user provisioner))])
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (testing "the password is stored as a SCRAM verifier and logs in"
         (is (str/starts-with? (:rolpassword (first (jdbc/query spec ["SELECT rolpassword FROM pg_authid WHERE rolname = ?"
                                                                      (-> wsd :database_details :user)])))
                               "SCRAM-SHA-256$"))
         (is (= [{:one 1}] (as-workspace-user wsd "SELECT 1 AS one"))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest workspace-feature-test
  (testing "Postgres reports the :workspace feature; drivers without the methods do not"
    (is (true? (driver/database-supports? :postgres :workspace nil)))
    (is (false? (driver/database-supports? :h2 :workspace nil)))))

(deftest default-privileges-cover-every-table-creator-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd (new-wsd database 1006)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (doseq [[schema-id main] [[1 "sales"] [2 "fresh"]]]
         (provisioning #(driver/add-workspace-schema! :postgres database wsd main (scratch-name database wsd schema-id main))))
       (exec! spec [(str "SET ROLE mb_ws_test_etl; CREATE TABLE fresh.by_owner (id int); "
                         "SET ROLE mb_ws_test_loader; CREATE TABLE sales.by_create_grantee (id int); "
                         (format "SET ROLE %s; CREATE TABLE sales.by_login (id int); RESET ROLE" (:user provisioner)))])
       (testing "the workspace user reads tables created after add by the schema owner, a CREATE grantee and the login"
         (doseq [table ["fresh.by_owner" "sales.by_create_grantee" "sales.by_login"]]
           (testing table
             (is (= [{:count 0}] (as-workspace-user wsd (str "SELECT count(*) FROM " table)))))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest concurrent-add-workspace-schema-test
  (do-with-warehouse!
   (fn [_spec database]
     (let [wsds (mapv #(new-wsd database %) [1007 1008])]
       (doseq [wsd wsds]
         (provisioning #(driver/init-workspace-isolation! :postgres database wsd)))
       (testing "two workspaces adding and removing the same main schema at once both succeed"
         (dotimes [i 5]
           (let [scratches (mapv #(scratch-name database % (inc i) "sales") wsds)
                 run-all   (fn [f]
                             (let [latch   (java.util.concurrent.CountDownLatch. 1)
                                   futures (mapv (fn [wsd scratch]
                                                   (future
                                                     (.await latch)
                                                     (try
                                                       (provisioning #(f wsd scratch))
                                                       :ok
                                                       (catch Throwable t (ex-message t)))))
                                                 wsds scratches)]
                               (.countDown latch)
                               (mapv deref futures)))]
             (is (= [:ok :ok] (run-all #(driver/add-workspace-schema! :postgres database %1 "sales" %2))))
             (is (= [:ok :ok] (run-all #(driver/remove-workspace-schema! :postgres database %1 "sales" %2)))))))
       (doseq [wsd wsds]
         (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd)))))))

(deftest destroy-leaves-other-schemas-alone-test
  (do-with-warehouse!
   (fn [spec database]
     (testing "destroy drops only `<user>_s...` schemas, not another schema whose name starts with the user name"
       (let [wsd   (new-wsd database 1009)
             other (str (-> wsd :database_details :user) "_backup")]
         (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
         (exec! spec [(format "SET ROLE %s; CREATE SCHEMA %s; RESET ROLE" (:user provisioner) other)])
         (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))
         (is (= (:user provisioner) (schema-owner spec other))))))))

(deftest init-refuses-an-existing-user-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1011)
           user (-> wsd :database_details :user)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (testing "a second init with the same isolation id throws a 409 that tells the caller not to clean up"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/init-workspace-isolation!
                                              :postgres database
                                              (assoc-in wsd [:database_details :password] "AnotherParents0Password")))))]
           (is (= {:status-code 409, :workspace/cleanup? false, :user user} (ex-data e)))))
       (testing "the existing user is unchanged: it still logs in with its own password"
         (is (role-exists? spec user))
         (is (= [{:one 1}] (as-workspace-user wsd "SELECT 1 AS one"))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest destroy-drops-what-the-user-made-outside-scratch-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1012)
           user (-> wsd :database_details :user)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (is (= [0] (as-workspace-user wsd "CREATE TABLE loose.evil (id int)")))
       (testing "without the password, destroy cannot drop the table, so DROP USER fails"
         (is (thrown-with-msg? java.sql.SQLException #"cannot be dropped because some objects depend on it"
                               (provisioning #(driver/destroy-workspace-isolation! :postgres database
                                                                                   (without-password wsd))))))
       (testing "with the password, destroy drops the table and the user; a second destroy is a no-op"
         (dotimes [_ 2]
           (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
           (is (empty? (jdbc/query spec ["SELECT 1 FROM pg_class WHERE relname = 'evil'"])))
           (is (not (role-exists? spec user)))))))))

(deftest default-privilege-owner-that-cannot-be-granted-test
  (do-with-warehouse!
   (fn [_spec database]
     (let [wsd (new-wsd database 1013)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (testing "a superuser owner is named as one only a superuser can grant, with no GRANT to run"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/add-workspace-schema! :postgres database wsd "managed"
                                                                           (scratch-name database wsd 1 "managed")))))]
           (is (= {:status-code 412, :schema "managed", :owners ["mb_ws_test_super"]} (ex-data e)))
           (is (re-find #"mb_ws_test_super: superuser role\(s\), which only a superuser can grant" (ex-message e)))
           (is (not (re-find #"GRANT" (ex-message e))))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest default-privileges-for-public-schema-test
  (do-with-warehouse!
   (fn [spec database]
     (when (seq (jdbc/query spec ["SELECT 1 FROM pg_roles WHERE rolname = 'pg_database_owner'"]))
       (exec! spec [(format "ALTER DATABASE %s OWNER TO mb_ws_test_etl" db-name)
                    "ALTER SCHEMA public OWNER TO pg_database_owner"
                    "REVOKE CREATE ON SCHEMA public FROM PUBLIC"
                    (format "GRANT USAGE ON SCHEMA public TO %s WITH GRANT OPTION" (:user provisioner))])
       (let [wsd (new-wsd database 1010)]
         (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
         (testing "a schema owned by pg_database_owner takes default privileges for the database owner"
           (is (nil? (provisioning #(driver/add-workspace-schema! :postgres database wsd "public"
                                                                  (scratch-name database wsd 1 "public")))))
           (exec! spec ["SET ROLE mb_ws_test_etl; CREATE TABLE public.by_database_owner (id int); RESET ROLE"])
           (is (= [{:count 0}] (as-workspace-user wsd "SELECT count(*) FROM public.by_database_owner"))))
         (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd)))))))
