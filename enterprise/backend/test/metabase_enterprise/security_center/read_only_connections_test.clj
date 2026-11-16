(ns metabase-enterprise.security-center.read-only-connections-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.read-only-connections :as read-only-connections]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
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

(defn- database-as
  "A database map for the test database of the current driver, with `user` and `password` as the connection user."
  [user password]
  {:id 1, :engine driver/*driver*, :details (assoc (:details (mt/db)) :user user :password password)})

(defn- switchable-roles-as
  [user password]
  (set (sql-jdbc/do-with-new-connection (database-as user password)
                                        #(#'read-only-connections/switchable-roles driver/*driver* %))))

(deftest ^:mb/driver-tests postgres-roles-test
  (mt/test-driver :postgres
    (let [suffix        (random-identifier)
          table         (str "rc_birds_" suffix)
          writer        (str "rc_writer_" suffix)
          reader        (str "rc_reader_" suffix)
          noinherit     (str "rc_noinherit_" suffix)
          readonly      (str "rc_readonly_" suffix)
          inherit       (str "rc_inherit_" suffix)
          spec          (sql-jdbc.conn/connection-details->spec :postgres (:details (mt/db)))
          exec!         #(jdbc/execute! spec [%] {:transaction? false})
          result-as     #(#'read-only-connections/privileges-result (database-as % "pw"))]
      (try
        (doseq [statement [(format "CREATE TABLE %s (id int)" table)
                           (format "CREATE ROLE %s NOLOGIN" writer)
                           (format "GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %s" table writer)
                           (format "CREATE ROLE %s NOLOGIN" reader)
                           (format "GRANT SELECT ON %s TO %s" table reader)
                           (format "CREATE ROLE %s LOGIN PASSWORD 'pw' NOINHERIT" noinherit)
                           (format "GRANT SELECT ON %s TO %s" table noinherit)
                           (format "GRANT %s, %s TO %s" writer reader noinherit)
                           (format "CREATE ROLE %s LOGIN PASSWORD 'pw' NOINHERIT" readonly)
                           (format "GRANT SELECT ON %s TO %s" table readonly)
                           (format "GRANT %s TO %s" reader readonly)
                           (format "CREATE ROLE %s LOGIN PASSWORD 'pw' INHERIT" inherit)
                           (format "GRANT %s TO %s" writer inherit)]]
          (exec! statement))
        (testing "a NOINHERIT connection user can switch to its roles, and one of them can write"
          (is (= #{writer reader} (switchable-roles-as noinherit "pw")))
          (is (= "role-writable" (result-as noinherit))))
        (testing "a role that the connection user can't switch to is skipped, and the next role is tried"
          (mt/with-dynamic-fn-redefs [read-only-connections/switchable-roles (fn [_engine _conn]
                                                                               [(str "rc_missing_" suffix) writer])]
            (is (= "role-writable" (result-as noinherit)))))
        (testing "a NOINHERIT connection user whose roles only read"
          (is (= #{reader} (switchable-roles-as readonly "pw")))
          (is (= "read-only" (result-as readonly))))
        (testing "an INHERIT connection user holds the privileges of its roles, so no role is left to switch to"
          (is (= #{} (switchable-roles-as inherit "pw")))
          (is (= "writable" (result-as inherit))))
        (finally
          (exec! (format "DROP TABLE IF EXISTS %s" table))
          (doseq [role [noinherit readonly inherit writer reader]]
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
        (testing "a connection user that can't impersonate the writable user"
          (is (= #{} (switchable-roles-as login password)))
          (is (= "read-only" (#'read-only-connections/privileges-result (database-as login password)))))
        (exec! (format "GRANT IMPERSONATE ON USER::%s TO %s" writer login))
        (testing "a connection user that can impersonate the writable user"
          (is (= #{writer} (switchable-roles-as login password)))
          (is (= "role-writable" (#'read-only-connections/privileges-result (database-as login password)))))
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
