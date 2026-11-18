(ns metabase-enterprise.security-center.read-only-connections-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase-enterprise.security-center.read-only-connections :as read-only-connections]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- privileges
  "One row of table privileges with `overrides` on top. Select only unless told otherwise."
  [& {:as overrides}]
  [(merge {:role nil, :schema "public", :table "birds", :select true, :insert false, :update false, :delete false}
          overrides)])

(defn- do-with-fake-connections
  "Calls `f` while no database is asked: a new connection is the database map itself, and `user->rows` and
  `user->role` give the privilege rows of the connection user and the writable role it can switch to, from the `:user`
  of the connection details."
  [user->rows user->role f]
  (mt/with-dynamic-fn-redefs [sql-jdbc/do-with-new-connection        (fn [database g] (g database))
                              read-only-connections/table-privileges (fn [_engine {{:keys [user]} :details}]
                                                                       (user->rows user))
                              read-only-connections/writable-role    (fn [{{:keys [user]} :details} _conn]
                                                                       (user->role user))]
    (f)))

(defn- refresh-with!
  "Runs the refresh with the privilege rows of each database taken from `user->privileges`, keyed by the `:user` of
  its connection details, and the writable role from `user->role`. A function as a value is called. Returns the
  results of the databases named in `names`."
  ([user->privileges names]
   (refresh-with! user->privileges {} names))
  ([user->privileges user->role names]
   (let [value-of (fn [m user]
                    (let [v (get m user)]
                      (if (fn? v) (v) v)))]
     (do-with-fake-connections
      #(value-of user->privileges %)
      #(value-of user->role %)
      #(filterv (comp (set names) :name) (:databases (read-only-connections/refresh)))))))

(deftest refresh-test
  (mt/with-temp [:model/Database {router-id :id} {:name "rc router", :engine :postgres, :details {:user "reader"}}
                 :model/Database {dest-id :id}   {:name               "rc destination"
                                                  :engine             :postgres
                                                  :details            {:user "writer"}
                                                  :router_database_id router-id}
                 :model/Database {mysql-id :id}  {:name "rc mysql", :engine :mysql, :details {:user "updater"}}
                 :model/Database {h2-id :id}     {:name "rc h2", :engine :h2, :details {:db "mem:birds"}}
                 :model/Database _               {:name "rc audit", :engine :postgres, :is_audit true}]
    (let [names   ["rc router" "rc destination" "rc mysql" "rc h2" "rc audit"]
          results (refresh-with! {"reader"  (privileges)
                                  "writer"  (privileges :insert true)
                                  "updater" (privileges :update true)}
                                 names)]
      (testing "one result per database in name order, routing destinations included, the audit database left out"
        (is (= [{:id dest-id, :name "rc destination", :engine "postgres", :result "writable"}
                {:id h2-id, :name "rc h2", :engine "h2", :result "not-supported"}
                {:id mysql-id, :name "rc mysql", :engine "mysql", :result "writable"}
                {:id router-id, :name "rc router", :engine "postgres", :result "read-only"}]
               results)))
      (testing "the result holds no connection details"
        (is (every? #(= #{:id :name :engine :result} (set (keys %))) results))))
    (testing "a database that lists no table privileges is not reported as read-only"
      (is (= ["writable" "not-supported" "no-privileges" "read-only"]
             (map :result (refresh-with! {"reader"  (privileges)
                                          "writer"  (privileges :delete true)
                                          "updater" []}
                                         ["rc router" "rc destination" "rc mysql" "rc h2" "rc audit"])))))
    (testing "a database that can't be asked gets an error result, and the other databases are still checked"
      (is (= ["writable" "not-supported" "error" "read-only"]
             (map :result (refresh-with! {"reader"  (privileges)
                                          "writer"  (privileges :delete true)
                                          "updater" #(throw (ex-info "Connection refused" {}))}
                                         ["rc router" "rc destination" "rc mysql" "rc h2" "rc audit"])))))))

(defn- do-with-sample-database-file!
  "Calls `f` with the path of a temporary SQLite file that holds one table and is registered as the bundled Sample
  Database. Restores the registered path and deletes the file."
  [f]
  (let [file       (java.io.File/createTempFile "read-only-connections" ".sqlite")
        path       (.getAbsolutePath file)
        registered @#'driver.settings/sqlite-sample-database-path
        original   @registered]
    (try
      (jdbc/execute! {:classname "org.sqlite.JDBC", :subprotocol "sqlite", :subname path} ["CREATE TABLE t (x INTEGER)"])
      (driver.settings/register-sqlite-sample-database-path! path)
      (f path)
      (finally
        (reset! registered original)
        (.delete file)))))

(deftest sqlite-test
  (driver/the-initialized-driver :sqlite)
  (do-with-sample-database-file!
   (fn [path]
     (mt/with-temp [:model/Database _ {:name "rc sample", :engine :sqlite, :details {:db path, :read-only? true}}
                    :model/Database _ {:name "rc sqlite", :engine :sqlite, :details {:db path}}]
       (let [result (into {}
                          (map (juxt :name :result))
                          (:databases (read-only-connections/refresh)))]
         (testing "the Sample Database passes: Metabase opens its file read-only"
           (is (= "read-only" (get result "rc sample"))))
         (testing "a SQLite database that an admin connects fails: its file is opened for writes"
           (is (= "writable" (get result "rc sqlite")))))))))

(deftest check-databases-test
  (let [check-databases #'read-only-connections/check-databases
        databases       [{:id 1, :engine :postgres} {:id 2, :engine :mysql} {:id 3, :engine :h2} {:id 4, :engine :oracle}]]
    (testing "a database that does not answer in time gets a timeout result, and the other databases are still checked"
      (let [stuck (promise)]
        (try
          (is (= ["read-only" "timed-out" "not-supported" "writable"]
                 (check-databases databases
                                  (fn [{:keys [id]}]
                                    (case (int id)
                                      1 "read-only"
                                      2 @stuck
                                      4 "writable"))
                                  2
                                  500)))
          (finally
            (deliver stuck "read-only")))))
    (testing "a database that waits for a thread until the time is over gets a timeout result"
      (let [stuck (promise)]
        (try
          (is (= ["timed-out" "timed-out" "not-supported" "timed-out"]
                 (check-databases databases (fn [_] @stuck) 2 200)))
          (finally
            (deliver stuck "read-only")))))
    (testing "a database with an engine outside the supported set is not asked"
      (let [asked (atom #{})]
        (check-databases databases (fn [{:keys [id]}] (swap! asked conj id) "read-only") 2 500)
        (is (= #{1 2 4} @asked))))))

(deftest ^:parallel pool-size-test
  (let [pool-size #'read-only-connections/pool-size
        databases (fn [n engine] (repeat n {:engine engine}))]
    (testing "one thread per database with a supported engine"
      (is (= 3 (pool-size (concat (databases 3 :postgres) (databases 5 :h2))))))
    (testing "at most 10 threads"
      (is (= 10 (pool-size (databases 25 :mysql)))))
    (testing "one thread when there is no database to ask"
      (is (= 1 (pool-size [])))
      (is (= 1 (pool-size (databases 2 :h2)))))))

(deftest mariadb-test
  (mt/with-temp [:model/Database {mariadb-id :id} {:name         "rc mariadb"
                                                   :engine       :mysql
                                                   :details      {:user "maria"}
                                                   :dbms_version {:flavor "MariaDB", :version "11.4.13"}}
                 :model/Database _                {:name "rc unsynced", :engine :mysql, :details {:user "unsynced"}}]
    (let [asked   (atom #{})
          results (refresh-with! {"maria"    #(do (swap! asked conj "maria") (privileges))
                                  "unsynced" #(do (swap! asked conj "unsynced") [])}
                                 ["rc mariadb" "rc unsynced"])]
      (testing "a database that sync knows as MariaDB is not supported, and is not asked"
        (is (= {:id mariadb-id, :name "rc mariadb", :engine "mariadb", :result "not-supported"}
               (first results)))
        (is (= #{"unsynced"} @asked)))
      (testing "the item names MariaDB"
        (is (=? [{:status :unknown, :message "MariaDB is not supported", :entity_id mariadb-id}]
                (read-only-connections/items {:databases (take 1 results)}))))
      (testing "before the first sync the server is not known, so the database is asked"
        (is (= "no-privileges" (:result (second results))))))))

(deftest role-writable-test
  (mt/with-temp [:model/Database _ {:name "rc login writes", :engine :postgres, :details {:user "writer"}}
                 :model/Database _ {:name "rc role writes", :engine :postgres, :details {:user "reader"}}
                 :model/Database _ {:name "rc nothing writes", :engine :postgres, :details {:user "viewer"}}]
    (let [roles-read (atom #{})
          results    (refresh-with! {"writer" (privileges :insert true)
                                     "reader" (privileges)
                                     "viewer" (privileges)}
                                    {"writer" #(swap! roles-read conj "writer")
                                     "reader" #(do (swap! roles-read conj "reader") "sales_writer")
                                     "viewer" #(do (swap! roles-read conj "viewer") nil)}
                                    ["rc login writes" "rc role writes" "rc nothing writes"])]
      (testing "a role that the connection user can switch to and that can write fails the database"
        (is (= [["rc login writes" "writable"] ["rc nothing writes" "read-only"] ["rc role writes" "role-writable"]]
               (map (juxt :name :result) results))))
      (testing "the roles are not read when the connection user can write"
        (is (= #{"reader" "viewer"} @roles-read)))
      (testing "the item of a database with a writable role"
        (is (=? [{:status  :fail
                  :message "The connection user of rc role writes can switch to a role that can insert, update or delete"}]
                (read-only-connections/items {:databases (filterv (comp #{"role-writable"} :result) results)})))))))

(defn- random-identifier
  []
  (u/lower-case-en (mt/random-name)))

(defn- impersonated-role
  "The role that the impersonation module switches the queries of `user` on `database` to, or nil when it switches to
  none or refuses the queries."
  [user database]
  (try
    (request/with-current-user (:id user)
      (impersonation.driver/connection-impersonation-role database))
    (catch clojure.lang.ExceptionInfo _
      nil)))

(deftest roles-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/Database         sales    {:name "rc sales", :engine :postgres}
                   :model/PermissionsGroup analysts {:name "rc analysts"}
                   :model/PermissionsGroup finance  {:name "rc finance"}
                   :model/PermissionsGroup support  {:name "rc support"}
                   :model/PermissionsGroup unnamed  {:name "rc unnamed"}
                   :model/User             reader   {:login_attributes {"db_role" "orders_reader"}}
                   :model/User             writer   {:login_attributes {"db_role" "orders_writer"}}
                   :model/User             admin    {:is_superuser true, :login_attributes {"db_role" "admin_role"}}
                   :model/User             inactive {:is_active false, :login_attributes {"db_role" "inactive_role"}}
                   :model/User             missing  {}
                   :model/User             blank    {:login_attributes {"db_role" " "}}
                   :model/User             none     {:login_attributes {"db_role" "none"}}
                   :model/User             two      {:login_attributes {"db_role" "two_role", "other_role" "two_other"}}
                   :model/User             nil-attr {:login_attributes {"db_role" "nil_attr_role"}}
                   :model/ConnectionImpersonation _ {:db_id     (:id sales)
                                                     :group_id  (:id analysts)
                                                     :attribute "db_role"}
                   :model/ConnectionImpersonation _ {:db_id     (:id sales)
                                                     :group_id  (:id support)
                                                     :attribute "other_role"}
                   ;; the column allows no attribute, which the impersonation module counts as a second attribute
                   :model/ConnectionImpersonation _ {:db_id     (:id sales)
                                                     :group_id  (:id unnamed)
                                                     :attribute nil}]
      (perms/set-database-permission! (perms/all-users-group) sales :perms/view-data :blocked)
      (doseq [group [analysts finance support unnamed]]
        (perms/set-database-permission! group sales :perms/view-data :unrestricted))
      (doseq [user [reader writer admin inactive missing blank none two nil-attr]]
        (perms/add-user-to-group! user analysts))
      (perms/add-user-to-group! writer finance)
      (perms/add-user-to-group! two support)
      (perms/add-user-to-group! nil-attr unnamed)
      (let [roles        #(set (#'read-only-connections/roles %))
            ;; an inactive user can't log in, so no query of theirs reaches the database
            active-roles #(into #{} (keep (fn [user] (impersonated-role user %)))
                                [reader writer admin missing blank none two nil-attr])]
        (testing "the roles of the users that the impersonation module switches to, and no other"
          (is (= #{"orders_reader"} (roles sales) (active-roles sales))))
        (testing "a user whose other groups can't view the whole database gets the role of the policy"
          (perms/remove-user-from-group! writer finance)
          (is (= #{"orders_reader" "orders_writer"} (roles sales) (active-roles sales))))
        (testing "without the feature the queries of impersonated users are refused, so no role is used"
          (mt/with-premium-features #{}
            (is (= #{} (roles sales)))))
        (testing "no user is impersonated when All Users can view the whole database"
          (perms/set-database-permission! (perms/all-users-group) sales :perms/view-data :unrestricted)
          (is (= #{} (roles sales) (active-roles sales))))))))

(deftest roles-default-role-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/Database         mysql    {:name "rc mysql", :engine :mysql, :details {:role "rc_default"}}
                   :model/Database         postgres {:name "rc postgres", :engine :postgres}
                   :model/Database         sqlite   {:name "rc sqlite", :engine :sqlite}
                   :model/PermissionsGroup group    {}
                   :model/User             writer   {:login_attributes {"db_role" "rc_writer"}}
                   :model/User             default  {:login_attributes {"db_role" "RC_DEFAULT"}}]
      (testing "a driver that needs a default role switches every connection to it"
        (is (= ["rc_default"] (#'read-only-connections/roles mysql))))
      (testing "the default role comes first and once; a user with the default role as the value is refused"
        (mt/with-temp [:model/ConnectionImpersonation _ {:db_id     (:id mysql)
                                                         :group_id  (:id group)
                                                         :attribute "db_role"}]
          (perms/set-database-permission! (perms/all-users-group) mysql :perms/view-data :blocked)
          (doseq [user [writer default]]
            (perms/add-user-to-group! user group))
          (is (= ["rc_default" "rc_writer"] (#'read-only-connections/roles mysql)))))
      (testing "the Postgres default role is the connection user, which the check reads before any role"
        (is (empty? (#'read-only-connections/roles postgres))))
      (testing "a driver without connection impersonation has no roles"
        (is (nil? (#'read-only-connections/roles sqlite)))))))

(deftest roles-routing-test
  (mt/with-premium-features #{:advanced-permissions :database-routing}
    (mt/with-temp [:model/Database         router    {:name "rc router", :engine :mysql, :details {:role "router_role"}}
                   :model/Database         eu        {:name               "eu"
                                                      :engine             :mysql
                                                      :details            {:role "eu_role"}
                                                      :router_database_id (:id router)}
                   :model/Database         us        {:name               "us"
                                                      :engine             :mysql
                                                      :details            {:role "us_role"}
                                                      :router_database_id (:id router)}
                   :model/DatabaseRouter   _         {:database_id (:id router), :user_attribute "region"}
                   :model/PermissionsGroup analysts  {}
                   :model/User             eu-writer {:login_attributes {"region" "eu", "db_role" "eu_writer"}}
                   ;; the router's default role is not the default role of `eu`, so Metabase switches to it there
                   :model/User             eu-other  {:login_attributes {"region" "eu", "db_role" "router_role"}}
                   :model/User             us-writer {:login_attributes {"region" "us", "db_role" "us_writer"}}
                   :model/User             on-router {:login_attributes {"region"  "__METABASE_ROUTER__"
                                                                         "db_role" "router_reader"}}
                   :model/User             no-region {:login_attributes {"db_role" "lost_role"}}
                   :model/ConnectionImpersonation _ {:db_id     (:id router)
                                                     :group_id  (:id analysts)
                                                     :attribute "db_role"}]
      (perms/set-database-permission! (perms/all-users-group) router :perms/view-data :blocked)
      (doseq [user [eu-writer eu-other us-writer on-router no-region]]
        (perms/add-user-to-group! user analysts))
      (let [roles        #(#'read-only-connections/roles %)
            ;; the impersonation module reads the policies of the router, and the default role of the database that
            ;; the user is routed to
            active-roles (fn [users]
                           (into #{} (keep #(impersonated-role % (:id router))) users))]
        (testing "a destination tests its default role and the roles of the users routed to it"
          (is (= "eu_role" (first (roles eu))))
          (is (= #{"eu_writer" "router_role"} (set (rest (roles eu))) (active-roles [eu-writer eu-other])))
          (is (= ["us_role" "us_writer"] (roles us)))
          (is (= #{"us_writer"} (active-roles [us-writer]))))
        (testing "the router tests the roles of the users whose routing attribute keeps their queries on it"
          (is (= ["router_role" "router_reader"] (roles router)))
          (is (= #{"router_reader"} (active-roles [on-router]))))
        (testing "a user without the routing attribute gets every query refused"
          (is (= #{} (active-roles [no-region]))))))))

(defn- database-as
  "A database map for the test database of the current driver, with `user` and `password` as the connection user."
  [user password]
  {:id 1, :engine driver/*driver*, :details (assoc (:details (mt/db)) :user user :password password)})

(deftest ^:mb/driver-tests postgres-roles-test
  (mt/test-driver :postgres
    (let [suffix (random-identifier)
          table  (str "rc_birds_" suffix)
          writer (str "rc_writer_" suffix)
          reader (str "rc_reader_" suffix)
          login  (str "rc_login_" suffix)
          spec   (sql-jdbc.conn/connection-details->spec :postgres (:details (mt/db)))
          exec!  #(jdbc/execute! spec [%] {:transaction? false})]
      (try
        (doseq [statement [(format "CREATE TABLE %s (id int)" table)
                           (format "CREATE ROLE %s NOLOGIN" writer)
                           (format "GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %s" table writer)
                           (format "CREATE ROLE %s NOLOGIN" reader)
                           (format "GRANT SELECT ON %s TO %s" table reader)
                           ;; NOINHERIT: the connection user gets the privileges of a role only after a switch
                           (format "CREATE ROLE %s LOGIN PASSWORD 'pw' NOINHERIT" login)
                           (format "GRANT SELECT ON %s TO %s" table login)
                           (format "GRANT %s, %s TO %s" writer reader login)]]
          (exec! statement))
        (mt/with-premium-features #{:advanced-permissions}
          (mt/with-temp [:model/Database         database {:engine  :postgres
                                                           :details (:details (database-as login "pw"))}
                         :model/PermissionsGroup group    {}
                         :model/User             user     {:login_attributes {"db_role" reader}}
                         :model/ConnectionImpersonation _ {:db_id     (:id database)
                                                           :group_id  (:id group)
                                                           :attribute "db_role"}]
            (perms/set-database-permission! (perms/all-users-group) database :perms/view-data :blocked)
            (perms/add-user-to-group! user group)
            (let [result #(#'read-only-connections/privileges-result database)]
              (testing "the role of an impersonated user only reads"
                (is (= "read-only" (result))))
              (testing "a role that the connection user can't switch to is skipped, and the next role is tried"
                (mt/with-dynamic-fn-redefs [read-only-connections/roles (fn [_database]
                                                                          [(str "rc_missing_" suffix) writer])]
                  (is (= "role-writable" (result)))))
              (testing "the role of an impersonated user can write"
                (mt/with-temp [:model/User other {:login_attributes {"db_role" writer}}]
                  (perms/add-user-to-group! other group)
                  (is (= "role-writable" (result))))))))
        (finally
          (exec! (format "DROP TABLE IF EXISTS %s" table))
          (doseq [role [login writer reader]]
            (exec! (format "DROP ROLE IF EXISTS %s" role))))))))

(deftest ^:mb/driver-tests sqlserver-roles-test
  (mt/test-driver :sqlserver
    (let [suffix   (random-identifier)
          table    (str "rc_birds_" suffix)
          login    (str "rc_login_" suffix)
          writer   (str "rc_writer_" suffix)
          password (:password (:details (mt/db)))
          spec     (sql-jdbc.conn/connection-details->spec :sqlserver (:details (mt/db)))
          exec!    #(jdbc/execute! spec [%] {:transaction? false})]
      (try
        (doseq [statement [(format "CREATE TABLE dbo.%s (id int)" table)
                           (format "CREATE LOGIN %s WITH PASSWORD = N'%s'" login password)
                           (format "CREATE USER %s FOR LOGIN %s" login login)
                           (format "GRANT SELECT ON dbo.%s TO %s" table login)
                           (format "CREATE USER %s WITHOUT LOGIN" writer)
                           (format "GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.%s TO %s" table writer)]]
          (exec! statement))
        (mt/with-temp [:model/Database database {:engine  :sqlserver
                                                 :details (assoc (:details (database-as login password))
                                                                 :role writer)}]
          (testing "a connection user that can't impersonate the default role: a query fails the same way"
            (is (= "read-only" (#'read-only-connections/privileges-result database))))
          (exec! (format "GRANT IMPERSONATE ON USER::%s TO %s" writer login))
          (testing "a default role that can write"
            (is (= "role-writable" (#'read-only-connections/privileges-result database)))))
        (finally
          ;; a user that a permission refers to can't be dropped, so the permissions go first
          (doseq [statement [(format "IF USER_ID('%s') IS NOT NULL REVOKE IMPERSONATE ON USER::%s FROM %s"
                                     writer writer login)
                             (format "DROP TABLE IF EXISTS dbo.%s" table)
                             (format "DROP USER IF EXISTS %s" writer)
                             (format "DROP USER IF EXISTS %s" login)
                             (format "IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '%s') DROP LOGIN %s"
                                     login login)]]
            (exec! statement)))))))

(deftest log-test
  (testing "a database without an answer in time gets a line with its id and engine"
    (let [stuck (promise)]
      (try
        (mt/with-log-messages-for-level [messages [metabase-enterprise.security-center.read-only-connections :warn]]
          (#'read-only-connections/check-databases [{:id 7, :engine :mysql}] (fn [_] @stuck) 1 100)
          (is (=? [{:level :warn, :message #".*got no answer from database 7 \(mysql\) in 100 ms"}]
                  (messages))))
        (finally
          (deliver stuck "read-only")))))
  (testing "a database that lists no table privileges gets a line with its id and engine"
    (mt/with-log-messages-for-level [messages [metabase-enterprise.security-center.read-only-connections :warn]]
      (do-with-fake-connections
       (constantly [])
       (constantly nil)
       (fn []
         (is (= "no-privileges" (#'read-only-connections/check-database {:id 7, :engine :postgres})))
         (is (=? [{:level :warn, :message #".*could not read the table privileges of database 7 \(postgres\)"}]
                 (messages)))))))
  (testing "a database with an engine outside the supported set gets a line with its id and engine"
    (mt/with-log-messages-for-level [messages [metabase-enterprise.security-center.read-only-connections :info]]
      (#'read-only-connections/check-databases [{:id 8, :engine :h2}
                                                {:id 9, :engine :mysql, :dbms_version {:flavor "MariaDB"}}]
                                               (fn [_] "read-only")
                                               1
                                               100)
      (is (=? [{:level :info, :message #".*does not support database 8 \(h2\)"}
               {:level :info, :message #".*does not support database 9 \(mariadb\)"}]
              (messages)))))
  (testing "a refresh writes one line with the number of databases, the duration and the results"
    (mt/with-log-messages-for-level [messages [metabase-enterprise.security-center.read-only-connections :info]]
      (do-with-fake-connections
       (constantly (privileges))
       (constantly nil)
       (fn []
         (let [database-count (count (:databases (read-only-connections/refresh)))]
           (is (=? [{:message (re-pattern (str ".*checked " database-count " databases in \\d+ ms: \\{.+\\}"))}]
                   (filter #(re-find #"checked \d+ databases" (:message %)) (messages))))))))))

(deftest ^:parallel items-test
  (testing "before the first refresh"
    (is (= [{:status :unknown, :message "Not checked yet"}]
           (read-only-connections/items nil))))
  (testing "with no databases"
    (is (= [{:status :pass, :message "There are no databases to check"}]
           (read-only-connections/items {:databases []}))))
  (testing "one item per database, from the result as it is read back from JSON"
    (let [stored (json/decode+kw
                  (json/encode
                   {:databases [{:id 1, :name "Birds", :engine "postgres", :result "read-only"}
                                {:id 2, :name "Sales", :engine "mysql", :result "writable"}
                                {:id 3, :name "Sample Database", :engine "sqlite", :result "read-only"}
                                {:id 4, :name "Slow", :engine "oracle", :result "timed-out"}
                                {:id 5, :name "Down", :engine "sqlserver", :result "error"}
                                {:id 6, :name "Gone", :engine "no-such-engine", :result "not-supported"}
                                {:id 7, :name "Empty", :engine "mysql", :result "no-privileges"}
                                {:id 8, :name "Notes", :engine "sqlite", :result "writable"}]}))
          items  (read-only-connections/items stored)]
      (is (= [[:pass "The connection user of Birds can't write"]
              [:fail "The connection user of Sales can insert, update or delete"]
              [:pass "Metabase opens Sample Database read-only"]
              [:unknown "Timed out after 30 s"]
              [:unknown "Couldn't check Down. Check the server logs for the underlying error."]
              [:unknown "no-such-engine is not supported"]
              [:unknown "Couldn't read the privileges of the connection user of Empty"]
              [:fail "SQLite has no read-only users. Move the data of Notes to another database engine."]]
             (map (juxt :status :message) items)))
      (is (= [[:database 1 "Birds"] [:database 2 "Sales"]]
             (map (juxt :entity_type :entity_id :entity_name) (take 2 items))))
      (is (mr/validate [:sequential ::security-center.schema/health-check-item] items)))))
