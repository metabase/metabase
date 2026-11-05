(ns ^:mb/driver-tests metabase-enterprise.workspaces.api-test
  "The provisioning connection endpoints against a real Postgres warehouse, whose test connection logs in as the
  stored login."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.status :as ws.status]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [next.jdbc :as next.jdbc]))

(set! *warn-on-reflection* true)

(def ^:private db-name "workspace_manager_api_test")

(def ^:private login-a {:user "mb_wsm_test_a" :password "LoginAPassw0rd"})
(def ^:private login-b {:user "mb_wsm_test_b" :password "LoginBPassw0rd"})
(def ^:private login-weak {:user "mb_wsm_test_weak" :password "LoginWeakPassw0rd"})

(defn- superuser-details [] (mt/dbdef->connection-details :postgres :db {:database-name db-name}))

(defn- exec! [spec & sqls]
  (doseq [sql sqls]
    (jdbc/execute! spec [sql])))

(defn- do-with-warehouse!
  "Calls `(f spec db-id)` with `db-id` a Database whose own login is the superuser and `spec` the superuser's spec,
  with two logins that can provision workspaces, [[login-a]] and [[login-b]], and one that cannot, [[login-weak]], in
  its warehouse."
  [f]
  (mt/test-driver :postgres
    (tx/drop-if-exists-and-create-db! :postgres db-name)
    (let [spec (sql-jdbc.conn/connection-details->spec :postgres (superuser-details))]
      (doseq [{:keys [user]} [login-a login-b]]
        (when (seq (jdbc/query spec ["SELECT 1 FROM pg_roles WHERE rolname = ?" user]))
          (exec! spec (format "DROP OWNED BY %s" user) (format "DROP ROLE %s" user))))
      (doseq [{:keys [user password]} [login-a login-b]]
        (exec! spec
               (format "CREATE ROLE %s LOGIN CREATEROLE PASSWORD '%s'" user password)
               (format "GRANT CREATE ON DATABASE %s TO %s" db-name user)))
      (when (seq (jdbc/query spec ["SELECT 1 FROM pg_roles WHERE rolname = ?" (:user login-weak)]))
        (exec! spec (format "DROP OWNED BY %s" (:user login-weak)) (format "DROP ROLE %s" (:user login-weak))))
      (exec! spec (format "CREATE ROLE %s LOGIN PASSWORD '%s'" (:user login-weak) (:password login-weak)))
      (mt/with-premium-features #{:workspaces}
        (mt/with-temp [:model/Database {db-id :id} {:engine :postgres, :details (superuser-details)}]
          (f spec db-id))))))

(defn- url [db-id] (format "ee/workspace-manager/database/%d/provisioning-connection" db-id))

(defn- current-user! [db-id]
  (sql-jdbc.execute/do-with-connection-with-options
   :postgres (driver.u/lib-database db-id) nil
   (fn [conn] (:u (next.jdbc/execute-one! conn ["SELECT current_user AS u"])))))

(defn- current-user-in-provisioning-scope! [db-id]
  (driver.conn/with-workspace-provisioning-connection
    (current-user! db-id)))

(deftest superuser-only-test
  (do-with-warehouse!
   (fn [_spec db-id]
     (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :get 403 (url db-id))))
     (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :put 403 (url db-id) {:details login-a})))
     (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :delete 403 (url db-id)))))))

(deftest requires-workspaces-feature-test
  (do-with-warehouse!
   (fn [_spec db-id]
     (mt/with-premium-features #{}
       (is (str/includes? (mt/user-http-request :crowberto :get 402 (url db-id)) "Workspaces"))
       (is (str/includes? (mt/user-http-request :crowberto :put 402 (url db-id) {:details login-a}) "Workspaces"))
       (is (str/includes? (mt/user-http-request :crowberto :delete 402 (url db-id)) "Workspaces")))
     (is (= {:configured false} (mt/user-http-request :crowberto :get 200 (url db-id)))))))

(deftest unsupported-engine-test
  (testing "a database whose engine does not support workspaces is refused before any connection is tried"
    (mt/with-premium-features #{:workspaces}
      (is (= {:message "Workspaces are not supported on h2 databases.", :error-code "workspaces_unsupported"}
             (mt/user-http-request :crowberto :put 400 (url (mt/id)) {:details {:user "x"}})))
      (is (nil? (ws.db/provisioning-connection (mt/id)))))))

(defn- pool-open? [db-id]
  (contains? @@#'sql-jdbc.conn/pool-cache-key->connection-pool [db-id :workspace-provisioning]))

(defn- sessions-of! [spec user]
  (:n (first (jdbc/query spec ["SELECT count(*) AS n FROM pg_stat_activity WHERE usename = ?" user]))))

(deftest refused-and-deleted-logins-leave-no-connections-test
  (do-with-warehouse!
   (fn [spec db-id]
     (mt/user-http-request :crowberto :put 204 (url db-id) {:details login-a})
     (current-user-in-provisioning-scope! db-id)
     (is (pool-open? db-id))
     (testing "a 412 keeps the stored login and closes the refused login's connections"
       (mt/user-http-request :crowberto :put 412 (url db-id) {:details login-weak})
       (is (= (:user login-a) (:user (mt/user-http-request :crowberto :get 200 (url db-id)))))
       (is (= (:password login-a) (:password (:details (ws.db/provisioning-connection db-id)))))
       (is (not (pool-open? db-id)))
       (is (zero? (sessions-of! spec (:user login-weak))))
       (is (= (:user login-a) (current-user-in-provisioning-scope! db-id))))
     (testing "DELETE closes the provisioning login's connections"
       (is (pos? (sessions-of! spec (:user login-a))))
       (mt/user-http-request :crowberto :delete 204 (url db-id))
       (is (not (pool-open? db-id)))
       (is (zero? (sessions-of! spec (:user login-a))))))))

(deftest unknown-database-test
  (mt/with-premium-features #{:workspaces}
    (doseq [method [:get :delete]]
      (is (= "Database 2147483647 not found." (mt/user-http-request :crowberto method 404 (url Integer/MAX_VALUE)))))
    (is (= "Database 2147483647 not found."
           (mt/user-http-request :crowberto :put 404 (url Integer/MAX_VALUE) {:details login-a})))))

(deftest put-get-delete-test
  (do-with-warehouse!
   (fn [spec db-id]
     (testing "nothing configured"
       (is (= {:configured false} (mt/user-http-request :crowberto :get 200 (url db-id)))))
     (testing "a login that cannot connect is a 400 and stores nothing"
       (is (=? {:message string?, :error-code "connection_failed"}
               (mt/user-http-request :crowberto :put 400 (url db-id) {:details (assoc login-a :password "wrong")})))
       (is (= {:configured false} (mt/user-http-request :crowberto :get 200 (url db-id)))))
     (testing "a login without CREATEROLE and CREATE on the database is a 412 naming both, and stores nothing"
       (let [message (mt/user-http-request :crowberto :put 412 (url db-id) {:details login-weak})]
         (is (str/includes? message (format "ALTER ROLE \"%s\" CREATEROLE" (:user login-weak))))
         (is (str/includes? message (format "GRANT CREATE ON DATABASE \"%s\" TO \"%s\"" db-name (:user login-weak)))))
       (is (= {:configured false} (mt/user-http-request :crowberto :get 200 (url db-id)))))
     (testing "with CREATEROLE alone, the 412 names only CREATE on the database"
       (exec! spec (format "ALTER ROLE %s CREATEROLE" (:user login-weak)))
       (let [message (mt/user-http-request :crowberto :put 412 (url db-id) {:details login-weak})]
         (is (not (str/includes? message "ALTER ROLE")))
         (is (str/includes? message "GRANT CREATE ON DATABASE"))))
     (testing "details that are not a map are a 400"
       (mt/user-http-request :crowberto :put 400 (url db-id) {:details "nope"}))
     (testing "a working login is saved; GET shows its user and never its password"
       (is (nil? (mt/user-http-request :crowberto :put 204 (url db-id) {:details login-a})))
       (let [response (mt/user-http-request :crowberto :get 200 (url db-id))]
         (is (=? {:configured true, :user (:user login-a), :updated_at some?} response))
         (is (= #{:configured :user :updated_at} (set (keys response))))
         (is (not (str/includes? (pr-str response) (:password login-a))))))
     (testing "the provisioning scope connects as the stored login, the default scope as the database's own"
       (is (= (:user login-a) (current-user-in-provisioning-scope! db-id)))
       (is (not= (:user login-a) (current-user! db-id))))
     (testing "the scope still finds the login without the :workspaces feature, so workspaces can be deleted"
       (mt/with-premium-features #{}
         (is (= (:user login-a) (current-user-in-provisioning-scope! db-id)))))
     (testing "with no workspaces, a different login replaces it"
       (is (nil? (mt/user-http-request :crowberto :put 204 (url db-id) {:details login-b})))
       (is (= (:user login-b) (:user (mt/user-http-request :crowberto :get 200 (url db-id)))))
       (is (= (:user login-b) (current-user-in-provisioning-scope! db-id))))
     (testing "DELETE removes it; the scope then refuses to fall back to the database's own login"
       (is (nil? (mt/user-http-request :crowberto :delete 204 (url db-id))))
       (is (= {:configured false} (mt/user-http-request :crowberto :get 200 (url db-id))))
       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no workspace provisioning connection"
                             (current-user-in-provisioning-scope! db-id))))
     (testing "DELETE with nothing configured is a 204"
       (is (nil? (mt/user-http-request :crowberto :delete 204 (url db-id))))))))

(deftest live-workspaces-test
  (do-with-warehouse!
   (fn [spec db-id]
     (mt/user-http-request :crowberto :put 204 (url db-id) {:details login-a})
     (mt/with-temp [:model/Workspace         {ws-id :id} {:name "live"}
                    :model/WorkspaceDatabase _           {:workspace_id     ws-id
                                                          :database_id      db-id
                                                          :isolation_id     "livetest"
                                                          :database_details {}
                                                          :status           :failed
                                                          :lock_token       (ws.status/new-lock-token)}]
       (testing "a different login is a 409 listing the workspaces, and changes nothing"
         (is (= {:message    (str "Workspaces exist on this database; delete them before you change anything but the "
                                  "password of its provisioning login.")
                 :error-code "workspaces_exist"
                 :workspaces [{:id ws-id, :name "live"}]}
                (mt/user-http-request :crowberto :put 409 (url db-id) {:details login-b})))
         (is (= (:user login-a) (:user (mt/user-http-request :crowberto :get 200 (url db-id))))))
       (testing "the same user on another database is a 409 too"
         (is (=? {:error-code "workspaces_exist"}
                 (mt/user-http-request :crowberto :put 409 (url db-id) {:details (assoc login-a :dbname "postgres")}))))
       (testing "the same login with a new password is saved"
         (exec! spec (format "ALTER ROLE %s PASSWORD 'LoginANewPassw0rd'" (:user login-a)))
         (is (nil? (mt/user-http-request :crowberto :put 204 (url db-id)
                                         {:details (assoc login-a :password "LoginANewPassw0rd")})))
         (is (= "LoginANewPassw0rd" (:password (:details (ws.db/provisioning-connection db-id)))))
         (is (= (:user login-a) (current-user-in-provisioning-scope! db-id))))
       (testing "DELETE is a 409 listing the workspaces"
         (is (=? {:error-code "workspaces_exist", :workspaces [{:id ws-id, :name "live"}]}
                 (mt/user-http-request :crowberto :delete 409 (url db-id))))
         (is (true? (:configured (mt/user-http-request :crowberto :get 200 (url db-id)))))))
     (testing "once the workspace is gone, DELETE works"
       (is (nil? (mt/user-http-request :crowberto :delete 204 (url db-id))))))))
