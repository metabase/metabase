(ns ^:mb/driver-tests metabase.driver.postgres.workspace-test
  "Tests for the Postgres workspace isolation methods against a real warehouse, run as a provisioning login that is not
  a superuser."
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

(defn- drop-role-if-exists! [spec role]
  (when (seq (jdbc/query spec ["SELECT 1 FROM pg_roles WHERE rolname = ?" role]))
    (exec! spec [(format "DROP OWNED BY \"%s\"" role) (format "DROP ROLE \"%s\"" role)])))

(defn- create-warehouse!
  "A fresh database with a provisioning login that is not a superuser, and `sales`, an input schema owned by
  `mb_ws_test_etl`, a role the provisioning login is a member of."
  [spec]
  (exec! spec ["DROP SCHEMA IF EXISTS sales CASCADE"])
  (doseq [role ["mb_ws_test_etl" (:user provisioner)]]
    (drop-role-if-exists! spec role))
  (exec! spec [(format "CREATE ROLE %s LOGIN CREATEROLE PASSWORD '%s'" (:user provisioner) (:password provisioner))
               (format "GRANT CREATE ON DATABASE %s TO %s" db-name (:user provisioner))
               "CREATE ROLE mb_ws_test_etl NOLOGIN"
               (format "GRANT mb_ws_test_etl TO %s" (:user provisioner))
               "CREATE SCHEMA sales AUTHORIZATION mb_ws_test_etl"
               "CREATE TABLE sales.orders (id int)"
               "ALTER TABLE sales.orders OWNER TO mb_ws_test_etl"
               "INSERT INTO sales.orders VALUES (1), (2)"]))

(defn- do-with-warehouse!
  "Calls `(f superuser-spec database)`, with `database` the Lib metadata of a Database whose own login is the superuser
  and whose provisioning login is `provisioning-details`."
  [provisioning-details f]
  (mt/test-driver :postgres
    (tx/drop-if-exists-and-create-db! :postgres db-name)
    (let [spec (sql-jdbc.conn/connection-details->spec :postgres (superuser-details))]
      (create-warehouse! spec)
      (mt/with-temp [:model/Database {db-id :id} {:engine :postgres, :details (superuser-details)}]
        (mt/with-dynamic-fn-redefs [driver.conn/database-workspace-provisioning-details (constantly provisioning-details)]
          (f spec (driver.u/lib-database db-id)))))))

(defn- workspace-with-details [database id]
  (let [workspace {:id id, :name (str "wsd-" id)}]
    (merge workspace (driver.conn/with-workspace-provisioning-connection
                       (driver/workspace-isolation-details :postgres database workspace)))))

(defn- provisioning [f]
  (driver.conn/with-workspace-provisioning-connection (f)))

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

(deftest methods-run-as-the-provisioning-login-test
  (do-with-warehouse!
   provisioner
   (fn [spec database]
     (let [workspace (workspace-with-details database 2001)
           user      (-> workspace :database_details :user)]
       (drop-role-if-exists! spec user)
       (driver.conn/with-workspace-provisioning-connection
         (testing "init creates the output schema as the provisioning login"
           (driver/init-workspace-isolation! :postgres database workspace)
           (is (= (:user provisioner) (schema-owner spec (:schema workspace))))
           (is (role-exists? spec user)))
         (testing "grant reads the input schema with the provisioning login's grant options"
           (driver/grant-workspace-read-access! :postgres database workspace ["sales"])
           (is (= [{:count 2}]
                  (jdbc/query (sql-jdbc.conn/connection-details->spec
                               :postgres (merge (superuser-details) (:database_details workspace)))
                              ["SELECT count(*) FROM sales.orders"]))))
         (testing "destroy drops the output schema and the user"
           (driver/destroy-workspace-isolation! :postgres database workspace)
           (is (nil? (schema-owner spec (:schema workspace))))
           (is (not (role-exists? spec user)))))))))

(deftest no-provisioning-login-changes-nothing-test
  (do-with-warehouse!
   nil
   (fn [spec database]
     (let [workspace (assoc (workspace-with-details database 2002) :database_details {:user     "mb__isolation_b1_2002"
                                                                                      :password "Passw0rd"})]
       (drop-role-if-exists! spec "mb__isolation_b1_2002")
       (testing "without a provisioning login, init in the scope throws instead of running as the main login"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no workspace provisioning connection"
                               (driver.conn/with-workspace-provisioning-connection
                                 (driver/init-workspace-isolation! :postgres database workspace))))
         (is (not (role-exists? spec "mb__isolation_b1_2002")))
         (is (nil? (schema-owner spec (:schema workspace)))))))))

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

(deftest init-refuses-an-existing-user-test
  (do-with-warehouse!
   provisioner
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
   provisioner
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
   provisioner
   (fn [spec database]
     (let [workspace (new-workspace! spec database 2103)
           password  (-> workspace :database_details :password)
           messages  (fn [^Throwable t]
                       (->> t
                            (iterate #(or (ex-cause %) (when (instance? java.sql.SQLException %)
                                                         (.getNextException ^java.sql.SQLException %))))
                            (take-while some?)
                            (map ex-message)))]
       (exec! spec [(format "ALTER ROLE %s NOCREATEROLE" (:user provisioner))])
       (testing "the statements sent to the server never carry the password, which the server logs when one fails"
         ;; the batch wrapper's message quotes the statement as sent
         (mt/with-dynamic-fn-redefs [driver.u/batch-exception identity]
           (let [e (is (thrown? java.sql.SQLException
                                (provisioning #(driver/init-workspace-isolation! :postgres database workspace))))]
             (is (some #(str/includes? % "CREATE USER") (messages e)))
             (is (not-any? #(str/includes? % "PASSWORD") (messages e)))
             (is (not-any? #(str/includes? % password) (messages e))))))
       (exec! spec [(format "ALTER ROLE %s CREATEROLE" (:user provisioner))])
       (provisioning #(driver/init-workspace-isolation! :postgres database workspace))
       (testing "the password is stored as a SCRAM verifier and logs in"
         (is (str/starts-with? (:rolpassword (first (jdbc/query spec ["SELECT rolpassword FROM pg_authid WHERE rolname = ?"
                                                                      (-> workspace :database_details :user)])))
                               "SCRAM-SHA-256$"))
         (is (= [{:one 1}] (as-workspace-user workspace "SELECT 1 AS one"))))
       (provisioning #(driver/destroy-workspace-isolation! :postgres database workspace))))))
