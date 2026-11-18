(ns metabase.driver.mysql.workspace-test
  "Tests for the MySQL workspace isolation methods: the statements they build, and their effect on a real server."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
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
  (testing "the bound database is always granted, once, and `_` and `%` in the names are escaped when they are wildcards"
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

(deftest check-account-lock-supported!-test
  (testing "init refuses MariaDB before 10.4, which has no ACCOUNT LOCK; MySQL and MariaDB 10.4 and later pass"
    (is (= [nil nil nil nil nil nil]
           (map #(#'mysql/check-account-lock-supported! (apply metadata %))
                [["MySQL" 5 7] ["MySQL" 8 0] ["MySQL" 8 4] ["MariaDB" 10 4] ["MariaDB" 10 6] ["MariaDB" 11 8]])))
    (is (= {:message (str "The warehouse runs MariaDB 10.3. Workspaces need MariaDB 10.4 or later, because earlier "
                          "versions cannot lock the workspace user's login during teardown.")
            :data    {:status-code 412, :workspace/cleanup? false}}
           (try
             (#'mysql/check-account-lock-supported! (metadata "MariaDB" 10 3))
             nil
             (catch clojure.lang.ExceptionInfo e
               {:message (ex-message e), :data (ex-data e)}))))))

(deftest kill-privileges-test
  (testing "MySQL ends sessions with CONNECTION_ADMIN or SUPER; MariaDB with SUPER before 10.5, either up to 11.0, then CONNECTION ADMIN only"
    (is (= [["CONNECTION_ADMIN" "SUPER"] ["SUPER"] ["CONNECTION ADMIN" "SUPER"] ["CONNECTION ADMIN" "SUPER"]
            ["CONNECTION ADMIN"] ["CONNECTION ADMIN"]]
           (map #(#'mysql/kill-privileges (apply metadata %))
                [["MySQL" 8 4] ["MariaDB" 10 4] ["MariaDB" 10 5] ["MariaDB" 10 11] ["MariaDB" 11 0] ["MariaDB" 13 0]])))))

(deftest global-privileges-test
  (testing "only the privileges granted on *.* count; role, proxy and database grants do not"
    (is (= #{"PROCESS" "SUPER" "BACKUP_ADMIN" "CONNECTION_ADMIN" "CONNECTION ADMIN"}
           (#'mysql/global-privileges
            ["GRANT PROCESS, SUPER ON *.* TO `a`@`%`"
             "GRANT BACKUP_ADMIN,CONNECTION_ADMIN ON *.* TO `a`@`%` WITH GRANT OPTION"
             "GRANT `r` TO `a`@`%`"
             "GRANT CONNECTION ADMIN ON *.* TO `r`"
             "GRANT PROXY ON ''@'%' TO 'a'@'%'"
             "GRANT SELECT, INSERT ON `db`.* TO `a`@`%`"
             "REVOKE INSERT ON `mysql`.* FROM `a`@`%`"]))))
  (testing "a column grant whose quoted name contains \" ON *.* TO \" grants nothing on *.*"
    (is (= #{}
           (#'mysql/global-privileges
            ["GRANT SELECT (`c, PROCESS, CONNECTION_ADMIN ON *.* TO x`) ON `db`.`t` TO `a`@`%`"
             "GRANT SELECT ON `db`.`t, PROCESS, CONNECTION_ADMIN ON *.* TO x` TO `a`@`%`"])))))

(deftest missing-session-privileges-test
  (let [kill ["CONNECTION_ADMIN" "SUPER"]]
    (is (= [] (#'mysql/missing-session-privileges #{"PROCESS" "SUPER"} kill)))
    (is (= [] (#'mysql/missing-session-privileges #{"ALL PRIVILEGES"} kill)))
    (is (= ["PROCESS"] (#'mysql/missing-session-privileges #{"CONNECTION_ADMIN"} kill)))
    (is (= ["CONNECTION_ADMIN"] (#'mysql/missing-session-privileges #{"PROCESS"} kill)))
    (testing "no privilege read, for example when the lines cannot be parsed, means everything is missing"
      (is (= ["PROCESS" "CONNECTION_ADMIN"] (#'mysql/missing-session-privileges #{} kill))))))

(deftest quote-account-test
  (is (= "`a@b`@`%`" (#'mysql/quote-account "a@b@%"))))

(deftest public-role-supported?-test
  (testing "MariaDB has the PUBLIC role from 10.11; MySQL has none"
    (is (= [false false false true true]
           (map #(#'mysql/public-role-supported? (apply metadata %))
                [["MySQL" 8 4] ["MariaDB" 10 6] ["MariaDB" 10 10] ["MariaDB" 10 11] ["MariaDB" 13 0]])))))

(deftest public-revoke-sql-test
  (is (= "REVOKE INSERT, UPDATE ON `mb_test`.* FROM PUBLIC;"
         (#'mysql/public-revoke-sql "GRANT INSERT, UPDATE ON `mb_test`.* TO PUBLIC")))
  (testing "a role granted to PUBLIC: only the line whose grantee is PUBLIC gives a REVOKE (MariaDB 11.8 output)"
    (is (= ["REVOKE `r` FROM PUBLIC;"]
           (keep #'mysql/public-revoke-sql ["GRANT `r` TO PUBLIC"
                                            "GRANT USAGE ON *.* TO `r`"
                                            "GRANT INSERT ON `mb_test`.* TO `r`"])))))

;;; ------------------------------------------------ Live tests ------------------------------------------------------

(defn- admin-spec [database]
  (sql-jdbc.conn/connection-details->spec :mysql (:details database)))

(defn- user-spec [database workspace]
  (sql-jdbc.conn/connection-details->spec :mysql (merge (:details database) (:database_details workspace))))

(defn- new-workspace [database]
  (let [workspace {:id (+ 1000000 (rand-int 1000000)), :name "mysql workspace test"}]
    (merge workspace (driver/workspace-isolation-details :mysql database workspace))))

(defn- open-session
  "A connection as the user in `(:database_details workspace)`, outside any pool: the session must stay open across the
  code under test."
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

(deftest ^:mb/driver-tests ^:synchronized workspace-reads-the-bound-database-test
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

(deftest ^:mb/driver-tests ^:synchronized init-refuses-an-existing-user-test
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

(deftest ^:mb/driver-tests ^:synchronized init-refuses-an-existing-database-test
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

(deftest ^:mb/driver-tests ^:synchronized destroy-ends-open-sessions-test
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
            (let [teardown (future (driver/destroy-workspace-isolation! :mysql database workspace))
                  result   (deref teardown 30000 ::timed-out)]
              ;; on a regression, release the lock so the hung teardown and the one in `finally` can finish
              (when (= ::timed-out result)
                (.rollback conn)
                @teardown)
              (is (not= ::timed-out result)))
            (is (not (database-exists? database db-name)))
            (is (not (user-exists? database (-> workspace :database_details :user))))
            (is (thrown? java.sql.SQLException
                         (with-open [stmt (.createStatement conn)]
                           (.execute stmt "SELECT 1"))))))
        (finally
          (driver/destroy-workspace-isolation! :mysql database workspace))))))

(deftest ^:mb/driver-tests ^:synchronized kill-denied-is-skipped-and-logged-with-the-missing-privilege-test
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
          (mt/with-log-messages-for-level [messages [metabase.driver.mysql :warn]]
            (testing "an idle session the admin may not KILL is skipped instead of thrown"
              (is (nil? (#'mysql/kill-user-sessions! {:connection conn} stmt (-> workspace :database_details :user)))))
            (testing "the warning names the session, the user, and the privilege the admin login lacks"
              (is (=? [{:level   :warn
                        :message (re-pattern (str "^Cannot end session \\d+ of workspace user "
                                                  (-> workspace :database_details :user)
                                                  ": the admin connection's login lacks "
                                                  "(CONNECTION_ADMIN or SUPER|CONNECTION ADMIN or SUPER|CONNECTION ADMIN|SUPER)\\. "
                                                  "The session keeps its access until it disconnects, .*"))}]
                      (messages))))))
        (finally
          (driver/destroy-workspace-isolation! :mysql database workspace)
          (jdbc/execute! (admin-spec database) [(format "DROP USER IF EXISTS `%s`@'%%'" admin)]))))))

(defn- mariadb? [database]
  (str/includes? (:v (first (jdbc/query (admin-spec database) ["SELECT VERSION() AS v"]))) "MariaDB"))

(defn- do-with-login
  "Calls `(f login)` with `login`, the `{:user :password}` of a new login that holds every global privilege except
  `revoked`. When `role-privileges` is set, the login also holds a role with those privileges, which is active in its
  sessions only when `active-role?`."
  [database {:keys [revoked role-privileges active-role?]} f]
  (let [admin  (admin-spec database)
        user   (str "ws_adm_" (rand-int 1000000))
        role   (str "ws_role_" (rand-int 1000000))
        login  {:user user :password "TestAdm1n!"}]
    (try
      (jdbc/execute! admin [(format "CREATE USER `%s`@'%%' IDENTIFIED BY '%s'" user (:password login))])
      (jdbc/execute! admin [(format "GRANT ALL PRIVILEGES ON *.* TO `%s`@'%%' WITH GRANT OPTION" user)])
      (when (seq revoked)
        (jdbc/execute! admin [(format "REVOKE %s ON *.* FROM `%s`@'%%'" (str/join ", " revoked) user)]))
      (when role-privileges
        (jdbc/execute! admin [(format "CREATE ROLE `%s`" role)])
        (jdbc/execute! admin [(format "GRANT %s ON *.* TO `%s`" (str/join ", " role-privileges) role)])
        (jdbc/execute! admin [(format "GRANT `%s` TO `%s`@'%%'" role user)])
        (when active-role?
          (jdbc/execute! admin [(format (if (mariadb? database)
                                          "SET DEFAULT ROLE `%s` FOR `%s`@'%%'"
                                          "SET DEFAULT ROLE `%s` TO `%s`@'%%'")
                                        role user)])))
      (f login)
      (finally
        (jdbc/execute! admin [(format "DROP USER IF EXISTS `%s`@'%%'" user)])
        (when role-privileges
          (jdbc/execute! admin [(format "DROP ROLE IF EXISTS `%s`" role)]))))))

(defn- ends-another-users-session?
  "Whether `login` finds the session of another user in the process list and ends it with KILL: what the server
  allows, independent of the code under test."
  [database login]
  (let [victim {:user (str "ws_victim_" (rand-int 1000000)) :password "Victim0ne!"}]
    (try
      (jdbc/execute! (admin-spec database) [(format "CREATE USER `%s`@'%%' IDENTIFIED BY '%s'" (:user victim) (:password victim))])
      (jdbc/execute! (admin-spec database) [(format "GRANT SELECT ON `%s`.* TO `%s`@'%%'" (-> database :details :db) (:user victim))])
      (with-open [session (open-session database {:database_details victim})
                  conn    (open-session database {:database_details login})
                  stmt    (.createStatement conn)]
        (let [ids (map :id (jdbc/query {:connection conn} ["SELECT ID AS id FROM information_schema.PROCESSLIST WHERE USER = ?"
                                                           (:user victim)]))]
          (boolean
           (and (seq ids)
                (try
                  (doseq [id ids]
                    (.execute stmt (format "KILL %d" (long id))))
                  true
                  (catch java.sql.SQLException _
                    false))
                (not (.isValid session 2))))))
      (finally
        (jdbc/execute! (admin-spec database) [(format "DROP USER IF EXISTS `%s`@'%%'" (:user victim))])))))

(deftest ^:mb/driver-tests ^:synchronized init-refuses-an-admin-that-cannot-end-sessions-test
  (mt/test-driver :mysql
    (let [database (mt/db)
          kill     (if (mariadb? database) "CONNECTION ADMIN" "CONNECTION_ADMIN")
          ;; [description, login, whether init must accept it (nil: whatever the server allows)]
          cases    [["every privilege" {} true]
                    ["without PROCESS" {:revoked ["PROCESS"]} false]
                    [(str "without " kill ", with SUPER") {:revoked [kill]} nil]
                    [(str "without " kill " or SUPER") {:revoked [kill "SUPER"]} false]
                    ["without SUPER" {:revoked ["SUPER"]} true]
                    ["with PROCESS and the kill privilege through an active role"
                     {:revoked ["PROCESS" kill "SUPER"] :role-privileges ["PROCESS" kill] :active-role? true} true]
                    ["with PROCESS and the kill privilege through a role that is not active"
                     {:revoked ["PROCESS" kill "SUPER"] :role-privileges ["PROCESS" kill] :active-role? false} false]]
          results  (mapv (fn [[description setup expected]]
                           (do-with-login
                            database setup
                            (fn [login]
                              (let [workspace (new-workspace database)
                                    allowed?  (ends-another-users-session? database login)
                                    refused   (refusal #(driver.conn/with-swapped-connection-details (mt/id) login
                                                          (driver/init-workspace-isolation! :mysql database workspace)))
                                    created?  (or (user-exists? database (-> workspace :database_details :user))
                                                  (database-exists? database (:schema workspace)))]
                                (driver/destroy-workspace-isolation! :mysql database workspace)
                                (testing description
                                  (testing "init accepts the login exactly when the server lets it see and end another user's session"
                                    (is (= allowed? (nil? refused)) (pr-str refused)))
                                  (when (some? expected)
                                    (testing "the server behaves as documented"
                                      (is (= expected allowed?))))
                                  (when refused
                                    (testing "the refusal is a 412 that names the grant, and init created nothing"
                                      (is (= {:status-code 412, :workspace/cleanup? false} (:data refused)))
                                      (is (re-find (re-pattern (str "`GRANT [^`]*(PROCESS|" kill "|SUPER)[^`]* ON \\*\\.\\* TO `"
                                                                    (:user login) "`@`%`;`"))
                                                   (:message refused)))
                                      (is (not created?)))))
                                allowed?))))
                         cases)]
      (testing "the cases include logins the server lets end sessions and logins it does not"
        (is (= #{true false} (set results)))))))

(defn- server-version [database]
  (sql-jdbc.execute/do-with-connection-with-options
   :mysql (:id database) nil
   (fn [^java.sql.Connection conn]
     (let [md (.getMetaData conn)]
       [(.getDatabaseProductName md) (.getDatabaseMajorVersion md) (.getDatabaseMinorVersion md)]))))

(deftest ^:mb/driver-tests ^:synchronized init-refuses-mariadb-before-10-4-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          [product major minor] (server-version database)
          refused   (refusal #(driver/init-workspace-isolation! :mysql database workspace))
          created?  (or (user-exists? database (-> workspace :database_details :user))
                        (database-exists? database (:schema workspace)))]
      (driver/destroy-workspace-isolation! :mysql database workspace)
      (if (and (= "MariaDB" product) (neg? (compare [major minor] [10 4])))
        (testing "MariaDB before 10.4 has no ACCOUNT LOCK, so init refuses it with a 412 and creates nothing"
          (is (= {:message (format (str "The warehouse runs MariaDB %d.%d. Workspaces need MariaDB 10.4 or later, "
                                        "because earlier versions cannot lock the workspace user's login during teardown.")
                                   major minor)
                  :data    {:status-code 412, :workspace/cleanup? false}}
                 refused))
          (is (not created?)))
        (testing (str product " " major "." minor " has ACCOUNT LOCK, so init does not refuse it")
          (is (nil? refused))
          (is created?))))))

(deftest ^:mb/driver-tests ^:synchronized init-refuses-a-role-every-login-holds-test
  (mt/test-driver :mysql
    (let [database   (mt/db)
          admin      (admin-spec database)
          bound-db   (-> database :details :db)
          [product major minor] (server-version database)
          mariadb?   (= "MariaDB" product)
          role       (str "ws_every_" (rand-int 1000000))
          ;; [statements that give every login INSERT on the bound database, statements that undo them]
          [set-up undo] (cond
                          (not mariadb?)
                          [[(format "CREATE ROLE `%s`" role)
                            (format "GRANT INSERT ON `%s`.* TO `%s`" bound-db role)
                            (format "SET GLOBAL mandatory_roles = '`%s`@`%%`'" role)]
                           ["SET GLOBAL mandatory_roles = ''"
                            (format "DROP ROLE IF EXISTS `%s`" role)]]

                          (>= (compare [major minor] [10 11]) 0)
                          [[(format "GRANT INSERT ON `%s`.* TO PUBLIC" bound-db)]
                           [(format "REVOKE INSERT ON `%s`.* FROM PUBLIC" bound-db)]])]
      (if-not set-up
        (testing "MariaDB before 10.11 has no PUBLIC role: the check reads nothing and passes"
          (sql-jdbc.execute/do-with-connection-with-options
           :mysql (:id database) nil
           (fn [conn]
             (is (nil? (#'mysql/check-no-roles-for-every-login! conn))))))
        (do-with-source-table
         database
         (fn [table]
           (let [insert! (fn [workspace]
                           (with-open [session (open-session database workspace)
                                       stmt    (.createStatement session)]
                             (try
                               (when-not mariadb?
                                 (.execute stmt "SET ROLE ALL"))
                               (.execute stmt (format "INSERT INTO `%s` VALUES (2)" table))
                               :inserted
                               (catch java.sql.SQLException e
                                 (ex-message e)))))]
             (try
               (doseq [sql set-up]
                 (jdbc/execute! admin [sql]))
               (let [workspace (new-workspace database)]
                 (try
                   (mt/with-dynamic-fn-redefs [mysql/check-no-roles-for-every-login! (constantly nil)]
                     (driver/init-workspace-isolation! :mysql database workspace))
                   (driver/grant-workspace-read-access! :mysql database workspace [])
                   (testing "premise: without the check, the workspace user inserts into the bound database"
                     (is (= :inserted (insert! workspace))))
                   (finally
                     (driver/destroy-workspace-isolation! :mysql database workspace))))
               (let [workspace (new-workspace database)
                     refused   (refusal #(driver/init-workspace-isolation! :mysql database workspace))]
                 (testing "init refuses with a 412 that names the statement to run, and creates nothing"
                   (is (= {:status-code 412, :workspace/cleanup? false} (:data refused)))
                   (is (re-find (if mariadb?
                                  #"`REVOKE INSERT ON `[^`]+`\.\* FROM PUBLIC;`"
                                  #"`SET PERSIST mandatory_roles = '';`")
                                (str (:message refused))))
                   (is (not (user-exists? database (-> workspace :database_details :user))))
                   (is (not (database-exists? database (:schema workspace))))))
               (finally
                 (doseq [sql undo]
                   (jdbc/execute! admin [sql]))))
             (let [workspace (new-workspace database)]
               (try
                 (testing "with the setting removed, init succeeds and the workspace user cannot insert into the bound database"
                   (is (nil? (refusal #(driver/init-workspace-isolation! :mysql database workspace))))
                   (driver/grant-workspace-read-access! :mysql database workspace [])
                   (is (re-find #"denied" (str (insert! workspace)))))
                 (finally
                   (driver/destroy-workspace-isolation! :mysql database workspace)))))))))))

(deftest ^:mb/driver-tests ^:synchronized init-refusal-for-a-role-granted-to-public-names-only-revokes-test
  (mt/test-driver :mysql
    (let [database   (mt/db)
          admin      (admin-spec database)
          bound-db   (-> database :details :db)
          [product major minor] (server-version database)
          role       (str "ws_public_" (rand-int 1000000))]
      (if-not (and (= "MariaDB" product) (>= (compare [major minor] [10 11]) 0))
        (testing "only MariaDB from 10.11 has the PUBLIC role"
          (is (some? product)))
        (try
          (doseq [sql [(format "CREATE ROLE `%s`" role)
                       (format "GRANT INSERT ON `%s`.* TO `%s`" bound-db role)
                       (format "GRANT `%s` TO PUBLIC" role)]]
            (jdbc/execute! admin [sql]))
          (let [workspace (new-workspace database)
                refused   (refusal #(driver/init-workspace-isolation! :mysql database workspace))]
            (testing "init refuses with a 412 whose statements revoke only what PUBLIC holds"
              (is (= {:status-code 412, :workspace/cleanup? false} (:data refused)))
              (is (str/includes? (str (:message refused)) (format "`REVOKE `%s` FROM PUBLIC;`" role)))
              (is (not (re-find #"GRANT" (str (:message refused)))))
              (is (not (user-exists? database (-> workspace :database_details :user))))))
          (finally
            (doseq [sql [(format "REVOKE `%s` FROM PUBLIC" role)
                         (format "DROP ROLE IF EXISTS `%s`" role)]]
              (try
                (jdbc/execute! admin [sql])
                (catch Exception _ nil)))))))))

(defn- init-error
  "Runs `init`; returns the exception it throws, or nil."
  [init]
  (try
    (init)
    nil
    (catch Exception e
      e)))

(defn- cleanup-unless-refused!
  "What provisioning does after a failed init: a teardown, unless the error says `:workspace/cleanup? false`."
  [database workspace e]
  (when (and e (not (false? (:workspace/cleanup? (ex-data e)))))
    (try
      (driver/destroy-workspace-isolation! :mysql database workspace)
      (catch Exception _))))

(defn- grants [database user]
  (mapv (comp first vals) (jdbc/query (admin-spec database) [(format "SHOW GRANTS FOR `%s`@'%%'" user)])))

(deftest ^:mb/driver-tests ^:synchronized init-refuses-a-user-created-after-the-check-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          user      (-> workspace :database_details :user)
          other     {:database_details {:user user :password "OtherPassw0rd"}}]
      (try
        (jdbc/execute! (admin-spec database) [(format "CREATE USER `%s`@'%%' IDENTIFIED BY 'OtherPassw0rd'" user)])
        (jdbc/execute! (admin-spec database) [(format "GRANT SELECT ON `%s`.* TO `%s`@'%%'"
                                                      (-> database :details :db) user)])
        (testing "control: init refuses a user that exists at the check"
          (is (=? {:status-code 409, :workspace/cleanup? false}
                  (ex-data (init-error #(driver/init-workspace-isolation! :mysql database workspace))))))
        ;; the user appears between the check and CREATE USER
        (let [e (mt/with-dynamic-fn-redefs [mysql/mysql-user-exists? (constantly nil)]
                  (init-error #(driver/init-workspace-isolation! :mysql database workspace)))]
          (testing "init refuses a user created after the check, with the 409 that forbids teardown"
            (is (=? {:status-code 409, :workspace/cleanup? false} (ex-data e))
                (ex-message e)))
          (testing "init grants the other owner's user nothing on this init's database"
            (is (not-any? #(str/includes? % "INSERT") (grants database user))))
          (cleanup-unless-refused! database workspace e))
        (testing "the other owner's user survives provisioning, with its password"
          (is (= [{:one 1}] (as-user database other "SELECT 1 AS one"))))
        (finally
          (jdbc/execute! (admin-spec database) [(format "DROP USER IF EXISTS `%s`@'%%'" user)])
          (jdbc/execute! (admin-spec database) [(format "DROP DATABASE IF EXISTS `%s`" (:schema workspace))]))))))

(deftest ^:mb/driver-tests ^:synchronized init-refuses-a-database-created-after-the-check-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          user      (-> workspace :database_details :user)
          db-name   (:schema workspace)]
      (try
        (jdbc/execute! (admin-spec database) [(format "CREATE DATABASE `%s`" db-name)])
        (jdbc/execute! (admin-spec database) [(format "CREATE TABLE `%s`.kept (id INT)" db-name)])
        (jdbc/execute! (admin-spec database) [(format "INSERT INTO `%s`.kept VALUES (42)" db-name)])
        (testing "control: init refuses a database that exists at the check"
          (is (=? {:status-code 409, :workspace/cleanup? false}
                  (ex-data (init-error #(driver/init-workspace-isolation! :mysql database workspace))))))
        ;; the database appears between the check and CREATE DATABASE
        (let [e (mt/with-dynamic-fn-redefs [mysql/database-exists? (constantly nil)]
                  (init-error #(driver/init-workspace-isolation! :mysql database workspace)))]
          (testing "init refuses a database created after the check, with the 409 that forbids teardown"
            (is (=? {:status-code 409, :workspace/cleanup? false} (ex-data e))
                (ex-message e)))
          (testing "init gives its workspace user no grant on the other owner's database"
            (is (not (user-exists? database user))
                (pr-str (when (user-exists? database user) (grants database user)))))
          (cleanup-unless-refused! database workspace e))
        (testing "the other owner's database survives provisioning, with its table"
          (is (= [{:id 42}] (try
                              (jdbc/query (admin-spec database) [(format "SELECT id FROM `%s`.kept" db-name)])
                              (catch java.sql.SQLException e
                                (ex-message e))))))
        (finally
          (jdbc/execute! (admin-spec database) [(format "DROP USER IF EXISTS `%s`@'%%'" user)])
          (jdbc/execute! (admin-spec database) [(format "DROP DATABASE IF EXISTS `%s`" db-name)]))))))

(deftest ^:mb/driver-tests ^:synchronized retried-destroy-still-finds-the-sessions-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          user      (-> workspace :database_details :user)
          db-name   (:schema workspace)
          ;; can run teardown, but cannot end another user's session (no CONNECTION ADMIN or SUPER)
          no-kill   {:user (str "ws_nokill_" (rand-int 1000000)) :password "NoKillAdm1n!"}
          timeout   (-> (jdbc/query (admin-spec database) ["SELECT @@GLOBAL.lock_wait_timeout AS t"]) first :t)
          destroy!  #(try
                       (driver.conn/with-swapped-connection-details (mt/id) no-kill
                         (driver/destroy-workspace-isolation! :mysql database workspace))
                       :ok
                       (catch Exception e
                         (ex-message e)))]
      (try
        (jdbc/execute! (admin-spec database) [(format "CREATE USER `%s`@'%%' IDENTIFIED BY '%s'" (:user no-kill) (:password no-kill))])
        (jdbc/execute! (admin-spec database) [(format "GRANT SELECT, CREATE, DROP, PROCESS, CREATE USER ON *.* TO `%s`@'%%'" (:user no-kill))])
        (jdbc/execute! (admin-spec database) ["SET GLOBAL lock_wait_timeout = 5"])
        (driver/init-workspace-isolation! :mysql database workspace)
        (driver/grant-workspace-read-access! :mysql database workspace [])
        (jdbc/execute! (user-spec database workspace) [(format "CREATE TABLE `%s`.t (id INT)" db-name)])
        (with-open [session (open-session database workspace)]
          (.setAutoCommit session false)
          (with-open [stmt (.createStatement session)]
            ;; the open transaction holds a metadata lock on `t`, which DROP DATABASE waits for
            (.execute stmt (format "SELECT * FROM `%s`.t" db-name)))
          (let [first-try (destroy!)
                after-1   {:user? (boolean (user-exists? database user))
                           :database? (boolean (database-exists? database db-name))
                           :session-open? (.isValid session 2)}
                retry     (destroy!)
                after-2   {:user? (boolean (user-exists? database user))
                           :database? (boolean (database-exists? database db-name))
                           :session-open? (.isValid session 2)}]
            (testing "precondition: teardown cannot end the session, so DROP DATABASE times out on its lock"
              (is (re-find #"Another session holds a lock" (str first-try))))
            (testing "a failed teardown ends the session or keeps the user, so a retry can find its sessions"
              (is (or (not (:session-open? after-1)) (:user? after-1))
                  (pr-str after-1)))
            (testing "a retried teardown does not leave the database with its user gone"
              (is (not (and (:database? after-2) (not (:user? after-2))))
                  (pr-str [first-try after-1 retry after-2])))
            (.rollback session)))
        (finally
          (jdbc/execute! (admin-spec database) [(format "SET GLOBAL lock_wait_timeout = %d" (long timeout))])
          (driver/destroy-workspace-isolation! :mysql database workspace)
          (jdbc/execute! (admin-spec database) [(format "DROP USER IF EXISTS `%s`@'%%'" (:user no-kill))]))))))

(deftest ^:mb/driver-tests ^:synchronized destroy-waits-for-another-users-lock-at-most-the-bound-test
  (mt/test-driver :mysql
    (let [database  (mt/db)
          workspace (new-workspace database)
          db-name   (:schema workspace)
          ;; a user other than the workspace user, whose session teardown does not end
          other     {:user (str "ws_other_" (rand-int 1000000)) :password "OtherUs3r!"}]
      (try
        (driver/init-workspace-isolation! :mysql database workspace)
        (driver/grant-workspace-read-access! :mysql database workspace [])
        (jdbc/execute! (user-spec database workspace) [(format "CREATE TABLE `%s`.t (id INT)" db-name)])
        (jdbc/execute! (admin-spec database) [(format "CREATE USER `%s`@'%%' IDENTIFIED BY '%s'" (:user other) (:password other))])
        (jdbc/execute! (admin-spec database) [(format "GRANT SELECT ON `%s`.* TO `%s`@'%%'" (-> database :details :db) (:user other))])
        (jdbc/execute! (admin-spec database) [(format "GRANT SELECT ON `%s`.* TO `%s`@'%%'" db-name (:user other))])
        (with-open [session (open-session database {:database_details other})]
          (.setAutoCommit session false)
          (with-open [stmt (.createStatement session)]
            ;; the open transaction holds a metadata lock on `t`, which DROP DATABASE waits for
            (.execute stmt (format "SELECT * FROM `%s`.t" db-name)))
          (let [teardown (future
                           (try
                             (driver/destroy-workspace-isolation! :mysql database workspace)
                             :returned
                             (catch Exception e
                               e)))
                result   (deref teardown 60000 ::still-waiting)]
            (when (= ::still-waiting result)
              (.rollback session)
              (deref teardown 30000 nil))
            (testing "teardown stops waiting for the other user's lock, and answers 409"
              (is (not= ::still-waiting result))
              (is (=? {:status-code 409} (ex-data result))
                  (pr-str result)))
            (testing "the database stays, with its user, so a retry can finish"
              (is (database-exists? database db-name))
              (is (user-exists? database (-> workspace :database_details :user))))
            (.rollback session)))
        (testing "once the other session releases its lock, a retried teardown finishes"
          (driver/destroy-workspace-isolation! :mysql database workspace)
          (is (not (database-exists? database db-name))))
        (finally
          (driver/destroy-workspace-isolation! :mysql database workspace)
          (jdbc/execute! (admin-spec database) [(format "DROP USER IF EXISTS `%s`@'%%'" (:user other))]))))))
