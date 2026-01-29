(ns ^:mb/driver-tests metabase-enterprise.impersonation.driver-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase-enterprise.test :as met]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.query-processor :as qp]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(deftest ^:parallel connection-impersonation-role-test
  (testing "Returns nil when no impersonations are in effect"
    (mt/with-test-user :rasta
      (is (nil? (impersonation.driver/connection-impersonation-role (mt/db)))))))

(deftest connection-impersonation-role-test-2
  (testing "Correctly fetches the impersonation when one is in effect"
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                   :attributes     {"impersonation_attr" "impersonation_role"}}
      (is (= "impersonation_role"
             (impersonation.driver/connection-impersonation-role (mt/db)))))))

(deftest connection-impersonation-role-test-3
  (testing "Throws exception if multiple conflicting impersonations are in effect"
    ;; Use nested `with-impersonations!` macros so that different groups are used
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr_1"}]
                                                   :attributes     {"impersonation_attr_1" "impersonation_role_1"}}
      (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr_2"}]
                                                     :attributes     {"impersonation_attr_2" "impersonation_role_2"}}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Multiple conflicting connection impersonation policies found for current user"
             (impersonation.driver/connection-impersonation-role (mt/db))))))))

(deftest connection-impersonation-role-test-4
  (testing "Returns nil if the permissions in another group supersede the impersonation"
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                   :attributes     {"impersonation_attr" "impersonation_role"}}
      ;; `with-impersonations!` creates a new group and revokes data perms in `all users`, so if we re-grant data perms
      ;; for all users, it should supersede the impersonation policy in the new group
      (mt/with-full-data-perms-for-all-users!
        (is (nil? (impersonation.driver/connection-impersonation-role (mt/db))))))))

(deftest connection-impersonation-role-test-5
  (testing "Returns nil for superuser, even if they are in a group with an impersonation policy defined"
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                   :attributes     {"impersonation_attr" "impersonation_role"}}
      (request/as-admin
        (is (nil? (impersonation.driver/connection-impersonation-role (mt/db))))))))

(deftest connection-impersonation-role-test-6
  (testing "Does not throw an exception if passed a nil `database-or-id`"
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                   :attributes     {"impersonation_attr" "impersonation_role"}}
      (is (nil? (impersonation.driver/connection-impersonation-role nil))))))

(deftest connection-impersonation-role-test-7
  (testing "Throws an exception if impersonation should be enforced, but the user doesn't have the required attribute"
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                   :attributes     {}}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"User does not have attribute required for connection impersonation."
           (impersonation.driver/connection-impersonation-role (mt/db)))))))

(deftest connection-impersonation-role-test-8
  (testing "Throws an exception if impersonation should be enforced, but the user's attribute is not a single string"
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                   :attributes     {"impersonation_attr" ["one" "two" "three"]}}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Connection impersonation attribute is invalid: role must be a single non-empty string."
           (impersonation.driver/connection-impersonation-role (mt/db)))))))

(deftest connection-impersonation-role-test-9
  (testing "Throws an exception if sandboxing policies are also defined for the current user on the DB"
    (mt/with-premium-features #{:advanced-permissions}
      (met/with-gtaps! {:gtaps {:venues {:query (mt/mbql-query venues)}}}
        (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                       :attributes     {"impersonation_attr" "impersonation_role"}}
          (mt/with-test-user :rasta
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Conflicting sandboxing and impersonation policies found."
                 (impersonation.driver/connection-impersonation-role (mt/db))))))))))

(deftest conn-impersonation-test-postgres
  (mt/test-driver :postgres
    (mt/with-premium-features #{:advanced-permissions}
      (let [db-name "conn_impersonation_test"
            details (mt/dbdef->connection-details :postgres :db {:database-name db-name})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        (tx/with-temp-database! :postgres db-name
          (doseq [statement ["DROP TABLE IF EXISTS PUBLIC.table_with_access;"
                             "DROP TABLE IF EXISTS PUBLIC.table_without_access;"
                             "CREATE TABLE PUBLIC.table_with_access (x INTEGER NOT NULL);"
                             "CREATE TABLE PUBLIC.table_without_access (y INTEGER NOT NULL);"
                             "DROP ROLE IF EXISTS \"impersonation.role\";"
                             "CREATE ROLE \"impersonation.role\";"
                             "REVOKE ALL PRIVILEGES ON DATABASE \"conn_impersonation_test\" FROM \"impersonation.role\";"
                             "GRANT SELECT ON TABLE \"conn_impersonation_test\".PUBLIC.table_with_access TO \"impersonation.role\";"]]
            (jdbc/execute! spec [statement]))
          (mt/with-temp [:model/Database database {:engine :postgres, :details details}]
            (mt/with-db database (sync/sync-database! database)
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" "impersonation.role"}}
                (is (= []
                       (-> {:query "SELECT * FROM \"table_with_access\";"}
                           mt/native-query
                           mt/process-query
                           mt/rows)))
                (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                      #"permission denied"
                                      (-> {:query "SELECT * FROM \"table_without_access\";"}
                                          mt/native-query
                                          mt/process-query
                                          mt/rows)))))))))))

(defmulti impersonation-default-user
  "The database user that will be for the impersonation connection"
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod impersonation-default-user :default
  [driver]
  (tx/db-test-env-var driver :user))

(defmethod impersonation-default-user :postgres
  [_driver]
  (tx/db-test-env-var :postgresql :user))

(defmethod impersonation-default-user :snowflake
  [_driver]
  ;; the env var is 'METABASE CI' but it needs to be 'METABASECI' when setting
  ;; the role in this test (and from the snowflake console)
  "METABASECI")

;; Need to use a new user for clickhouse because the 'default' user is read only
;; Need to use a non-superuser for mysql and sqlserver
(doseq [driver [:clickhouse :mysql :sqlserver]]
  (defmethod impersonation-default-user driver
    [_driver]
    "default_impersonation_user"))

(defmulti impersonation-default-role
  "The default role that will be used for the impersonation connection"
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod impersonation-default-role :default
  [_driver]
  nil)

(defmethod impersonation-default-role :mysql
  [_driver]
  "default_impersonation_role")

(defmethod impersonation-default-role :sqlserver
  [driver]
  (impersonation-default-user driver))

(defmethod impersonation-default-role :snowflake
  [_driver]
  "ACCOUNTADMIN")

(defmulti impersonation-granting-details
  "The database details that will be used to create roles and grant them permissions"
  {:arglists '([driver db])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod impersonation-granting-details :default
  [_driver {:keys [details]}]
  details)

(defmethod impersonation-granting-details :snowflake
  [_driver {:keys [details]}]
  (assoc details :role "ACCOUNTADMIN"))

(defmulti impersonation-details
  "The database details that will be used for the impersonation connection"
  {:arglists '([driver db])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod impersonation-details :default
  [driver {:keys [details]}]
  (assoc details :user (impersonation-default-user driver)))

(defmethod impersonation-details :sqlserver
  [driver {:keys [details]}]
  (assoc details :role (impersonation-default-user driver)))

(defmethod impersonation-details :snowflake
  [driver {:keys [details]}]
  (let [priv-key (tx/db-test-env-var-or-throw driver :private-key)]
    (merge (dissoc details :private-key-id)
           {:private-key-options "uploaded"
            :private-key-value (mt/priv-key->base64-uri priv-key)
            :use-password false})))

(defmethod impersonation-details :postgres
  [_driver {:keys [details]}]
  details)

(deftest conn-impersonation-simple-test
  (mt/test-drivers (mt/normal-drivers-with-feature :connection-impersonation)
    (mt/with-premium-features #{:advanced-permissions}
      (let [venues-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "venues")
            checkins-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "checkins")
            role-a (u/lower-case-en (mt/random-name))
            role-b (u/lower-case-en (mt/random-name))]
        (tx/with-temp-roles! driver/*driver*
          (impersonation-granting-details driver/*driver* (mt/db))
          {role-a {venues-table {}}
           role-b {checkins-table {}}}
          (impersonation-default-user driver/*driver*)
          (impersonation-default-role driver/*driver*)
          (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                   :details (impersonation-details driver/*driver* (mt/db))}]
            (mt/with-db database
              (when (driver/database-supports? driver/*driver* :connection-impersonation-requires-role nil)
                (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] (impersonation-default-role driver/*driver*))))
              (sync/sync-database! database {:scan :schema})
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" role-a}}
                (is (= [[100]]
                       (mt/formatted-rows [int]
                                          (mt/run-mbql-query venues
                                            {:aggregation [[:count]]}))))
                (is (thrown?
                     java.lang.Exception
                     (mt/run-mbql-query checkins
                       {:aggregation [[:count]]}))))
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" role-b}}
                (is (= [[1000]]
                       (mt/formatted-rows [int]
                                          (mt/run-mbql-query checkins
                                            {:aggregation [[:count]]}))))
                (is (thrown?
                     java.lang.Exception
                     (mt/run-mbql-query venues
                       {:aggregation [[:count]]})))))))))))

(deftest conn-impersonation-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :test/column-impersonation)
    (mt/with-premium-features #{:advanced-permissions}
      (let [venues-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "venues")
            products-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "products")
            role-a (u/lower-case-en (mt/random-name))
            role-b (u/lower-case-en (mt/random-name))]
        (tx/with-temp-roles! driver/*driver*
          (impersonation-granting-details driver/*driver* (mt/db))
          {role-a {venues-table {:columns ["id" "price"]}}
           role-b {products-table {:columns ["id" "category"]}}}
          (impersonation-default-user driver/*driver*)
          (impersonation-default-role driver/*driver*)
          (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                   :details (impersonation-details driver/*driver* (mt/db))}]
            (mt/with-db database
              (when (driver/database-supports? driver/*driver* :connection-impersonation-requires-role nil)
                (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] (impersonation-default-role driver/*driver*))))
              (sync/sync-database! database {:scan :schema})
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" role-a}}
                (is (= [[1 3]]
                       (mt/rows (mt/run-mbql-query venues {:fields [$id $price]
                                                           :filter [:= $id 1]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query venues {:fields [$id $name]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query products)))))
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" role-b}}
                (is (= [[1 "Gizmo"]]
                       (mt/rows (mt/run-mbql-query products {:fields [$id $category]
                                                             :filter [:= $id 1]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query products {:fields [$id $title]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query venues))))))))))))

(deftest conn-impersonation-row-level-test
  (mt/test-drivers (mt/normal-drivers-with-feature :test/rls-impersonation)
    (mt/with-premium-features #{:advanced-permissions}
      (let [venues-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "venues")
            products-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "products")
            role-a (u/lower-case-en (mt/random-name))
            role-b (u/lower-case-en (mt/random-name))]
        (tx/with-temp-roles! driver/*driver*
          (impersonation-granting-details driver/*driver* (mt/db))
          {role-a {venues-table {:rls [:= :id 1]}}
           role-b {products-table {:rls [:= :id 1]}}}
          (impersonation-default-user driver/*driver*)
          nil
          (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                   :details (impersonation-details driver/*driver* (mt/db))}]
            (mt/with-db database
              (when (driver/database-supports? driver/*driver* :connection-impersonation-requires-role nil)
                (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] (impersonation-default-role driver/*driver*))))
              (sync/sync-database! database {:scan :schema})
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" role-a}}
                (is (= [[1 3]]
                       (mt/rows (mt/run-mbql-query venues {:fields [$id $price]}))))
                (is (= []
                       (mt/rows (mt/run-mbql-query venues {:fields [$id $price]
                                                           :filter [:= $id 2]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query products)))))
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" role-b}}
                (is (= [[1 "Gizmo"]]
                       (mt/rows (mt/run-mbql-query products {:fields [$id $category]}))))
                (is (= []
                       (mt/rows (mt/run-mbql-query products {:fields [$id $category]
                                                             :filter [:= $id 2]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query venues))))))))))))

(deftest conn-impersonation-column-and-row-test
  (mt/test-drivers (set/intersection (mt/normal-drivers-with-feature :test/rls-impersonation)
                                     (mt/normal-drivers-with-feature :test/column-impersonation))
    (mt/with-premium-features #{:advanced-permissions}
      (let [venues-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "venues")
            products-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "products")
            role-a (u/lower-case-en (mt/random-name))
            role-b (u/lower-case-en (mt/random-name))]
        (tx/with-temp-roles! driver/*driver*
          (impersonation-granting-details driver/*driver* (mt/db))
          {role-a {venues-table {:columns ["id" "price"]
                                 :rls [:= :id 1]}}
           role-b {products-table {:columns ["id" "category"]
                                   :rls [:= :id 1]}}}
          (impersonation-default-user driver/*driver*)
          nil
          (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                   :details (impersonation-details driver/*driver* (mt/db))}]
            (mt/with-db database
              (when (driver/database-supports? driver/*driver* :connection-impersonation-requires-role nil)
                (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] (impersonation-default-role driver/*driver*))))
              (sync/sync-database! database {:scan :schema})
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" role-a}}
                (is (= [[1 3]]
                       (mt/rows (mt/run-mbql-query venues {:fields [$id $price]}))))
                (is (= []
                       (mt/rows (mt/run-mbql-query venues {:fields [$id $price]
                                                           :filter [:= $id 2]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query venues {:fields [$id $name]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query products)))))
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" role-b}}
                (is (= [[1 "Gizmo"]]
                       (mt/rows (mt/run-mbql-query products {:fields [$id $category]}))))
                (is (= []
                       (mt/rows (mt/run-mbql-query products {:fields [$id $category]
                                                             :filter [:= $id 2]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query products {:fields [$id $title]}))))
                (is (thrown?
                     clojure.lang.ExceptionInfo
                     (mt/rows (mt/run-mbql-query venues))))))))))))

(deftest conn-impersonation-sqlserver-test
  (mt/test-driver :sqlserver
    (mt/with-premium-features #{:advanced-permissions}
      (let [venues-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "venues")
            role-a (u/lower-case-en (mt/random-name))
            ;; todo: this relies on the impersonation user being the login credential. This is not necessarily true
            ;; on sqlserver. see #60672
            impersonation-user (impersonation-default-user driver/*driver*)
            details (:details (mt/db))]
        (tx/with-temp-roles! driver/*driver*
          (impersonation-granting-details driver/*driver* (mt/db))
          {role-a {venues-table {}}}
          impersonation-user
          (impersonation-default-role driver/*driver*)
          (testing "Using connection impersonation with a user that can't be impersonated returns an error"
            (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                     :details details}]
              (mt/with-db database
                (sync/sync-database! database {:scan :schema})
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" role-a}}
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"Connection impersonation is enabled for this database, but no default role is found"
                       (mt/run-mbql-query venues
                         {:aggregation [[:count]]})))))))
          (testing "Using connection impersonation with a default user that can't be impersonated works if an impersonation user (role) is provided"
            (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                     :details (merge details {:role impersonation-user})}]
              (mt/with-db database
                (sync/sync-database! database {:scan :schema})
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" role-a}}
                  (is (= [[100]]
                         (mt/rows
                          (mt/run-mbql-query venues
                            {:aggregation [[:count]]}))))
                  (is (thrown?
                       java.lang.Exception
                       (mt/run-mbql-query checkins
                         {:aggregation [[:count]]}))))))))))))

(deftest conn-impersonation-with-db-routing
  (mt/test-driver :postgres
    (mt/with-premium-features #{:advanced-permissions :database-routing}
      (let [router-db-name "db_routing_router"
            router-details (mt/dbdef->connection-details :postgres :db {:database-name router-db-name})
            router-spec    (sql-jdbc.conn/connection-details->spec :postgres router-details)
            destination-db-name "db_routing_destination"
            destination-details (mt/dbdef->connection-details :postgres :db {:database-name destination-db-name})
            destination-spec (sql-jdbc.conn/connection-details->spec :postgres destination-details)]
        (tx/with-temp-database! :postgres router-db-name
          (tx/with-temp-database! :postgres destination-db-name
            (doseq [statement ["DROP ROLE IF EXISTS \"impersonation.role\";"
                               "CREATE ROLE \"impersonation.role\";"]]
              (jdbc/execute! router-spec [statement]))
            (doseq [[spec n] [[router-spec "router"] [destination-spec "destination"]]
                    statement ["CREATE TABLE messages (user_id INTEGER NOT NULL, content TEXT NOT NULL);"
                               "GRANT SELECT ON messages to \"impersonation.role\";"
                               "CREATE POLICY \"impersonation.role\" ON messages FOR SELECT TO \"impersonation.role\" USING (user_id=1);"
                               (str
                                "INSERT INTO messages (user_id, content) VALUES "
                                (format "(1, 'hello to user 1 in the %s DB'), " n)
                                (format "(2, 'hello to user 2 in the %s DB'), " n)
                                (format "(1, 'hello to user 1 in the %s DB');" n))
                               "ALTER TABLE messages ENABLE ROW LEVEL SECURITY;"]]
              (jdbc/execute! spec [statement]))
            (mt/with-temp [:model/Database router-database {:engine :postgres, :details router-details}
                           :model/Database _ {:router_database_id (u/the-id router-database)
                                              :engine :postgres
                                              :details destination-details
                                              :name destination-db-name}]
              (mt/with-db router-database (sync/sync-database! router-database)
                (testing "Database Routing OFF"
                  (testing "impersonation OFF"
                    (testing "both crowberto and rasta see all rows in the ROUTER database"
                      (is (= [[1 "hello to user 1 in the router DB"]
                              [2 "hello to user 2 in the router DB"]
                              [1 "hello to user 1 in the router DB"]]
                             (mt/with-test-user :crowberto
                               (-> {:query "SELECT * FROM \"messages\";"}
                                   mt/native-query
                                   mt/process-query
                                   mt/rows))
                             (mt/with-test-user :rasta
                               (-> {:query "SELECT * FROM \"messages\";"}
                                   mt/native-query
                                   mt/process-query
                                   mt/rows))))))
                  (testing "impersonation ON"
                    (testing "both see router DB, but crowberto sees all rows"
                      (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (u/the-id router-database) :attribute "impersonation_attr"}]
                                                                     :attributes     {"impersonation_attr" "impersonation.role"}}

                        (is (= [[1 "hello to user 1 in the router DB"]
                                [2 "hello to user 2 in the router DB"]
                                [1 "hello to user 1 in the router DB"]]
                               (mt/with-test-user :crowberto
                                 (-> {:query "SELECT * FROM \"messages\";"}
                                     mt/native-query
                                     mt/process-query
                                     mt/rows))))
                        (is (= [[1 "hello to user 1 in the router DB"]
                                [1 "hello to user 1 in the router DB"]]
                               (mt/with-test-user :rasta
                                 (-> {:query "SELECT * FROM \"messages\";"}
                                     mt/native-query
                                     mt/process-query
                                     mt/rows))))))))
                (testing "Database Routing ON"
                  (mt/with-temp [:model/DatabaseRouter _ {:database_id (u/the-id router-database)
                                                          :user_attribute "db"}]
                    (met/with-user-attributes! :rasta {"db" destination-db-name}
                      (testing "impersonation OFF"
                        (mt/with-test-user :crowberto
                          (is (= [[1 "hello to user 1 in the router DB"]
                                  [2 "hello to user 2 in the router DB"]
                                  [1 "hello to user 1 in the router DB"]]
                                 (-> {:query "SELECT * FROM \"messages\";"}
                                     mt/native-query
                                     mt/process-query
                                     mt/rows)))))
                      (mt/with-test-user :rasta
                        (is (= [[1 "hello to user 1 in the destination DB"]
                                [2 "hello to user 2 in the destination DB"]
                                [1 "hello to user 1 in the destination DB"]]
                               (-> {:query "SELECT * FROM \"messages\";"}
                                   mt/native-query
                                   mt/process-query
                                   mt/rows)))))
                    (testing "impersonation ON"
                      (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (u/the-id router-database) :attribute "impersonation_attr"}]
                                                                     :attributes     {"impersonation_attr" "impersonation.role"
                                                                                      "db" destination-db-name}}
                        (testing "crowberto sees all rows in the router"
                          (mt/with-test-user :crowberto
                            (is (= [[1 "hello to user 1 in the router DB"]
                                    [2 "hello to user 2 in the router DB"]
                                    [1 "hello to user 1 in the router DB"]]
                                   (-> {:query "SELECT * FROM \"messages\";"}
                                       mt/native-query
                                       mt/process-query
                                       mt/rows)))))
                        (testing "... but Rasta sees only user_id=1 rows in the destination"
                          (mt/with-test-user :rasta
                            (is (= [[1 "hello to user 1 in the destination DB"]
                                    [1 "hello to user 1 in the destination DB"]]
                                   (-> {:query "SELECT * FROM \"messages\";"}
                                       mt/native-query
                                       mt/process-query
                                       mt/rows)))))))))))))))))

(deftest conn-impersonation-test-redshift
  (mt/test-driver :redshift
    (mt/with-premium-features #{:advanced-permissions}
      (let [details (mt/dbdef->connection-details :redshift nil nil)
            spec    (sql-jdbc.conn/connection-details->spec :redshift details)
            user    (u/lower-case-en (mt/random-name))
            schema  (sql.tx/session-schema :redshift)]
        (mt/with-temp [:model/Database database {:engine :redshift, :details details}]
          (try
            (doseq [statement [(format "DROP TABLE IF EXISTS \"%s\".table_with_access;" schema)
                               (format "DROP TABLE IF EXISTS \"%s\".table_without_access;" schema)
                               (format "CREATE TABLE \"%s\".table_with_access (x INTEGER NOT NULL);" schema)
                               (format "CREATE TABLE \"%s\".table_without_access (y INTEGER NOT NULL);" schema)
                               (format "CREATE USER %s WITH PASSWORD 'abcD1234';" user)
                               (format "GRANT ALL PRIVILEGES ON SCHEMA \"%s\" TO %s;" schema user)
                               (format "REVOKE ALL PRIVILEGES ON TABLE \"%s\".table_without_access FROM %s;" schema user)
                               (format "GRANT SELECT ON TABLE \"%s\".table_with_access TO %s;" schema user)]]
              (jdbc/execute! spec statement))
            (mt/with-db database
              (sync/sync-database! database {:scan :schema})
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" user}}
                (is (= []
                       (-> {:query (format "SELECT * FROM \"%s\".table_with_access;" schema)}
                           mt/native-query
                           mt/process-query
                           mt/rows)))
                (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                      #"permission denied for relation table_without_access"
                                      (-> {:query (format "SELECT * FROM \"%s\".table_without_access;" schema)}
                                          mt/native-query
                                          mt/process-query
                                          mt/rows)))))
            (finally
              (doseq [statement [(format "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA \"%s\" FROM \"%s\"" schema user)
                                 (format "REVOKE ALL PRIVILEGES ON SCHEMA \"%s\" FROM \"%s\";" schema user)
                                 (format "DROP USER IF EXISTS %s;" user)]]
                (jdbc/execute! spec [statement])))))))))

(deftest conn-impersonation-test-snowflake
  (mt/test-driver :snowflake
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                     :attributes     {"impersonation_attr" "LIMITED.ROLE"}}
        ;; Test database initially has no default role set. All queries should fail, even for non-impersonated users,
        ;; since there is no way to reset the connection after impersonation is applied.
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Connection impersonation is enabled for this database, but no default role is found"
             (mt/run-mbql-query venues
               {:aggregation [[:count]]})))
        (request/as-admin
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Connection impersonation is enabled for this database, but no default role is found"
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]}))))

        ;; Update the test database with a default role that has full permissions
        (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] "ACCOUNTADMIN"))

        (try
          ;; User with connection impersonation should not be able to query a table they don't have access to
          ;; (`LIMITED.ROLE` in CI Snowflake has no data access)
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Cannot perform SELECT. This session does not have a current database. Call 'USE DATABASE', or use a qualified name."
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]})))

          ;; Non-impersonated user should still be able to query the table
          (request/as-admin
            (is (= [100]
                   (mt/first-row
                    (mt/run-mbql-query venues
                      {:aggregation [[:count]]})))))
          (finally
            (t2/update! :model/Database :id (mt/id) (update (mt/db) :details dissoc :role))))))))

(deftest persistence-disabled-when-impersonated-test
  ;; Test explicitly with postgres since it supports persistence and impersonation
  (mt/test-driver :postgres
    (mt/with-premium-features #{:advanced-permissions}
      (mt/dataset test-data
        (mt/with-temp [:model/Card model {:type          :model
                                          :dataset_query (mt/mbql-query products)}]
          (mt/with-persistence-enabled! [persist-models!]
            (mt/as-admin (persist-models!))
            (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                           :attributes     {"impersonation_attr" "impersonation_role"}}
              (let [details (t2/select-one-fn :details :model/Database (mt/id))
                    spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
                ;; Create impersonation_role on test DB so that the non-admin can execute queries
                (doseq [statement ["DROP ROLE IF EXISTS \"impersonation_role\";"
                                   "CREATE ROLE \"impersonation_role\";"
                                   "GRANT ALL PRIVILEGES ON TABLE \"products\" to \"impersonation_role\";"]]
                  (jdbc/execute! spec [statement]))
                (try
                  (let [persisted-info (t2/select-one :model/PersistedInfo
                                                      :database_id (mt/id)
                                                      :card_id (:id model))
                        query          (mt/mbql-query nil
                                         {:aggregation  [:count]
                                          :source-table (str "card__" (:id model))})
                        impersonated-result (mt/with-test-user :rasta (qp/process-query query))
                        ;; Make sure we run admin query second to reset the DB role on the connection for other tests!
                        admin-result        (mt/as-admin (qp/process-query query))]
                    (testing "Impersonated user (rasta) does not hit the model cache"
                      (is (not (str/includes? (-> impersonated-result :data :native_form :query)
                                              (:table_name persisted-info)))
                          "Erroneously used the persisted model cache"))

                    (testing "Query from admin hits the model cache"
                      (is (str/includes? (-> admin-result :data :native_form :query)
                                         (:table_name persisted-info))
                          "Did not use the persisted model cache")))
                  (finally
                    (doseq [statement ["REVOKE ALL PRIVILEGES ON TABLE \"products\" FROM \"impersonation_role\";"
                                       "DROP ROLE IF EXISTS \"impersonation_role\";"]]
                      (jdbc/execute! spec [statement]))))))))))))

(deftest resilient-connection-options-test
  (testing "resilient connections have the correct role set"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc
                                               :+features [:connection-impersonation]})
      (mt/with-premium-features #{:advanced-permissions}
        (let [venues-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "venues")
              role-a (u/lower-case-en (mt/random-name))]

          (tx/with-temp-roles! driver/*driver*

            (impersonation-granting-details driver/*driver* (mt/db))
            {role-a {venues-table {}}}

            (impersonation-default-user driver/*driver*)
            (impersonation-default-role driver/*driver*)

            (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                     :details (impersonation-details driver/*driver* (mt/db))}]
              (mt/with-db database

                (when (driver/database-supports? driver/*driver* :connection-impersonation-requires-role nil)
                  (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] (impersonation-default-role driver/*driver*))))

                (sync/sync-database! database {:scan :schema})

                (let [tables-set #(->> (driver/describe-database
                                        driver/*driver*
                                        (t2/select-one :model/Database (mt/id)))
                                       :tables
                                       set)
                      default-table-set (tables-set)
                      do-with-resolved-connection sql-jdbc.execute/do-with-resolved-connection]
                  (with-redefs [sql-jdbc.execute/do-with-resolved-connection
                                (fn [driver db options f]
                                  (do-with-resolved-connection driver db options
                                                               (fn [conn]
                                                                 (when-not (:connection db)
                                                                   (driver/set-role! driver/*driver* conn role-a))
                                                                 (f conn))))]
                    (is (= default-table-set (tables-set)))))))))))))

(defn do-on-all-connection-in-pool [driver db-id options f]
  (let [max-pool-size (driver.settings/jdbc-data-warehouse-max-connection-pool-size)
        ^CountDownLatch start-latch (java.util.concurrent.CountDownLatch. max-pool-size)
        ^CountDownLatch finish-latch (java.util.concurrent.CountDownLatch. max-pool-size)]
    (doseq [_i (range max-pool-size)]
      (future
        (try
          (sql-jdbc.execute/do-with-connection-with-options
           driver db-id options
           (fn [^Connection conn]
             (.countDown ^CountDownLatch start-latch)
             (when-not (.await ^CountDownLatch start-latch 30 java.util.concurrent.TimeUnit/SECONDS)
               (throw (ex-info "Timeout waiting for all connections to be acquired" {})))
             (f conn)))
          (finally
            (.countDown ^CountDownLatch finish-latch)))))
    (when-not (.await ^CountDownLatch finish-latch 60 java.util.concurrent.TimeUnit/SECONDS)
      (throw (ex-info "Timeout waiting for all futures to complete" {})))))

(deftest nested-do-with-connection-with-options-test
  (testing "nested calls to `do-with-connection-with-options` have the correct connection options set"
    (mt/test-drivers (mt/normal-driver-select {:+parent :sql-jdbc
                                               :+features [:connection-impersonation]})
      (mt/with-premium-features #{:advanced-permissions}
        (let [venues-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "venues")
              checkins-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "checkins")
              role-a (u/lower-case-en (mt/random-name))
              role-b (u/lower-case-en (mt/random-name))]
          (tx/with-temp-roles! driver/*driver*
            (impersonation-granting-details driver/*driver* (mt/db))
            {role-a {venues-table {}}
             role-b {checkins-table {}}}
            (impersonation-default-user driver/*driver*)
            (impersonation-default-role driver/*driver*)
            (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                     :details (impersonation-details driver/*driver* (mt/db))}]
              (mt/with-db database
                (when (driver/database-supports? driver/*driver* :connection-impersonation-requires-role nil)
                  (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] (impersonation-default-role driver/*driver*))))
                (sync/sync-database! database {:scan :schema})
                ;; Give the connection pool time to release any connections held by sync
                (Thread/sleep 1000)
                (do-on-all-connection-in-pool driver/*driver* (mt/id) {}
                                              (fn [^Connection conn]
                                                (driver/set-role! driver/*driver* conn role-a)))
                (is (= [[1000]]
                       ;; wrapping run-mbql-query in do-with-connection-with-options gets us a recursive connection
                       (sql-jdbc.execute/do-with-connection-with-options
                        driver/*driver* (mt/id) {}
                        (fn [^Connection _conn]
                          (mt/formatted-rows [int]
                                             (mt/run-mbql-query checkins {:aggregation [[:count]]}))))))
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" role-a}}
                  (is (= [[100]]
                         (mt/formatted-rows [int]
                                            (mt/run-mbql-query venues
                                              {:aggregation [[:count]]}))))
                  (is (thrown?
                       java.lang.Exception
                       (mt/run-mbql-query checkins
                         {:aggregation [[:count]]}))))))))))))

(deftest impersonated-throws-without-token-test
  (mt/test-drivers (mt/normal-drivers-with-feature :connection-impersonation)
    (mt/with-premium-features #{:advanced-permissions}
      (let [venues-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "venues")
            checkins-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "checkins")
            role-a (u/lower-case-en (mt/random-name))
            role-b (u/lower-case-en (mt/random-name))]
        (tx/with-temp-roles! driver/*driver*
          (impersonation-granting-details driver/*driver* (mt/db))
          {role-a {venues-table {}}
           role-b {checkins-table {}}}
          (impersonation-default-user driver/*driver*)
          (impersonation-default-role driver/*driver*)
          (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                   :details (impersonation-details driver/*driver* (mt/db))}]
            (mt/with-db database
              (when (driver/database-supports? driver/*driver* :connection-impersonation-requires-role nil)
                (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] (impersonation-default-role driver/*driver*))))
              (sync/sync-database! database {:scan :schema})
              ;; this creates impersonations for the rasta user by default, and does `(request/with-test-user :rasta ...)`
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" role-a}}
                (mt/with-premium-features #{}
                  (testing "impersonated user is blocked"
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                          #"Advanced Permissions is a paid feature not currently available"
                                          (mt/formatted-rows [int]
                                                             (mt/run-mbql-query venues
                                                               {:aggregation [[:count]]})))))
                  (testing "admin should still be able to query"
                    (request/as-admin
                      (is (= [100]
                             (map
                              long
                              (mt/first-row
                               (mt/run-mbql-query venues
                                 {:aggregation [[:count]]}))))))))))))))))

;; TODO(rileythomp, 2026-01-23): Enable this test when we upgrade ClickHouse JDBC driver past 0.8.4
#_(deftest clickhouse-double-hyphen-test
    (testing "can use impersonation on clickhouse with role containing a double hyphen (#57016)"
      (mt/test-driver :clickhouse
        (mt/with-premium-features #{:advanced-permissions}
          (let [venues-table (sql.tx/qualify-and-quote driver/*driver* "test-data" "venues")
                role-a "role--with--double--hyphens"]
            (tx/with-temp-roles! driver/*driver*
              (impersonation-granting-details driver/*driver* (mt/db))
              {role-a {venues-table {}}}
              (impersonation-default-user driver/*driver*)
              (impersonation-default-role driver/*driver*)
              (mt/with-temp [:model/Database database {:engine driver/*driver*,
                                                       :details (impersonation-details driver/*driver* (mt/db))}]
                (mt/with-db database
                  (when (driver/database-supports? driver/*driver* :connection-impersonation-requires-role nil)
                    (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] (impersonation-default-role driver/*driver*))))
                  (sync/sync-database! database {:scan :schema})
                  (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                                 :attributes     {"impersonation_attr" role-a}}
                    (is (= [[100]]
                           (mt/formatted-rows [int]
                                              (mt/run-mbql-query venues
                                                {:aggregation [[:count]]}))))
                    (is (thrown?
                         java.lang.Exception
                         (mt/run-mbql-query checkins
                           {:aggregation [[:count]]}))))))))))))
