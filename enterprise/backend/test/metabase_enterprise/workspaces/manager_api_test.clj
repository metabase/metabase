(ns ^:mb/driver-tests metabase-enterprise.workspaces.manager-api-test
  "The workspace manager endpoints (list, get, create, rename, delete) against a real Postgres warehouse."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.workspaces.status :as ws.status]
   [metabase.driver :as driver]
   [metabase.driver.postgres :as postgres]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private db-name "workspace_manager_lifecycle_test")

(def ^:private provisioner {:user "mb_wsm_lifecycle_prov" :password "LifecycleProvPassw0rd"})

(defn- superuser-details [] (mt/dbdef->connection-details :postgres :db {:database-name db-name}))

(defn- exec! [spec & sqls]
  (doseq [sql sqls]
    (jdbc/execute! spec [sql])))

(defn- query [spec sql & params]
  (jdbc/query spec (into [sql] params)))

(defn- drop-role-if-exists! [spec role]
  (when (seq (query spec "SELECT 1 FROM pg_roles WHERE rolname = ?" role))
    (exec! spec (format "DROP OWNED BY %s" role) (format "DROP ROLE %s" role))))

(defn- do-with-database!
  "Calls `(f db-id)` with `db-id` a new Database on the test warehouse whose provisioning login, stored through the
  API, is [[provisioner]]; deletes its workspaces and itself afterwards. A plain insert rather than `mt/with-temp`,
  which binds a connection that `future`s inherit, so concurrent requests in a test would share one transaction."
  [f]
  (let [db-id (t2/insert-returning-pk! :model/Database {:name    (mt/random-name)
                                                        :engine  :postgres
                                                        :details (superuser-details)})]
    (try
      (mt/user-http-request :crowberto :put 204
                            (format "ee/workspace-manager/database/%d/provisioning-connection" db-id)
                            {:details provisioner})
      (f db-id)
      (finally
        (t2/delete! :model/Workspace :id [:in ^:allow-subquery {:select [:workspace_id]
                                                                :from   [:workspace_database]
                                                                :where  [:= :database_id db-id]}])
        (t2/delete! :model/WorkspaceProvisioningConnection :database_id db-id)
        (t2/delete! :model/Database :id db-id)))))

(defn- do-with-warehouse!
  "Calls `(f spec db-id)` with `db-id` a Database on a fresh warehouse whose provisioning login, stored through the
  API, is [[provisioner]], and `spec` the warehouse superuser's spec. The warehouse has schemas `sales` and `finance`
  owned by `mb_wsm_lifecycle_etl`, of which the provisioning login is a member."
  [f]
  (mt/test-driver :postgres
    (tx/drop-if-exists-and-create-db! :postgres db-name)
    (let [spec (sql-jdbc.conn/connection-details->spec :postgres (superuser-details))]
      (doseq [role [(:user provisioner) "mb_wsm_lifecycle_etl"]]
        (drop-role-if-exists! spec role))
      (exec! spec
             "REVOKE CREATE ON SCHEMA public FROM PUBLIC"
             (format "CREATE ROLE %s LOGIN CREATEROLE PASSWORD '%s'" (:user provisioner) (:password provisioner))
             (format "GRANT CREATE ON DATABASE %s TO %s" db-name (:user provisioner))
             "CREATE ROLE mb_wsm_lifecycle_etl NOLOGIN"
             (format "GRANT mb_wsm_lifecycle_etl TO %s" (:user provisioner))
             "CREATE SCHEMA sales AUTHORIZATION mb_wsm_lifecycle_etl"
             "CREATE SCHEMA finance AUTHORIZATION mb_wsm_lifecycle_etl"
             "CREATE TABLE sales.orders (id int)"
             "ALTER TABLE sales.orders OWNER TO mb_wsm_lifecycle_etl"
             "CREATE TABLE finance.ledger (id int)"
             "ALTER TABLE finance.ledger OWNER TO mb_wsm_lifecycle_etl")
      (mt/with-premium-features #{:workspaces}
        ;; the cluster-wide PUBLIC CREATE check covers only this test's database: the other databases of a shared
        ;; test cluster are not this suite's to change
        (mt/with-dynamic-fn-redefs [postgres/connectable-databases (constantly [db-name])]
          (do-with-database! #(f spec %)))))))

(defn- workspace-roles
  "The workspace users [[provisioner]] made: init makes it a member of each. Roles are cluster-wide, so this ignores
  those of other suites sharing the cluster."
  [spec]
  (set (map :rolname (query spec (str "SELECT r.rolname FROM pg_auth_members m "
                                      "JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles p ON p.oid = m.member "
                                      "WHERE p.rolname = ? AND r.rolname LIKE 'mb\\_\\_isolation\\_%'")
                            (:user provisioner)))))

(defn- workspace-schemas [spec]
  (set (map :nspname (query spec "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'mb\\_\\_isolation\\_%'"))))

(defn- create-body [db-id schemas]
  {:name "orders-cleanup", :databases [{:database_id db-id, :schemas schemas}]})

(def ^:private url "ee/workspace-manager/")

(defn- ws-url [id] (str url id))

(deftest lifecycle-test
  (do-with-warehouse!
   (fn [spec db-id]
     (let [workspace (mt/user-http-request :crowberto :post 200 url (create-body db-id ["sales" "finance"]))
           ws-id     (:id workspace)
           wsd       (t2/select-one :model/WorkspaceDatabase :workspace_id ws-id)
           user      (-> wsd :database_details :user)
           password  (-> wsd :database_details :password)]
       (testing "POST / returns the Workspace, every schema active with its scratch namespace"
         (is (=? {:id         pos-int?
                  :name       "orders-cleanup"
                  :creator    {:id (mt/user->id :crowberto), :email "crowberto@metabase.com", :common_name string?}
                  :created_at some?
                  :updated_at some?
                  :databases  [{:database_id db-id
                                :database    {:id db-id, :name string?, :engine "postgres"}
                                :status      "provisioned"
                                :schemas     [{:main_schema       "sales"
                                               :scratch_namespace #(re-matches (re-pattern (str user "_s\\d+_sales")) %)
                                               :status            "active"}
                                              {:main_schema       "finance"
                                               :scratch_namespace #(re-matches (re-pattern (str user "_s\\d+_finance")) %)
                                               :status            "active"}]}]}
                 workspace))
         (is (= #{:id :name :creator :created_at :updated_at :databases} (set (keys workspace)))))
       (testing "the warehouse has the workspace user and one scratch schema per main schema"
         (is (= #{user} (workspace-roles spec)))
         (is (= (set (map :scratch_namespace (-> workspace :databases first :schemas))) (workspace-schemas spec))))
       (testing "GET / and GET /:id show it, never with a password"
         (let [page (mt/user-http-request :crowberto :get 200 url)]
           (is (= {:data [workspace], :total 1} page))
           (is (= workspace (mt/user-http-request :crowberto :get 200 (ws-url ws-id))))
           (is (not (str/includes? (pr-str [workspace page]) password)))))
       (testing "limit and offset"
         (let [second-ws (mt/user-http-request :crowberto :post 200 url (create-body db-id ["sales"]))]
           (is (= {:data [second-ws], :total 2} (mt/user-http-request :crowberto :get 200 url :limit 1 :offset 1)))
           (is (= [ws-id] (map :id (:data (mt/user-http-request :crowberto :get 200 url :limit 1)))))
           (is (= "limit must be a positive integer." (mt/user-http-request :crowberto :get 400 url :limit 0)))
           (mt/user-http-request :crowberto :delete 204 (ws-url (:id second-ws)))))
       (testing "PUT /:id renames it"
         (is (=? {:id ws-id, :name "renamed"} (mt/user-http-request :crowberto :put 200 (ws-url ws-id) {:name "renamed"})))
         (mt/user-http-request :crowberto :put 400 (ws-url ws-id) {:name ""})
         (is (= "Workspace 2147483647 not found."
                (mt/user-http-request :crowberto :put 404 (ws-url Integer/MAX_VALUE) {:name "x"}))))
       (testing "DELETE /:id tears down the warehouse objects and deletes the rows"
         (is (nil? (mt/user-http-request :crowberto :delete 204 (ws-url ws-id))))
         (is (empty? (workspace-roles spec)))
         (is (empty? (workspace-schemas spec)))
         (is (empty? (query spec "SELECT 1 FROM information_schema.role_table_grants WHERE grantee = ?" user)))
         (is (zero? (t2/count :model/Workspace)))
         (is (zero? (t2/count :model/WorkspaceDatabase)))
         (mt/user-http-request :crowberto :get 404 (ws-url ws-id))
         (is (= "Workspace 2147483647 not found." (mt/user-http-request :crowberto :delete 404 (ws-url Integer/MAX_VALUE)))))))))

(deftest superuser-only-test
  (mt/with-premium-features #{:workspaces}
    (doseq [[method path body] [[:get url] [:get (ws-url 1)] [:post url (create-body (mt/id) ["PUBLIC"])]
                                [:put (ws-url 1) {:name "x"}] [:delete (ws-url 1)]]]
      (testing (str method " " path)
        (is (= "You don't have permissions to do that."
               (apply mt/user-http-request :rasta method 403 path (when body [body]))))))))

(deftest request-errors-leave-nothing-test
  (do-with-warehouse!
   (fn [spec db-id]
     (testing "400 for empty lists, a database or schema named twice, an unsupported engine or an invalid schema"
       (mt/user-http-request :crowberto :post 400 url {:name "x", :databases []})
       (mt/user-http-request :crowberto :post 400 url (create-body db-id []))
       (mt/user-http-request :crowberto :post 400 url {:databases [{:database_id db-id, :schemas ["sales"]}]})
       (is (= "A database is named more than once."
              (mt/user-http-request :crowberto :post 400 url
                                    {:name "x", :databases [{:database_id db-id, :schemas ["sales"]}
                                                            {:database_id db-id, :schemas ["finance"]}]})))
       (is (str/includes? (mt/user-http-request :crowberto :post 400 url (create-body db-id ["sales" "sales"]))
                          "names a schema more than once"))
       (mt/with-temp [:model/Database {h2-id :id} {:engine :h2, :details {}}]
         (is (=? {:error-code "workspaces_unsupported"}
                 (mt/user-http-request :crowberto :post 400 url (create-body h2-id ["PUBLIC"])))))
       ;; these messages start with the quoted schema name, which the test client reads as a JSON string
       (is (= "mb__isolation_abcdefgh_s1_x"
              (mt/user-http-request :crowberto :post 400 url (create-body db-id ["mb__isolation_abcdefgh_s1_x"]))))
       (is (= "pg_catalog" (mt/user-http-request :crowberto :post 400 url (create-body db-id ["pg_catalog"])))))
     (testing "400 for a database behind an SSH tunnel, before anything is inserted"
       (let [tunnelled (t2/insert-returning-pk! :model/Database
                                                {:name    (mt/random-name)
                                                 :engine  :postgres
                                                 :details (assoc (superuser-details)
                                                                 :tunnel-enabled true, :tunnel-host "bastion.example.com"
                                                                 :tunnel-port 22, :tunnel-user "tunnel")})]
         (try
           (is (= {:message "SSH tunnels are not supported for workspaces.", :error-code "workspaces_unsupported"}
                  (mt/user-http-request :crowberto :post 400 url
                                        {:name "x", :databases [{:database_id db-id, :schemas ["sales"]}
                                                                {:database_id tunnelled, :schemas ["sales"]}]})))
           (finally
             (t2/delete! :model/Database :id tunnelled)))))
     (testing "400 for a database that is not an ordinary warehouse, such as a routing destination"
       (let [routed (t2/insert-returning-pk! :model/Database {:name               (mt/random-name)
                                                              :engine             :postgres
                                                              :details            (superuser-details)
                                                              :router_database_id db-id})]
         (try
           (is (=? {:error-code "workspaces_unsupported"}
                   (mt/user-http-request :crowberto :post 400 url (create-body routed ["sales"]))))
           (finally
             (t2/delete! :model/Database :id routed)))))
     (testing "404 for an unknown database"
       (is (= "Database 2147483647 not found."
              (mt/user-http-request :crowberto :post 404 url (create-body Integer/MAX_VALUE ["sales"])))))
     (testing "409 provisioning_connection_missing for a database without a provisioning login"
       (mt/with-temp [:model/Database {other-id :id} {:engine :postgres, :details (superuser-details)}]
         (is (=? {:error-code "provisioning_connection_missing"}
                 (mt/user-http-request :crowberto :post 409 url
                                       {:name "x", :databases [{:database_id db-id, :schemas ["sales"]}
                                                               {:database_id other-id, :schemas ["sales"]}]})))))
     (is (zero? (t2/count :model/Workspace)))
     (is (empty? (workspace-roles spec))))))

(deftest warehouse-failures-roll-back-test
  (do-with-warehouse!
   (fn [spec db-id]
     (testing "412: a precondition on the second schema fails after init and the first add; everything is rolled back"
       (exec! spec "GRANT INSERT ON finance.ledger TO PUBLIC")
       ;; the message, which names the REVOKE, is pinned by the driver's tests
       (mt/user-http-request :crowberto :post 412 url (create-body db-id ["sales" "finance"]))
       (exec! spec "REVOKE INSERT ON finance.ledger FROM PUBLIC")
       (is (empty? (workspace-roles spec)))
       (is (empty? (workspace-schemas spec)))
       (is (zero? (t2/count :model/Workspace))))
     (testing "502: a warehouse error, rolled back, with the warehouse's message"
       (is (=? {:error-code "warehouse_error", :message #(str/includes? % "schema \"nosuch\" does not exist")}
               (mt/user-http-request :crowberto :post 502 url (create-body db-id ["sales" "nosuch"]))))
       (is (empty? (workspace-roles spec)))
       (is (empty? (workspace-schemas spec)))
       (is (zero? (t2/count :model/Workspace)))))))

(deftest existing-user-is-left-alone-test
  (do-with-warehouse!
   (fn [spec db-id]
     (drop-role-if-exists! spec "mb__isolation_zzzzzzzz")
     (exec! spec "CREATE ROLE mb__isolation_zzzzzzzz LOGIN PASSWORD 'OtherParentPassw0rd'")
     (try
       (mt/with-dynamic-fn-redefs [driver.u/random-isolation-id (constantly "zzzzzzzz")]
         (is (=? {:error-code "workspace_user_exists", :message #(str/includes? % "mb__isolation_zzzzzzzz")}
                 (mt/user-http-request :crowberto :post 409 url (create-body db-id ["sales"])))))
       (testing "the existing user is untouched and the rows are gone"
         (is (empty? (workspace-roles spec)))
         (is (= [{:rolcanlogin true}] (query spec "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'mb__isolation_zzzzzzzz'")))
         (is (zero? (t2/count :model/Workspace))))
       (finally
         (drop-role-if-exists! spec "mb__isolation_zzzzzzzz"))))))

(deftest failed-rollback-is-500-and-delete-retries-test
  (do-with-warehouse!
   (fn [spec db-id]
     (let [ws-id (with-redefs [driver/destroy-workspace-isolation! (fn [& _] (throw (ex-info "teardown refused" {})))]
                   (let [response (mt/user-http-request :crowberto :post 500 url (create-body db-id ["sales" "nosuch"]))]
                     (is (=? {:workspace_id pos-int?, :cleanup_required true, :message string?} response))
                     (is (= #{:workspace_id :cleanup_required :message} (set (keys response))))
                     (testing "the workspace stays, its database failed"
                       (is (=? {:databases [{:status "failed"}]}
                               (mt/user-http-request :crowberto :get 200 (ws-url (:workspace_id response))))))
                     (testing "DELETE while teardown fails: 502 listing the database, which stays failed"
                       (is (=? {:error-code   "teardown_failed"
                                :workspace_id (:workspace_id response)
                                :databases    [{:database_id db-id, :message "teardown refused"}]}
                               (mt/user-http-request :crowberto :delete 502 (ws-url (:workspace_id response)))))
                       (is (=? {:databases [{:status "failed"}]}
                               (mt/user-http-request :crowberto :get 200 (ws-url (:workspace_id response))))))
                     (:workspace_id response)))]
       (is (= 1 (count (workspace-roles spec))))
       (testing "once teardown works, the retried DELETE removes everything"
         (mt/user-http-request :crowberto :delete 204 (ws-url ws-id))
         (is (empty? (workspace-roles spec)))
         (is (empty? (workspace-schemas spec)))
         (is (zero? (t2/count :model/Workspace))))))))

(deftest delete-refuses-an-in-flight-database-test
  (do-with-warehouse!
   (fn [spec db-id]
     (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 url (create-body db-id ["sales"]))
           {wsd-id :id} (t2/select-one :model/WorkspaceDatabase :workspace_id ws-id)]
       (testing "a database another request holds, fresh in flight, is a 409 and nothing is torn down"
         (ws.status/take-lock! :database wsd-id #{:provisioned} :deprovisioning)
         (is (=? {:error-code "workspace_busy"} (mt/user-http-request :crowberto :delete 409 (ws-url ws-id))))
         (is (= 1 (count (workspace-roles spec))))
         (is (= :deprovisioning (t2/select-one-fn :status :model/WorkspaceDatabase :id wsd-id))))
       (testing "once it is stale it reads as failed and DELETE takes it over"
         (t2/query-one {:update :workspace_database
                        :set    {:updated_at (t/minus (t/offset-date-time) (t/minutes (inc ws.status/stale-after-minutes)))}
                        :where  [:= :id wsd-id]})
         (mt/user-http-request :crowberto :delete 204 (ws-url ws-id))
         (is (empty? (workspace-roles spec))))))))

(deftest delete-gives-back-locks-it-took-test
  (do-with-warehouse!
   (fn [spec db-id]
     (mt/with-temp [:model/Database {other-id :id} {:engine :postgres, :details (superuser-details)}]
       (mt/user-http-request :crowberto :put 204
                             (format "ee/workspace-manager/database/%d/provisioning-connection" other-id)
                             {:details provisioner})
       (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 url
                                               {:name      "two"
                                                :databases [{:database_id db-id, :schemas ["sales"]}
                                                            {:database_id other-id, :schemas ["finance"]}]})
             [first-wsd second-wsd] (t2/select-pks-vec :model/WorkspaceDatabase :workspace_id ws-id {:order-by [[:id :asc]]})]
         (ws.status/take-lock! :database second-wsd #{:provisioned} :deprovisioning)
         (mt/user-http-request :crowberto :delete 409 (ws-url ws-id))
         (testing "the first database's lock, taken before the second refused, is given back"
           (is (= :provisioned (t2/select-one-fn :status :model/WorkspaceDatabase :id first-wsd))))
         (is (= 2 (count (workspace-roles spec))))
         (t2/update! :model/WorkspaceDatabase :id second-wsd {:status :provisioned})
         (mt/user-http-request :crowberto :delete 204 (ws-url ws-id))
         (is (empty? (workspace-roles spec)))
         (t2/delete! :model/WorkspaceProvisioningConnection :database_id other-id))))))

(deftest list-and-delete-work-without-the-feature-test
  (do-with-warehouse!
   (fn [spec db-id]
     (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 url (create-body db-id ["sales"]))]
       (mt/with-premium-features #{}
         (is (=? {:data [{:id ws-id}], :total 1} (mt/user-http-request :crowberto :get 200 url)))
         (doseq [[method path body] [[:get (ws-url ws-id)] [:put (ws-url ws-id) {:name "x"}]
                                     [:post url (create-body db-id ["sales"])]]]
           (testing (str method " " path " needs the feature")
             (is (str/includes? (apply mt/user-http-request :crowberto method 402 path (when body [body])) "Workspaces"))))
         (mt/user-http-request :crowberto :delete 204 (ws-url ws-id))
         (is (empty? (workspace-roles spec))))))))

(defn- two-database-body [db-a db-b schema-b]
  {:name "two", :databases [{:database_id db-a, :schemas ["sales"]} {:database_id db-b, :schemas [schema-b]}]})

(defn- workspace-rows []
  [(t2/count :model/Workspace) (t2/count :model/WorkspaceDatabase) (t2/count :model/WorkspaceSchema)])

(deftest a-later-database-failing-rolls-back-the-provisioned-one-test
  (do-with-warehouse!
   (fn [spec db-a]
     (do-with-database!
      (fn [db-b]
        (testing "A provisions, B fails a precondition: 412, and A's user and scratch are gone"
          (exec! spec "GRANT INSERT ON finance.ledger TO PUBLIC")
          (mt/user-http-request :crowberto :post 412 url (two-database-body db-a db-b "finance"))
          (exec! spec "REVOKE INSERT ON finance.ledger FROM PUBLIC")
          (is (empty? (workspace-roles spec)))
          (is (empty? (workspace-schemas spec)))
          (is (= [0 0 0] (workspace-rows))))
        (testing "A provisions, B fails in the warehouse: 502, and A is gone"
          (is (=? {:error-code "warehouse_error"}
                  (mt/user-http-request :crowberto :post 502 url (two-database-body db-a db-b "nosuch"))))
          (is (empty? (workspace-roles spec)))
          (is (empty? (workspace-schemas spec)))
          (is (= [0 0 0] (workspace-rows))))
        (testing "A provisions, B's user already exists: 409, A is gone and B's user is left alone"
          (drop-role-if-exists! spec "mb__isolation_zzzzzzzz")
          (exec! spec "CREATE ROLE mb__isolation_zzzzzzzz LOGIN PASSWORD 'OtherParentPassw0rd'")
          (try
            (let [ids (atom ["aaaabbbb" "zzzzzzzz"])]
              (mt/with-dynamic-fn-redefs [driver.u/random-isolation-id (fn [] (let [[id] @ids] (swap! ids rest) id))]
                (is (=? {:error-code "workspace_user_exists"}
                        (mt/user-http-request :crowberto :post 409 url (two-database-body db-a db-b "finance"))))))
            (is (empty? (workspace-roles spec)))
            (is (empty? (workspace-schemas spec)))
            (is (= [{:rolcanlogin true}]
                   (query spec "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'mb__isolation_zzzzzzzz'")))
            (is (= [0 0 0] (workspace-rows)))
            (finally
              (drop-role-if-exists! spec "mb__isolation_zzzzzzzz")))))))))

(defn- blocking
  "`f` wrapped so that each call delivers the next of `entered` and waits for the next of `released` first."
  [f entered released]
  (let [calls (atom -1)]
    (fn [& args]
      (let [i (swap! calls inc)]
        (deliver (nth entered i) true)
        (deref (nth released i) 30000 nil)
        (apply f args)))))

(defn- age-rows!
  "Move `updated_at` of the rows of `table` with ids in `ids` past the staleness cutoff."
  [table ids]
  (t2/query-one {:update table
                 :set    {:updated_at (t/minus (t/offset-date-time) (t/minutes (inc ws.status/stale-after-minutes)))}
                 :where  [:in :id ids]}))

(deftest a-long-create-keeps-every-row-it-holds-fresh-test
  (do-with-warehouse!
   (fn [spec db-a]
     (do-with-database!
      (fn [db-b]
        ;; three adds: A's two schemas, then B's, which is let through at once
        (let [entered  [(promise) (promise) (promise)]
              released [(promise) (promise) (doto (promise) (deliver true))]
              add      driver/add-workspace-schema!]
          (with-redefs [driver/add-workspace-schema! (blocking add entered released)]
            (let [create (future (mt/user-http-request :crowberto :post 200 url
                                                       {:name      "long"
                                                        :databases [{:database_id db-a, :schemas ["sales" "finance"]}
                                                                    {:database_id db-b, :schemas ["sales"]}]}))]
              (is (deref (first entered) 30000 false))
              (let [b-wsd     (t2/select-one-pk :model/WorkspaceDatabase :database_id db-b)
                    b-schemas (t2/select-pks-vec :model/WorkspaceSchema :workspace_database_id b-wsd)]
                (testing "rows of B, not reached yet, aged while A's first schema is added"
                  (age-rows! :workspace_database [b-wsd])
                  (age-rows! :workspace_schema b-schemas))
                (deliver (first released) true)
                (is (deref (second entered) 30000 false))
                (testing "before A's next step, every row the create holds was refreshed, so none reads as failed"
                  (is (=? {:data [{:databases [{:status "provisioning"} {:status "provisioning"
                                                                         :schemas [{:status "adding"}]}]}]}
                          (mt/user-http-request :crowberto :get 200 url))))
                (deliver (second released) true)
                (is (=? {:databases [{:status "provisioned"} {:status "provisioned"}]} (deref create 60000 nil)))))))
        (mt/user-http-request :crowberto :delete 204 (ws-url (t2/select-one-pk :model/Workspace)))
        (is (empty? (workspace-roles spec))))))))

(deftest delete-refuses-a-create-in-flight-test
  (do-with-warehouse!
   (fn [spec db-a]
     (do-with-database!
      (fn [db-b]
        (let [entered  [(promise)]
              released [(promise)]
              init     driver/init-workspace-isolation!
              calls    (atom 0)]
          ;; block B's init: by then A is provisioned and holds no in-flight lock
          (with-redefs [driver/init-workspace-isolation! (fn [& args]
                                                           (when (= 2 (swap! calls inc))
                                                             (deliver (first entered) true)
                                                             (deref (first released) 30000 nil))
                                                           (apply init args))]
            (let [create (future (mt/user-http-request :crowberto :post 200 url (two-database-body db-a db-b "sales")))]
              (is (deref (first entered) 30000 false))
              (let [ws-id    (t2/select-one-pk :model/Workspace)
                    a-wsd    (t2/select-one :model/WorkspaceDatabase :database_id db-a)
                    tokens   #(t2/select-fn-set :lock_token :model/WorkspaceDatabase :workspace_id ws-id)
                    before   (tokens)]
                (is (= :provisioned (:status a-wsd)))
                (testing "DELETE is a 409 and touches no lock token, even of the provisioned database"
                  (is (=? {:error-code "workspace_busy"} (mt/user-http-request :crowberto :delete 409 (ws-url ws-id))))
                  (is (= before (tokens))))
                (deliver (first released) true)
                (testing "so the create finishes"
                  (is (=? {:databases [{:status "provisioned"} {:status "provisioned"}]} (deref create 60000 nil))))
                (mt/user-http-request :crowberto :delete 204 (ws-url ws-id))
                (is (empty? (workspace-roles spec))))))))))))
