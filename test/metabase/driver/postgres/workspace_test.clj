(ns ^:mb/driver-tests metabase.driver.postgres.workspace-test
  "Tests for the Postgres workspace isolation methods, against a real warehouse: each runs inside the
  `:workspace-provisioning` connection scope as a provisioning login that is not a superuser."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.impl :as driver.impl]
   [metabase.driver.postgres :as postgres]
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
  (exec! spec ["DROP SCHEMA IF EXISTS sales, fresh, pubcreate, pubwrite, nogrant, noselect, foreignowner, managed, loose, sq CASCADE"
               ;; the default before Postgres 15, which init refuses
               "REVOKE CREATE ON SCHEMA public FROM PUBLIC"])
  (doseq [role ["mb_ws_test_etl" "mb_ws_test_loader" "mb_ws_test_other" "mb_ws_test_super" "mb_ws_test_pubwriter"
                (:user provisioner)]]
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
          (str "SET ROLE mb_ws_test_etl; "
               "CREATE TABLE pubwrite.upd (id int); GRANT UPDATE ON pubwrite.upd TO PUBLIC; "
               "CREATE TABLE pubwrite.del (id int); GRANT DELETE ON pubwrite.del TO PUBLIC; "
               "CREATE TABLE pubwrite.trunc (id int); GRANT TRUNCATE ON pubwrite.trunc TO PUBLIC; "
               "CREATE TABLE pubwrite.trig (id int); GRANT TRIGGER ON pubwrite.trig TO PUBLIC; "
               "CREATE TABLE pubwrite.refs (id int); GRANT REFERENCES ON pubwrite.refs TO PUBLIC; "
               "CREATE TABLE pubwrite.col (id int); GRANT UPDATE (id) ON pubwrite.col TO PUBLIC; "
               "ALTER DEFAULT PRIVILEGES IN SCHEMA pubwrite GRANT INSERT ON TABLES TO PUBLIC; RESET ROLE")
          "CREATE ROLE mb_ws_test_pubwriter NOLOGIN"
          "CREATE TABLE pubwrite.pw (id int)"
          "ALTER TABLE pubwrite.pw OWNER TO mb_ws_test_pubwriter"
          "ALTER DEFAULT PRIVILEGES FOR ROLE mb_ws_test_pubwriter GRANT DELETE ON TABLES TO PUBLIC"
          "CREATE ROLE mb_ws_test_super SUPERUSER NOLOGIN"
          "CREATE SCHEMA managed AUTHORIZATION mb_ws_test_etl"
          "CREATE TABLE managed.t (id int)"
          "ALTER TABLE managed.t OWNER TO mb_ws_test_super"
          (format "GRANT SELECT ON managed.t TO %s WITH GRANT OPTION" (:user provisioner))
          "CREATE SCHEMA loose"
          "GRANT USAGE ON SCHEMA loose TO PUBLIC"
          "CREATE SCHEMA sq AUTHORIZATION mb_ws_test_etl"
          (str "SET ROLE mb_ws_test_etl; CREATE SEQUENCE sq.s0; GRANT USAGE ON SEQUENCE sq.s0 TO PUBLIC; "
               "ALTER DEFAULT PRIVILEGES IN SCHEMA sq GRANT UPDATE ON SEQUENCES TO PUBLIC; RESET ROLE")]))

(defn- public-create!
  "Grants CREATE on `schema` to PUBLIC, which init refuses: tests do it after init."
  [spec schema]
  (exec! spec [(format "GRANT CREATE ON SCHEMA %s TO PUBLIC" schema)]))

(defn- do-with-warehouse!
  "Calls `(f superuser-spec database)` with `database` the Lib metadata of a Database whose own login is the
  superuser and whose provisioning login is [[provisioner]]."
  [f]
  (mt/test-driver :postgres
    (tx/drop-if-exists-and-create-db! :postgres db-name)
    (let [spec (sql-jdbc.conn/connection-details->spec :postgres (superuser-details))]
      (create-warehouse! spec)
      (mt/with-temp [:model/Database {db-id :id} {:engine :postgres, :details (superuser-details)}]
        ;; the cluster-wide PUBLIC CREATE check covers only this test's database: other databases of a shared test
        ;; cluster (`public` before Postgres 15) are not this suite's to change. connectable-databases-test and
        ;; cluster-public-create-test cover the rest.
        (mt/with-dynamic-fn-redefs [driver.conn/database-workspace-provisioning-details (constantly provisioner)
                                    postgres/connectable-databases                      (constantly [db-name])]
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
       (public-create! spec "pubcreate")
       (doseq [[schema message extra]
               [["pubcreate"    #"Run `REVOKE CREATE ON SCHEMA \"pubcreate\" FROM PUBLIC`" {}]
                ["pubwrite"     #"Run `REVOKE UPDATE \(\"id\"\) ON TABLE \"pubwrite\".\"col\" FROM PUBLIC; ALTER DEFAULT PRIVILEGES FOR ROLE \"mb_ws_test_pubwriter\" REVOKE DELETE ON TABLES FROM PUBLIC; ALTER DEFAULT PRIVILEGES FOR ROLE \"mb_ws_test_etl\" IN SCHEMA \"pubwrite\" REVOKE INSERT ON TABLES FROM PUBLIC; REVOKE INSERT ON TABLE \"pubwrite\".\"audit\" FROM PUBLIC; REVOKE DELETE ON TABLE \"pubwrite\".\"del\" FROM PUBLIC; REVOKE REFERENCES ON TABLE \"pubwrite\".\"refs\" FROM PUBLIC; REVOKE TRIGGER ON TABLE \"pubwrite\".\"trig\" FROM PUBLIC; REVOKE TRUNCATE ON TABLE \"pubwrite\".\"trunc\" FROM PUBLIC; REVOKE UPDATE ON TABLE \"pubwrite\".\"upd\" FROM PUBLIC;`"
                 {:objects ["col.id" "database-wide default privileges for mb_ws_test_pubwriter"
                            "default privileges for mb_ws_test_etl" "audit" "del" "refs" "trig" "trunc" "upd"]}]
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
    (is (false? (driver/database-supports? :h2 :workspace nil))))
  (testing "a driver deriving from Postgres does not inherit it"
    ;; derived only for this test, so tests that walk the driver hierarchy never see it; restored rather than
    ;; underived, since `underive` rebuilds the hierarchy in an order drivers with several parents refuse
    (let [hierarchy @#'driver.impl/hierarchy]
      (alter-var-root #'driver.impl/hierarchy derive ::derived-from-postgres :postgres)
      (try
        (is (false? (driver/database-supports? ::derived-from-postgres :workspace nil)))
        (finally
          (alter-var-root #'driver.impl/hierarchy (constantly hierarchy)))))))

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
       (public-create! spec "loose")
       (is (= [0] (as-workspace-user wsd "CREATE TABLE loose.evil (id int)")))
       (testing "destroy drops the table and the user without the stored password; a second destroy is a no-op"
         (dotimes [_ 2]
           (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database (without-password wsd)))))
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

(deftest names-come-from-the-isolation-id-test
  (do-with-warehouse!
   (fn [spec database]
     (exec! spec ["CREATE SCHEMA _sales_archive AUTHORIZATION mb_ws_test_etl"])
     (let [wsd     (new-wsd database 1014)
           scratch (scratch-name database wsd 1 "sales")]
       (testing "destroy ignores a missing or blank user in :database_details"
         (doseq [details [nil {:user nil} {:user ""}]]
           (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database
                                                                         (assoc wsd :database_details details)))))
           (is (= "mb_ws_test_etl" (schema-owner spec "_sales_archive")))))
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (testing "add and remove refuse a scratch namespace that is not the workspace's own"
         (doseq [f [driver/add-workspace-schema! driver/remove-workspace-schema!]]
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not a scratch namespace"
                                 (provisioning #(f :postgres database wsd "sales" "sales"))))
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not a scratch namespace"
                                 (provisioning #(f :postgres database (assoc-in wsd [:database_details :user] "mb_ws_test_etl")
                                                   "sales" "mb_ws_test_etl_s1_sales")))))
         (is (= "mb_ws_test_etl" (schema-owner spec "sales"))))
       (testing "add and remove still work with the right scratch namespace"
         (is (nil? (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" scratch))))
         (is (nil? (provisioning #(driver/remove-workspace-schema! :postgres database wsd "sales" scratch)))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest methods-bind-the-provisioning-scope-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd     (new-wsd database 1015)
           scratch (scratch-name database wsd 1 "sales")]
       (testing "outside any scope, the methods still run as the provisioning login"
         (driver/init-workspace-isolation! :postgres database wsd)
         (driver/add-workspace-schema! :postgres database wsd "sales" scratch)
         (is (= (:user provisioner) (schema-owner spec scratch)))
         (driver/destroy-workspace-isolation! :postgres database wsd)
         (is (not (role-exists? spec (-> wsd :database_details :user)))))
       (testing "without a provisioning login they fail closed and change nothing"
         (mt/with-dynamic-fn-redefs [driver.conn/database-workspace-provisioning-details (constantly nil)]
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no workspace provisioning connection"
                                 (driver/init-workspace-isolation! :postgres database wsd))))
         (is (not (role-exists? spec (-> wsd :database_details :user)))))))))

(deftest default-privilege-owners-grantable-and-not-test
  (do-with-warehouse!
   (fn [spec database]
     (exec! spec ["CREATE TABLE managed.u (id int)" "ALTER TABLE managed.u OWNER TO mb_ws_test_other"
                  (format "GRANT SELECT ON managed.u TO %s WITH GRANT OPTION" (:user provisioner))])
     (let [wsd (new-wsd database 1022)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (testing "a 412 with both kinds of owner gives the GRANT for one and no GRANT for the superuser"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/add-workspace-schema! :postgres database wsd "managed"
                                                                           (scratch-name database wsd 1 "managed")))))]
           (is (= ["mb_ws_test_other" "mb_ws_test_super"] (:owners (ex-data e))))
           (is (str/includes? (ex-message e) "Run `GRANT \"mb_ws_test_other\" TO \"mb_ws_test_provisioner\";`"))
           (is (str/includes? (ex-message e) "mb_ws_test_super: superuser role(s), which only a superuser can grant"))
           (is (not (str/includes? (ex-message e) "GRANT \"mb_ws_test_super\"")))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest init-refuses-public-create-anywhere-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1023)
           user (-> wsd :database_details :user)]
       (public-create! spec "loose")
       (testing "init returns a 412 naming each schema that grants CREATE to PUBLIC, before any change"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))]
           (is (= {:status-code 412, :schemas [(str db-name ".loose")], :unverifiable []} (ex-data e)))
           (is (str/includes? (ex-message e) (format "`REVOKE CREATE ON SCHEMA \"loose\" FROM PUBLIC;` in database \"%s\""
                                                     db-name)))
           (is (not (role-exists? spec user)))))
       (testing "after the REVOKE, init succeeds"
         (exec! spec ["REVOKE CREATE ON SCHEMA loose FROM PUBLIC"])
         (is (nil? (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))
         (is (role-exists? spec user)))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest planted-functions-never-run-as-the-provisioning-login-test
  (do-with-warehouse!
   (fn [spec database]
     (let [[wsd other] (mapv #(new-wsd database %) [1024 1025])
           user        (-> wsd :database_details :user)
           acl         #(:relacl (first (jdbc/query spec ["SELECT relacl::text FROM pg_class WHERE oid = 'sales.orders'::regclass"])))]
       (doseq [w [wsd other]]
         (provisioning #(driver/init-workspace-isolation! :postgres database w)))
       (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" (scratch-name database wsd 1 "sales")))
       ;; public is on every login's default search_path
       (exec! spec [(format "GRANT CREATE ON SCHEMA public TO %s" user)])
       (let [grant-self (fn [privilege]
                          (format "BEGIN EXECUTE 'GRANT %s ON sales.orders TO %s'; EXCEPTION WHEN OTHERS THEN NULL; END;"
                                  privilege user))]
         (is (= [0] (as-workspace-user wsd (str "CREATE FUNCTION public.hashtext(varchar) RETURNS int LANGUAGE plpgsql AS $f$ BEGIN "
                                                (grant-self "INSERT") " RETURN pg_catalog.hashtext($1::text); END $f$"))))
         (is (= [0] (as-workspace-user wsd (str "CREATE FUNCTION public.evil_eq(name, varchar) RETURNS bool LANGUAGE plpgsql "
                                                "AS $f$ BEGIN " (grant-self "DELETE") " RETURN $1::text = $2::text; END $f$"))))
         (is (= [0] (as-workspace-user wsd (str "CREATE OPERATOR public.= (LEFTARG = name, RIGHTARG = varchar, "
                                                "FUNCTION = public.evil_eq)")))))
       (let [before (acl)
             scratch (scratch-name database other 1 "sales")]
         (testing "another workspace's add, remove, init and destroy never call them"
           (provisioning #(driver/add-workspace-schema! :postgres database other "sales" scratch))
           (provisioning #(driver/remove-workspace-schema! :postgres database other "sales" scratch))
           (provisioning #(driver/destroy-workspace-isolation! :postgres database other))
           (provisioning #(driver/init-workspace-isolation! :postgres database other))
           (provisioning #(driver/destroy-workspace-isolation! :postgres database other))
           (is (= before (acl)))
           (is (re-find #"permission denied" (as-workspace-user wsd "INSERT INTO sales.orders VALUES (666)")))))
       (exec! spec [(format "DROP OWNED BY %s" user)])
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest destroy-needs-nothing-from-the-workspace-user-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1026)
           user (-> wsd :database_details :user)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" (scratch-name database wsd 1 "sales")))
       (testing "a large object and its own new password do not stop destroy"
         (is (= [0] (as-workspace-user wsd "DO $$BEGIN PERFORM lo_create(0); END$$")))
         (is (= [0] (as-workspace-user wsd "ALTER ROLE CURRENT_USER PASSWORD 'AttackerPassw0rd'")))
         (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
         (is (not (role-exists? spec user)))
         (is (empty? (jdbc/query spec ["SELECT 1 FROM pg_largeobject_metadata"]))))))))

(deftest a-failed-destroy-leaves-the-user-locked-out-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1027)
           user (-> wsd :database_details :user)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" (scratch-name database wsd 1 "sales")))
       ;; a grant from a role the provisioning login cannot act for, which neither REVOKE nor DROP OWNED removes
       (exec! spec ["CREATE TABLE noselect.other (id int)" (format "GRANT SELECT ON noselect.other TO %s" user)])
       (testing "destroy fails loudly, but the user can no longer log in and keeps none of the provisioning login's grants"
         (is (thrown? Exception (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
         (is (role-exists? spec user))
         (is (re-find #"FATAL" (as-workspace-user wsd "SELECT 1 AS one")))
         (is (= [{:rolcanlogin false}] (jdbc/query spec ["SELECT rolcanlogin FROM pg_roles WHERE rolname = ?" user])))
         (is (= [{:kind "relation", :name "other"}] (grants-to spec user))))
       (exec! spec [(format "REVOKE SELECT ON noselect.other FROM %s" user)])
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest public-sequence-writes-test
  (do-with-warehouse!
   (fn [_spec database]
     (let [wsd (new-wsd database 1028)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (testing "a sequence PUBLIC may use or update, now or by default, is a 412 naming each fix"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/add-workspace-schema! :postgres database wsd "sq"
                                                                           (scratch-name database wsd 1 "sq")))))]
           (is (= ["default sequence privileges for mb_ws_test_etl" "sequence s0"] (:objects (ex-data e))))
           (is (str/includes? (ex-message e) (str "ALTER DEFAULT PRIVILEGES FOR ROLE \"mb_ws_test_etl\" IN SCHEMA \"sq\" "
                                                  "REVOKE UPDATE ON SEQUENCES FROM PUBLIC;")))
           (is (str/includes? (ex-message e) "REVOKE USAGE ON SEQUENCE \"sq\".\"s0\" FROM PUBLIC;"))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest sequence-grants-are-revoked-on-sequences-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1029)
           user (-> wsd :database_details :user)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (exec! spec [(format (str "SET ROLE %s; CREATE SCHEMA provseq; CREATE SEQUENCE provseq.s; "
                                 "GRANT USAGE ON SCHEMA provseq TO %s; GRANT USAGE ON SEQUENCE provseq.s TO %s; RESET ROLE")
                            (:user provisioner) user user)])
       (testing "destroy revokes a sequence grant with REVOKE ... ON SEQUENCE"
         (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
         (is (not (role-exists? spec user))))))))

(deftest reserved-main-schemas-test
  (do-with-warehouse!
   (fn [_spec database]
     (let [wsd     (new-wsd database 1030)
           status  (fn [f]
                     (try
                       (f)
                       :no-error
                       (catch clojure.lang.ExceptionInfo e
                         (:status-code (ex-data e)))))
           scratch (str (-> wsd :database_details :user) "_s1_x")]
       (testing "system schemas, workspace namespaces and missing names cannot be main schemas"
         (doseq [main ["pg_catalog" "pg_toast" "information_schema" "mb__isolation_abcdefgh_s1_sales" nil ""]]
           (testing (pr-str main)
             (is (= 400 (status #(scratch-name database wsd 1 main))))
             (is (= 400 (status #(provisioning (fn [] (driver/add-workspace-schema! :postgres database wsd main scratch)))))))))
       (testing "a schema id that leaves no room for the main schema is refused"
         (is (= 400 (status #(scratch-name database wsd (bigint 1e45) "sales")))))))))

(deftest init-requires-a-password-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd (new-wsd database 1033)]
       (testing "init refuses a missing or blank password before any change"
         (doseq [password [nil ""]]
           (is (= 400 (:status-code (ex-data (is (thrown? clojure.lang.ExceptionInfo
                                                          (provisioning #(driver/init-workspace-isolation!
                                                                          :postgres database
                                                                          (assoc-in wsd [:database_details :password] password)))))))))
           (is (not (role-exists? spec (-> wsd :database_details :user))))))))))

(deftest default-privilege-owner-without-inherit-test
  (do-with-warehouse!
   (fn [spec database]
     (when (>= (:v (first (jdbc/query spec ["SELECT current_setting('server_version_num')::int AS v"]))) 160000)
       (exec! spec [(format "REVOKE mb_ws_test_etl FROM %s" (:user provisioner))
                    (format "GRANT mb_ws_test_etl TO %s WITH INHERIT FALSE" (:user provisioner))
                    (format "GRANT USAGE ON SCHEMA sales TO %s WITH GRANT OPTION" (:user provisioner))
                    (format "GRANT SELECT ON sales.orders TO %s WITH GRANT OPTION" (:user provisioner))])
       (let [wsd     (new-wsd database 1032)
             scratch (scratch-name database wsd 1 "sales")]
         (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
         (testing "a membership without INHERIT is a 412 naming the GRANT ... WITH INHERIT TRUE that fixes it"
           (let [e (is (thrown? clojure.lang.ExceptionInfo
                                (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" scratch))))]
             (is (str/includes? (ex-message e) "GRANT \"mb_ws_test_etl\" TO \"mb_ws_test_provisioner\" WITH INHERIT TRUE;"))))
         (testing "running it fixes it"
           (exec! spec [(format "GRANT mb_ws_test_etl TO %s WITH INHERIT TRUE" (:user provisioner))])
           (is (nil? (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" scratch)))))
         (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd)))))))

(defn- hold-session!
  "Opens a session as the workspace user, runs `sqls` in a transaction it leaves open, and returns the connection."
  ^java.sql.Connection [wsd sqls]
  ;; a raw connection is the point here: the session must stay open across the code under test
  (let [{:keys [host port db]} (superuser-details)
        {:keys [user password]} (:database_details wsd)
        conn (java.sql.DriverManager/getConnection (format "jdbc:postgresql://%s:%s/%s" host port db)
                                                   ^String user ^String password)]
    (.setAutoCommit conn false)
    (with-open [stmt (.createStatement conn)]
      (doseq [^String sql sqls]
        (.execute stmt sql)))
    conn))

(defn- ws-grants-on-main [spec user]
  (remove #(str/starts-with? (:name %) user) (grants-to spec user)))

(deftest init-makes-the-provisioning-login-a-member-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1035)
           user (-> wsd :database_details :user)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (testing "the provisioning login holds the workspace user's privileges, and not the reverse"
         (is (= [{:member true}]
                (jdbc/query spec ["SELECT pg_has_role(?, ?, 'USAGE') AS member" (:user provisioner) user])))
         (is (= [{:member false}]
                (jdbc/query spec ["SELECT pg_has_role(?, ?, 'USAGE') AS member" user (:user provisioner)]))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest destroy-ends-the-workspace-users-sessions-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd      (new-wsd database 1036)
           user     (-> wsd :database_details :user)
           scratch  (scratch-name database wsd 1 "sales")]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" scratch))
       (is (= [0] (as-workspace-user wsd (format "CREATE TABLE %s.t (x int)" scratch))))
       (let [reader (hold-session! wsd ["SELECT count(*) FROM sales.orders"])
             locker (hold-session! wsd [(format "LOCK TABLE %s.t IN ACCESS SHARE MODE" scratch)])]
         (try
           (testing "destroy ends an open session and one holding a lock on a scratch table, then drops everything"
             (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
             (is (not (role-exists? spec user)))
             (is (nil? (schema-owner spec scratch)))
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
     (let [wsd     (new-wsd database 1037)
           user    (-> wsd :database_details :user)
           scratch (scratch-name database wsd 1 "sales")]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" scratch))
       (let [session (hold-session! wsd ["SELECT 1"])]
         (try
           (testing "destroy throws a 409 naming the open session, after taking away the login and the main grants"
             (let [e (is (thrown? clojure.lang.ExceptionInfo
                                  ;; a session this login could not end, as when another role's membership was revoked
                                  (mt/with-dynamic-fn-redefs [postgres/end-sessions! (constantly nil)]
                                    (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd)))))]
               (is (= {:status-code 409, :user user, :sessions 1} (ex-data e)))
               (is (re-find #"still open" (ex-message e))))
             (is (= [{:rolcanlogin false}] (jdbc/query spec ["SELECT rolcanlogin FROM pg_roles WHERE rolname = ?" user])))
             (is (empty? (ws-grants-on-main spec user)))
             (is (re-find #"permission denied" (with-open [stmt (.createStatement session)]
                                                 (try
                                                   (.executeQuery stmt "SELECT count(*) FROM sales.orders")
                                                   "read"
                                                   (catch java.sql.SQLException e
                                                     (ex-message e)))))))
           (finally
             (.close session))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest destroy-reports-objects-in-another-database-test
  (do-with-warehouse!
   (fn [_spec database]
     (let [wsd   (new-wsd database 1038)
           user  (-> wsd :database_details :user)
           other (sql-jdbc.conn/connection-details->spec
                  :postgres (mt/dbdef->connection-details :postgres :db {:database-name "workspace_isolation_other"}))]
       (tx/drop-if-exists-and-create-db! :postgres "workspace_isolation_other")
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (exec! other ["CREATE TABLE planted (x int)" (format "ALTER TABLE planted OWNER TO %s" user)])
       (testing "a DROP USER that fails on objects elsewhere is a 409 naming them"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))]
           (is (= {:status-code 409, :user user} (ex-data e)))
           (is (re-find #"(?s)cannot be dropped yet: .*objects? in database workspace_isolation_other" (ex-message e)))))
       (exec! other ["DROP TABLE planted"])
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest concurrent-init-test
  (do-with-warehouse!
   (fn [spec database]
     (testing "two inits with the same isolation id: one creates the user, the other gets the 409 that forbids cleanup"
       (dotimes [_ 5]
         (let [wsd     (new-wsd database 1039)
               latch   (java.util.concurrent.CountDownLatch. 1)
               inits   (vec (for [_ (range 2)]
                              (future
                                (.await latch)
                                (try
                                  (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
                                  :created
                                  (catch clojure.lang.ExceptionInfo e
                                    (ex-data e))))))
               _       (.countDown latch)
               results (mapv #(deref % 60000 :timed-out) inits)]
           (is (= #{:created {:status-code 409, :workspace/cleanup? false, :user (-> wsd :database_details :user)}}
                  (set results)))
           (is (role-exists? spec (-> wsd :database_details :user)))
           (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))))

(deftest remove-gives-up-on-a-held-lock-test
  (do-with-warehouse!
   (fn [_spec database]
     (let [wsd     (new-wsd database 1040)
           scratch (scratch-name database wsd 1 "sales")]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" scratch))
       (is (= [0] (as-workspace-user wsd (format "CREATE TABLE %s.t (x int)" scratch))))
       (let [session (hold-session! wsd [(format "LOCK TABLE %s.t IN ACCESS SHARE MODE" scratch)])]
         (try
           (testing "remove waits at most lock_timeout for a lock on the scratch schema, then returns a 409"
             (with-redefs [postgres/workspace-lock-timeout "1s"]
               (let [removed (future (try
                                       (provisioning #(driver/remove-workspace-schema! :postgres database wsd "sales" scratch))
                                       :removed
                                       (catch clojure.lang.ExceptionInfo e
                                         (ex-data e))))]
                 (is (= {:status-code 409} (deref removed 20000 :still-waiting))))))
           (finally
             (.close session))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest connectable-databases-test
  (do-with-warehouse!
   (fn [spec _database]
     (tx/drop-if-exists-and-create-db! :postgres "workspace_isolation_noconnect")
     (tx/drop-if-exists-and-create-db! :postgres "workspace_isolation_noallow")
     (exec! spec ["REVOKE CONNECT ON DATABASE workspace_isolation_noconnect FROM PUBLIC"
                  "ALTER DATABASE workspace_isolation_noallow ALLOW_CONNECTIONS false"])
     (testing "databases any login may connect to: this one, but not one without CONNECT for PUBLIC, one refusing connections, or template0"
       (let [dbs (set (jdbc/with-db-transaction [conn spec]
                        (doall (#'postgres/connectable-databases conn))))]
         (is (contains? dbs db-name))
         (is (not-any? dbs ["workspace_isolation_noconnect" "workspace_isolation_noallow" "template0"]))))
     (exec! spec ["ALTER DATABASE workspace_isolation_noallow ALLOW_CONNECTIONS true"]))))

(deftest cluster-public-create-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd     (new-wsd database 1041)
           other   "workspace_isolation_other"
           closed  "workspace_isolation_closed"
           other-spec (sql-jdbc.conn/connection-details->spec
                       :postgres (mt/dbdef->connection-details :postgres :db {:database-name other}))]
       (doseq [db [other closed]]
         (tx/drop-if-exists-and-create-db! :postgres db))
       (exec! other-spec ["REVOKE CREATE ON SCHEMA public FROM PUBLIC" "CREATE SCHEMA loose2" "GRANT CREATE ON SCHEMA loose2 TO PUBLIC"])
       (exec! (sql-jdbc.conn/connection-details->spec
               :postgres (mt/dbdef->connection-details :postgres :db {:database-name closed}))
              ["REVOKE CREATE ON SCHEMA public FROM PUBLIC"])
       ;; the provisioning login may not connect to `closed`, but the stubbed list says the workspace user could
       (exec! spec [(format "REVOKE CONNECT ON DATABASE %s FROM PUBLIC" closed)])
       (mt/with-dynamic-fn-redefs [postgres/connectable-databases (constantly [db-name other closed])]
         (testing "init lists each other database's PUBLIC CREATE schema, and each database it could not check"
           (let [e (is (thrown? clojure.lang.ExceptionInfo
                                (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))]
             (is (= {:status-code 412, :schemas [(str other ".loose2")], :unverifiable [closed]} (ex-data e)))
             (is (str/includes? (ex-message e) (format "`REVOKE CREATE ON SCHEMA \"loose2\" FROM PUBLIC;` in database \"%s\"" other)))
             (is (str/includes? (ex-message e) (format "`REVOKE CONNECT ON DATABASE \"%s\" FROM PUBLIC;`" closed)))
             (is (not (role-exists? spec (-> wsd :database_details :user))))))
         (testing "after the fixes, init succeeds"
           (exec! other-spec ["REVOKE CREATE ON SCHEMA loose2 FROM PUBLIC"])
           (exec! spec [(format "GRANT CONNECT ON DATABASE %s TO %s" closed (:user provisioner))])
           (is (nil? (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest destroy-restores-its-membership-and-drops-other-members-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd       (new-wsd database 1042)
           user      (-> wsd :database_details :user)
           before-16 (> 160000 (:v (first (jdbc/query spec ["SELECT current_setting('server_version_num')::int AS v"]))))
           members   #(map :member (jdbc/query spec [(str "SELECT m.rolname AS member FROM pg_auth_members am "
                                                          "JOIN pg_roles r ON r.oid = am.roleid "
                                                          "JOIN pg_roles m ON m.oid = am.member WHERE r.rolname = ?")
                                                     user]))]
       (exec! spec ["DROP ROLE IF EXISTS mb_ws_test_accomplice" "CREATE ROLE mb_ws_test_accomplice NOLOGIN"])
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" (scratch-name database wsd 1 "sales")))
       (is (= [0] (as-workspace-user wsd "DO $$BEGIN PERFORM lo_create(0); END$$")))
       (when before-16
         (testing "before Postgres 16, the user can revoke the provisioning login's membership and share itself"
           (is (= [0] (as-workspace-user wsd (format "REVOKE %s FROM %s" user (:user provisioner)))))
           (is (= [0] (as-workspace-user wsd (format "GRANT %s TO mb_ws_test_accomplice" user))))
           (is (= ["mb_ws_test_accomplice"] (members)))))
       ;; a grant the provisioning login cannot revoke stops destroy at DROP USER, after the lock-out has committed
       (exec! spec ["CREATE TABLE noselect.other (id int)" (format "GRANT SELECT ON noselect.other TO %s" user)])
       (testing "a destroy stopped at DROP USER has already restored this login's membership and dropped the other"
         (is (thrown? clojure.lang.ExceptionInfo (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
         (is (= [(:user provisioner)] (distinct (members)))))
       (exec! spec [(format "REVOKE SELECT ON noselect.other FROM %s" user)])
       (testing "destroy restores its membership, drops the other, and drops the user"
         (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
         (is (not (role-exists? spec user)))
         (is (empty? (jdbc/query spec [(str "SELECT 1 FROM pg_auth_members am JOIN pg_roles m ON m.oid = am.member "
                                            "WHERE m.rolname = 'mb_ws_test_accomplice'")]))))
       (exec! spec ["DROP ROLE mb_ws_test_accomplice"])))))

(deftest destroy-maps-a-refused-drop-to-a-409-test
  (testing "a DROP OWNED or DROP USER the provisioning login may not run is a 409 saying what to grant"
    (let [e (#'postgres/drop-user-error "mb__isolation_ab2c3d4e"
                                        (java.sql.SQLException. "ERROR: permission denied to drop objects" "42501"))]
      (is (= {:status-code 409, :user "mb__isolation_ab2c3d4e"} (ex-data e)))
      (is (str/includes? (ex-message e) "`GRANT \"mb__isolation_ab2c3d4e\" TO <provisioning login>`")))))

(deftest cluster-check-reports-a-database-it-cannot-name-test
  (do-with-warehouse!
   (fn [_spec database]
     (let [wsd (new-wsd database 1043)
           bad "workspace_isolation_bad?name"]
       (tx/drop-if-exists-and-create-db! :postgres bad)
       (mt/with-dynamic-fn-redefs [postgres/connectable-databases (constantly [db-name bad])]
         (testing "a database whose name the connection guard refuses is listed as unverifiable"
           (let [e (is (thrown? clojure.lang.ExceptionInfo
                                (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))]
             (is (= {:status-code 412, :schemas [], :unverifiable [bad]} (ex-data e))))))))))

(defn- server-version [spec]
  (:v (first (jdbc/query spec ["SELECT current_setting('server_version_num')::int AS v"]))))

(deftest init-refuses-a-noinherit-provisioning-login-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1044)
           user (-> wsd :database_details :user)]
       (exec! spec [(format "ALTER ROLE %s NOINHERIT" (:user provisioner))])
       (try
         (if (> 160000 (server-version spec))
           (testing "before Postgres 16, a NOINHERIT login would hold the membership without its privileges: a 412"
             (let [e (is (thrown? clojure.lang.ExceptionInfo
                                  (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))]
               (is (= {:status-code 412, :user user} (ex-data e)))
               (is (str/includes? (ex-message e) (format "`ALTER ROLE \"%s\" INHERIT`" (:user provisioner)))))
             (is (not (role-exists? spec user))))
           (testing "from Postgres 16, the membership inherits whatever the login's attribute, so init and destroy work"
             (is (nil? (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))
             (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))
         (finally
           (exec! spec [(format "ALTER ROLE %s INHERIT" (:user provisioner))])))))))

(deftest init-gives-connect-where-public-lacks-it-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1045)
           user (-> wsd :database_details :user)]
       (exec! spec [(format "REVOKE CONNECT ON DATABASE %s FROM PUBLIC" db-name)
                    (format "GRANT CONNECT ON DATABASE %s TO %s" db-name (:user provisioner))])
       (testing "without the grant option on CONNECT, init returns a 412 naming it"
         (let [e (is (thrown? clojure.lang.ExceptionInfo
                              (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))]
           (is (= {:status-code 412, :user user} (ex-data e)))
           (is (str/includes? (ex-message e) (format "`GRANT CONNECT ON DATABASE \"%s\" TO \"%s\" WITH GRANT OPTION`"
                                                     db-name (:user provisioner)))))
         (is (not (role-exists? spec user))))
       (testing "with it, init grants CONNECT to the workspace user, which logs in; destroy takes it back"
         (exec! spec [(format "GRANT CONNECT ON DATABASE %s TO %s WITH GRANT OPTION" db-name (:user provisioner))])
         (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
         (is (= [{:one 1}] (as-workspace-user wsd "SELECT 1 AS one")))
         (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
         (is (not (role-exists? spec user))))
       (exec! spec [(format "GRANT CONNECT ON DATABASE %s TO PUBLIC" db-name)])))))

(deftest public-create-check-includes-this-database-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd (new-wsd database 1046)]
       (public-create! spec "loose")
       ;; as when this database does not grant CONNECT to PUBLIC
       (mt/with-dynamic-fn-redefs [postgres/connectable-databases (constantly [])]
         (testing "this database is checked even when it is not among those PUBLIC may connect to"
           (let [e (is (thrown? clojure.lang.ExceptionInfo
                                (provisioning #(driver/init-workspace-isolation! :postgres database wsd))))]
             (is (= [(str db-name ".loose")] (:schemas (ex-data e)))))))))))

(deftest destroy-drops-what-the-user-made-in-another-database-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd   (new-wsd database 1047)
           user  (-> wsd :database_details :user)
           other "workspace_isolation_other"]
       (tx/drop-if-exists-and-create-db! :postgres other)
       (exec! (sql-jdbc.conn/connection-details->spec
               :postgres (mt/dbdef->connection-details :postgres :db {:database-name other}))
              ["REVOKE CREATE ON SCHEMA public FROM PUBLIC"])
       (mt/with-dynamic-fn-redefs [postgres/connectable-databases (constantly [db-name other])]
         (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
         (testing "a large object the user makes in another database it may connect to does not stop destroy"
           (is (= [0] (jdbc/execute! (sql-jdbc.conn/connection-details->spec
                                      :postgres (merge (mt/dbdef->connection-details :postgres :db {:database-name other})
                                                       (:database_details wsd)))
                                     ["DO $$BEGIN PERFORM lo_create(0); END$$"])))
           (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
           (is (not (role-exists? spec user)))))))))

(deftest add-workspace-schema-again-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd     (new-wsd database 1048)
           scratch (scratch-name database wsd 1 "sales")]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (testing "a second add of the same schema, as a retry after an add that committed, succeeds"
         (dotimes [_ 2]
           (is (nil? (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" scratch)))))
         (is (= [0] (as-workspace-user wsd (format "CREATE TABLE %s.t (x int)" scratch)))))
       (testing "a schema of the scratch name owned by another role is not adopted"
         (let [other (scratch-name database wsd 2 "sales")]
           (exec! spec [(format "CREATE SCHEMA %s" other)])
           (let [e (is (thrown? clojure.lang.ExceptionInfo
                                (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" other))))]
             (is (= {:status-code 409, :scratch other} (ex-data e))))
           (exec! spec [(format "DROP SCHEMA %s" other)])))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))))

(deftest destroy-while-the-user-keeps-reconnecting-test
  (do-with-warehouse!
   (fn [spec database]
     (let [wsd  (new-wsd database 1049)
           user (-> wsd :database_details :user)
           stop (atom false)]
       (provisioning #(driver/init-workspace-isolation! :postgres database wsd))
       (provisioning #(driver/add-workspace-schema! :postgres database wsd "sales" (scratch-name database wsd 1 "sales")))
       (let [reconnector (future
                           (while (not @stop)
                             (try
                               (with-open [_session (hold-session! wsd ["SELECT 1"])]
                                 (Thread/sleep 20))
                               (catch Exception _))))]
         (try
           (testing "a client that keeps reconnecting does not survive or stall destroy"
             (is (nil? (provisioning #(driver/destroy-workspace-isolation! :postgres database wsd))))
             (is (not (role-exists? spec user))))
           (finally
             (reset! stop true)
             (deref reconnector 5000 nil))))))))
