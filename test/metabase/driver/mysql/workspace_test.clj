(ns ^:mb/driver-tests metabase.driver.mysql.workspace-test
  "Tests for the MySQL workspace isolation methods: the statements they build, and their effect on a real server."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest init-workspace-isolation-sqls-test
  (testing "init creates the database and user without IF NOT EXISTS, and escapes the wildcards of the GRANT database"
    (is (= ["CREATE DATABASE `mb__ws_1`"
            "CREATE USER `mb_user_1`@'%' IDENTIFIED BY 'pw'"
            "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER ON `mb\\_\\_ws\\_1`.* TO `mb_user_1`@'%'"]
           (#'mysql/init-workspace-isolation-sqls true "mb__ws_1" "mb_user_1" "pw"))))
  (testing "with partial_revokes ON, `_` is literal in GRANT, so it is not escaped"
    (is (= "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER ON `mb__ws_1`.* TO `mb_user_1`@'%'"
           (last (#'mysql/init-workspace-isolation-sqls false "mb__ws_1" "mb_user_1" "pw"))))))

(deftest quote-grant-db-test
  (testing "with wildcards on, `_`, `%` and the escape character `\\` itself are escaped"
    (is (= "`a\\\\\\_b\\%`" (#'mysql/quote-grant-db true "a\\_b%"))))
  (testing "with partial_revokes on they are literal, so nothing is escaped"
    (is (= "`a\\_b%`" (#'mysql/quote-grant-db false "a\\_b%")))))

(deftest grant-workspace-read-access-sqls-test
  (testing "the bound database is always granted, once, and `_` and `%` in the names are escaped"
    (is (= ["GRANT SELECT ON `test\\_data`.* TO `u`@'%'"
            "GRANT SELECT ON `other\\%db`.* TO `u`@'%'"]
           (#'mysql/grant-workspace-read-access-sqls true "u" "test_data" ["test_data" "other%db"])))
    (is (= ["GRANT SELECT ON `test\\_data`.* TO `u`@'%'"]
           (#'mysql/grant-workspace-read-access-sqls true "u" "test_data" [])))
    (is (= ["GRANT SELECT ON `test_data`.* TO `u`@'%'"]
           (#'mysql/grant-workspace-read-access-sqls false "u" "test_data" [])))))

(deftest destroy-workspace-isolation-sqls-test
  (is (= "ALTER USER IF EXISTS `u`@'%' ACCOUNT LOCK"
         (#'mysql/lock-workspace-user-sql "u")))
  (is (= ["DROP DATABASE IF EXISTS `mb__ws_1`" "DROP USER IF EXISTS `u`@'%'"]
         (#'mysql/drop-workspace-isolation-sqls "mb__ws_1" "u" true)))
  (is (= ["DROP DATABASE IF EXISTS `mb__ws_1`"]
         (#'mysql/drop-workspace-isolation-sqls "mb__ws_1" "u" false))))

(defn- metadata ^java.sql.DatabaseMetaData [product major minor]
  (reify java.sql.DatabaseMetaData
    (getDatabaseProductName [_] product)
    (getDatabaseMajorVersion [_] major)
    (getDatabaseMinorVersion [_] minor)))

(deftest account-lock-supported?-test
  (testing "MySQL always has ACCOUNT LOCK; MariaDB has it from 10.4, including 10.10 and later"
    (is (= [true false false true true true]
           (map #(#'mysql/account-lock-supported? (apply metadata %))
                [["MySQL" 5 7] ["MariaDB" 10 2] ["MariaDB" 10 3] ["MariaDB" 10 4] ["MariaDB" 10 11] ["MariaDB" 11 4]])))))

;;; ------------------------------------------------ Live tests ------------------------------------------------------

(defn- admin-spec [database]
  (sql-jdbc.conn/connection-details->spec :mysql (:details database)))

(defn- user-spec [database workspace]
  (sql-jdbc.conn/connection-details->spec :mysql (merge (:details database) (:database_details workspace))))

(defn- new-workspace [database]
  (let [workspace {:id (+ 1000000 (rand-int 1000000)), :name "mysql workspace test"}]
    (merge workspace (driver/workspace-isolation-details :mysql database workspace))))

(defn- open-session
  "A connection as the workspace user, outside any pool: the session must stay open across the code under test."
  ^java.sql.Connection [database workspace]
  (let [{:keys [subprotocol subname user password]} (user-spec database workspace)]
    (java.sql.DriverManager/getConnection (str "jdbc:" subprotocol ":" subname) ^String user ^String password)))

(defn- user-exists? [database user]
  (seq (jdbc/query (admin-spec database) ["SELECT 1 FROM mysql.user WHERE user = ?" user])))

(defn- database-exists? [database db-name]
  (seq (jdbc/query (admin-spec database) ["SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?" db-name])))

(defn- as-user
  "Runs `sql` as the workspace user; returns the rows, or the error message."
  [database workspace sql]
  (try
    (jdbc/query (user-spec database workspace) [sql])
    (catch java.sql.SQLException e
      (ex-message e))))

(defn- refusal [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      {:message (ex-message e)
       :data    (select-keys (ex-data e) [:status-code :workspace/cleanup?])})))

(defn- do-with-source-table
  "Calls `(f table)` with `table`, a table in the bound database with one row, dropped afterwards."
  [database f]
  (let [table (str "ws_src_" (rand-int 1000000))]
    (jdbc/execute! (admin-spec database) [(format "CREATE TABLE `%s` (id INT)" table)])
    (try
      (jdbc/execute! (admin-spec database) [(format "INSERT INTO `%s` VALUES (1)" table)])
      (f table)
      (finally
        (jdbc/execute! (admin-spec database) [(format "DROP TABLE IF EXISTS `%s`" table)])))))

(deftest ^:synchronized workspace-reads-the-bound-database-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          wild-db   (str/replace-first (:schema workspace) "_" "x")]
      (do-with-source-table
       database
       (fn [table]
         (try
           ;; a database the unescaped `mb__...` grant pattern would match: `_` matches the `x`
           (jdbc/execute! (admin-spec database) [(format "CREATE DATABASE `%s`" wild-db)])
           (jdbc/execute! (admin-spec database) [(format "CREATE TABLE `%s`.t (id INT)" wild-db)])
           (driver/init-workspace-isolation! :mysql database workspace)
           (driver/grant-workspace-read-access! :mysql database workspace [])
           (testing "with no input schemas, the workspace user connects to the bound database and reads it"
             (is (= [{:id 1}] (as-user database workspace (format "SELECT id FROM `%s`" table)))))
           (testing "the workspace user writes its own database"
             (jdbc/execute! (user-spec database workspace)
                            [(format "CREATE TABLE `%s`.out_t AS SELECT 1 AS id" (:schema workspace))])
             (is (= [{:id 1}] (as-user database workspace (format "SELECT id FROM `%s`.out_t" (:schema workspace))))))
           (testing "the grant on the workspace database does not cover a database its wildcards would match"
             (is (re-find #"denied" (str (as-user database workspace (format "SELECT * FROM `%s`.t" wild-db))))))
           (finally
             (driver/destroy-workspace-isolation! :mysql database workspace)
             (jdbc/execute! (admin-spec database) [(format "DROP DATABASE IF EXISTS `%s`" wild-db)]))))))))

(deftest ^:synchronized init-refuses-an-existing-user-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          user      (-> workspace :database_details :user)
          other     {:database_details {:user user :password "OtherPassw0rd"}}]
      (try
        (jdbc/execute! (admin-spec database) [(format "CREATE USER `%s`@'%%' IDENTIFIED BY 'OtherPassw0rd'" user)])
        (jdbc/execute! (admin-spec database) [(format "GRANT SELECT ON `%s`.* TO `%s`@'%%'"
                                                      (-> database :details :db) user)])
        (is (= {:message (format "The warehouse already has a user named `%s`. It may belong to another workspace, so it was left unchanged." user)
                :data    {:status-code 409, :workspace/cleanup? false}}
               (refusal #(driver/init-workspace-isolation! :mysql database workspace))))
        (testing "the user keeps its password, and no database was created"
          (is (= [{:one 1}] (as-user database other "SELECT 1 AS one")))
          (is (not (database-exists? database (:schema workspace)))))
        (finally
          (jdbc/execute! (admin-spec database) [(format "DROP USER IF EXISTS `%s`@'%%'" user)]))))))

(deftest ^:synchronized init-refuses-an-existing-database-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          db-name   (:schema workspace)]
      (try
        (jdbc/execute! (admin-spec database) [(format "CREATE DATABASE `%s`" db-name)])
        (jdbc/execute! (admin-spec database) [(format "CREATE TABLE `%s`.kept (id INT)" db-name)])
        (is (= {:message (format "The warehouse already has a database named `%s`. It may belong to another workspace, so it was left unchanged." db-name)
                :data    {:status-code 409, :workspace/cleanup? false}}
               (refusal #(driver/init-workspace-isolation! :mysql database workspace))))
        (testing "the database keeps its table, and no user was created"
          (is (= [{:n 0}] (jdbc/query (admin-spec database) [(format "SELECT count(*) AS n FROM `%s`.kept" db-name)])))
          (is (not (user-exists? database (-> workspace :database_details :user)))))
        (finally
          (jdbc/execute! (admin-spec database) [(format "DROP DATABASE IF EXISTS `%s`" db-name)]))))))

(deftest ^:synchronized destroy-ends-open-sessions-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          db-name   (:schema workspace)]
      (try
        (driver/init-workspace-isolation! :mysql database workspace)
        (driver/grant-workspace-read-access! :mysql database workspace [])
        (jdbc/execute! (user-spec database workspace) [(format "CREATE TABLE `%s`.t (id INT)" db-name)])
        (with-open [conn (open-session database workspace)]
          (.setAutoCommit conn false)
          (with-open [stmt (.createStatement conn)]
            ;; the open transaction holds a metadata lock on `t`, which DROP DATABASE waits for
            (.execute stmt (format "SELECT * FROM `%s`.t" db-name)))
          (testing "teardown ends the session instead of waiting for its lock"
            (is (not= ::timed-out (deref (future (driver/destroy-workspace-isolation! :mysql database workspace)) 30000 ::timed-out)))
            (is (not (database-exists? database db-name)))
            (is (not (user-exists? database (-> workspace :database_details :user))))
            (is (thrown? java.sql.SQLException
                         (with-open [stmt (.createStatement conn)]
                           (.execute stmt "SELECT 1"))))))
        (finally
          (driver/destroy-workspace-isolation! :mysql database workspace))))))

(deftest ^:synchronized kill-denied-does-not-stop-teardown-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          admin     (str "ws_noconn_" (rand-int 1000000))
          password  "LimitedAdm1n!"]
      (try
        (driver/init-workspace-isolation! :mysql database workspace)
        (driver/grant-workspace-read-access! :mysql database workspace [])
        ;; an admin that sees every session (PROCESS) but cannot end another user's (no CONNECTION_ADMIN or SUPER)
        (jdbc/execute! (admin-spec database) [(format "CREATE USER `%s`@'%%' IDENTIFIED BY '%s'" admin password)])
        (jdbc/execute! (admin-spec database) [(format "GRANT PROCESS ON *.* TO `%s`@'%%'" admin)])
        (jdbc/execute! (admin-spec database) [(format "GRANT SELECT ON `%s`.* TO `%s`@'%%'" (-> database :details :db) admin)])
        (with-open [_idle (open-session database workspace)
                    conn  (open-session database {:database_details {:user admin :password password}})
                    stmt  (.createStatement conn)]
          (testing "an idle session the admin may not KILL is skipped, so teardown goes on to the drops"
            (is (nil? (#'mysql/kill-user-sessions! {:connection conn} stmt (-> workspace :database_details :user))))))
        (finally
          (driver/destroy-workspace-isolation! :mysql database workspace)
          (jdbc/execute! (admin-spec database) [(format "DROP USER IF EXISTS `%s`@'%%'" admin)]))))))
