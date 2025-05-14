(ns ^:mb/driver-tests metabase-enterprise.impersonation.driver-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase-enterprise.test :as met]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.query-processor :as qp]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
  (testing "Returns nil if the permissions in another group supercede the impersonation"
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                   :attributes     {"impersonation_attr" "impersonation_role"}}
      ;; `with-impersonations!` creates a new group and revokes data perms in `all users`, so if we re-grant data perms
      ;; for all users, it should supercede the impersonation policy in the new group
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
                             "CREATE TABLE PUBLIC.table_with_access (x INTEGER NOT NULL, y INTEGER, z INTEGER);"
                             "CREATE TABLE PUBLIC.table_without_access (y INTEGER NOT NULL);"
                             "INSERT INTO table_with_access (x, y, z) VALUES (1, 2, 3), (2, 4, 6);"]]
            (jdbc/execute! spec [statement]))
          (mt/with-temp [:model/Database database {:engine :postgres, :details details}]
            (mt/with-db database (sync/sync-database! database)
              (tx/with-temp-roles! :postgres
                details
                {"impersonation.role" {:table_with_access {:columns [:x :z]
                                                           :rls [:= :y 4]}}}
                (:user details)
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" "impersonation.role"}}
                  (is (= [[2 6]]
                         (-> {:query "SELECT x, z FROM \"table_with_access\";"}
                             mt/native-query
                             mt/process-query
                             mt/rows)))
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"permission denied"
                       (-> {:query "SELECT y FROM \"table_with_access\";"}
                           mt/native-query
                           mt/process-query
                           mt/rows)))
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"permission denied"
                       (-> {:query "SELECT * FROM \"table_without_access\";"}
                           mt/native-query
                           mt/process-query
                           mt/rows))))))))))))

(deftest conn-impersonation-test-mysql
  (mt/test-driver :mysql
    (mt/with-premium-features #{:advanced-permissions}
      (let [db-name "conn_impersonation_test"
            details (mt/dbdef->connection-details :mysql :db {:database-name db-name})
            spec (sql-jdbc.conn/connection-details->spec :mysql details)]
        (tx/with-temp-database! :mysql db-name
          (doseq [statement ["drop table if exists table_a;"
                             "create table table_a ( id integer primary key );"
                             "insert into table_a values (1), (2);"
                             "drop table if exists table_b;"
                             "create table table_b (id integer primary key );"
                             "insert into table_b values (11), (22);"
                             "drop user if exists 'default_role_user'@'%';"
                             "create user 'default_role_user'@'%' identified by '';"]]
            (jdbc/execute! spec [statement]))
          (tx/with-temp-roles! :mysql
            details
            {"role_a" {"table_a" []}
             "role_b" {"table_b" []}
             "full_access_role" {"table_a" [] "table_b" []}}
            "default_role_user"
            (jdbc/execute! spec [(format "set default role full_access_role %s default_role_user;" (if (mysql/mariadb? (mt/db)) "for" "to"))])
            (mt/with-temp [:model/Database database {:engine :mysql :details (assoc details :user "default_role_user")}]
              (mt/with-db database
                (sync/sync-database! database)
                ;; Update the test database with a default role that has full permissions
                (t2/update! :model/Database :id (mt/id) (assoc-in (mt/db) [:details :role] "full_access_role"))
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" "role_a"}}
                  (is (= [[1] [2]]
                         (-> {:query "select * from table_a;"}
                             mt/native-query
                             mt/process-query
                             mt/rows)))
                  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                        #"SELECT command denied to user"
                                        (-> {:query "select * from table_b;"}
                                            mt/native-query
                                            mt/process-query
                                            mt/rows))))
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" "role_b"}}
                  (is (= [[11] [22]]
                         (-> {:query "select * from table_b;"}
                             mt/native-query
                             mt/process-query
                             mt/rows)))
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"SELECT command denied to user"
                       (-> {:query "select * from table_a;"}
                           mt/native-query
                           mt/process-query
                           mt/rows))))))))))))

(deftest conn-impersonation-test-sqlserver
  (mt/test-driver :sqlserver
    (mt/with-premium-features #{:advanced-permissions}
      (let [db-name "conn_impersonation_test"
            details (mt/dbdef->connection-details :sqlserver :db {:database-name db-name})
            spec (sql-jdbc.conn/connection-details->spec :sqlserver details)]
        (tx/with-temp-database! :sqlserver db-name
          (doseq [statement ["drop table if exists [table_a];"
                             "create table table_a ( id int primary key, foo int, bar int );"
                             "insert into table_a values (1, 2, 3), (2, 4, 6);"
                             "drop table if exists [table_b];"
                             "create table table_b (id int primary key, foo int, bar int );"
                             "insert into table_b values (11, 22, 33), (22, 44, 66);"
                             (format (str "IF NOT EXISTS ("
                                          "SELECT name FROM master.sys.server_principals WHERE name = 'default_role_user')"
                                          "BEGIN CREATE LOGIN [default_role_user] WITH PASSWORD = N'%s' END")
                                     (tx/db-test-env-var :sqlserver :password))
                             "drop user if exists [default_role_user];"
                             "create user default_role_user for login default_role_user;"]]
            (jdbc/execute! spec [statement]))
          (tx/with-temp-roles! :sqlserver
            details
            {"user_a" {"table_a" {:columns ["id" "foo"]}}
             "user_b" {"table_b" {:columns ["id" "bar"]}}}
            "default_role_user"
            (mt/with-temp [:model/Database database {:engine :sqlserver :details (assoc details :user "default_role_user")}]
              (mt/with-db database
                (sync/sync-database! database)
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" "user_a"}}
                  (is (= [[1 2] [2 4]]
                         (-> {:query "select id, foo from table_a;"}
                             mt/native-query
                             mt/process-query
                             mt/rows)))
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"The SELECT permission was denied on the column 'bar' of the object 'table_a'"
                       (-> {:query "select bar from table_a;"}
                           mt/native-query
                           mt/process-query
                           mt/rows)))
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"The SELECT permission was denied on the object"
                       (-> {:query "select * from table_b;"}
                           mt/native-query
                           mt/process-query
                           mt/rows))))
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" "user_b"}}
                  (is (= [[11 33] [22 66]]
                         (-> {:query "select id, bar from table_b;"}
                             mt/native-query
                             mt/process-query
                             mt/rows)))
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"The SELECT permission was denied on the column 'foo' of the object 'table_b'"
                       (-> {:query "select foo from table_b;"}
                           mt/native-query
                           mt/process-query
                           mt/rows)))
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"The SELECT permission was denied on the object"
                       (-> {:query "select * from table_a;"}
                           mt/native-query
                           mt/process-query
                           mt/rows))))))))))))

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
          (doseq [statement [(format "DROP TABLE IF EXISTS \"%s\".table_with_access;" schema)
                             (format "DROP TABLE IF EXISTS \"%s\".table_without_access;" schema)
                             (format "CREATE TABLE \"%s\".table_with_access (x INTEGER NOT NULL, y INTEGER, z INTEGER);" schema)
                             (format "CREATE TABLE \"%s\".table_without_access (y INTEGER NOT NULL);" schema)
                             (format "INSERT INTO \"%s\".table_with_access (x, y, z) VALUES (1, 2, 3), (2, 4, 6);" schema)]]
            (jdbc/execute! spec statement))
          (tx/with-temp-roles! :redshift
            details
            {user {"table_with_access" {:columns ["x" "z"]}}}
            user
            (mt/with-db database
              (sync/sync-database! database {:scan :schema})
              (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                             :attributes     {"impersonation_attr" user}}
                (is (= [[1 3] [2 6]]
                       (-> {:query (format "SELECT * FROM \"%s\".table_with_access;" schema)}
                           mt/native-query
                           mt/process-query
                           mt/rows)))
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"permission denied for relation table_with_access"
                     (-> {:query (format "SELECT y FROM \"%s\".table_with_access;" schema)}
                         mt/native-query
                         mt/process-query
                         mt/rows)))
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"permission denied for relation table_without_access"
                     (-> {:query (format "SELECT * FROM \"%s\".table_without_access;" schema)}
                         mt/native-query
                         mt/process-query
                         mt/rows)))))))))))

(deftest conn-impersonation-test-snowflake
  (mt/test-driver :snowflake
    (mt/with-premium-features #{:advanced-permissions}
      (let [details (assoc (:details (mt/db)) :role "ACCOUNTADMIN")
            spec (sql-jdbc.conn/connection-details->spec :snowflake details)]
        (doseq [statement ["DROP ROLE IF EXISTS TEST_ROLE_2;"
                           "CREATE ROLE TEST_ROLE_2;"
                           #_"GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE TEST_ROLE_2;"
                           #_"GRANT USAGE ON DATABASE \"v3_sample-dataset\" TO ROLE TEST_ROLE_2;"
                           #_(format "GRANT USAGE ON DATABASE \"%s\" TO ROLE TEST_ROLE_2;" (-> (first (t2/select :model/Database :engine :snowflake)) :details :db))
                           #_"USE DATABASE \"v3_sample-dataset\";"
                           #_(format "GRANT USAGE ON SCHEMA \"v3_sample-dataset\".\"%s\" TO ROLE TEST_ROLE_2;" (-> (first (t2/select :model/Database :engine :snowflake)) :details :db))
                           #_(format "GRANT USAGE ON SCHEMA \"%s\".\"PUBLIC\" TO ROLE TEST_ROLE_2;" (-> (first (t2/select :model/Database :engine :snowflake)) :details :db))
                           #_(format "GRANT SELECT ON ALL TABLES IN SCHEMA \"%s\".\"PUBLIC\" TO ROLE TEST_ROLE_2;" (-> (first (t2/select :model/Database :engine :snowflake)) :details :db))
                           #_(format "GRANT SELECT ON TABLE  \"%s\".\"PUBLIC\".\"venues\" TO ROLE TEST_ROLE_2;" (-> (first (t2/select :model/Database :engine :snowflake)) :details :db))
                           (format "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA \"%s\".\"PUBLIC\" FROM ROLE TEST_ROLE_2;" (-> (first (t2/select :model/Database :engine :snowflake)) :details :db))
                           "GRANT ROLE TEST_ROLE_2 TO ROLE ACCOUNTADMIN;"
                           #_"GRANT ROLE TEST_ROLE_2 TO USER SNOWFLAKE_DEVELOPER;"
                           #_"DROP ROLE IF EXISTS TEST_ROLE_2;"]]
          (tap> {:stmt statement})
          (jdbc/execute! spec [statement]))
        (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                       :attributes     {"impersonation_attr" "TEST_ROLE_2" #_"LIMITED.ROLE"}}
          ;; Test database initially has no default role set. All queries should fail, even for non-impersonated users,
          ;; since there is no way to reset the connection after impersonation is applied.
          #_(is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Connection impersonation is enabled for this database, but no default role is found"
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]})))
          #_(request/as-admin
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
                 #"SQL compilation error:\nObject does not exist, or operation cannot be performed."
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]})))

            #_(is (= [[100]]
                     (mt/rows (mt/run-mbql-query venues
                                {:aggregation [[:count]]}))))

            ;; Non-impersonated user should stil be able to query the table
            (request/as-admin
              (is (= [100]
                     (mt/first-row
                      (mt/run-mbql-query venues
                        {:aggregation [[:count]]})))))
            (finally
              #_(t2/update! :model/Database :id (mt/id) (update (mt/db) :details dissoc :role)))))))))

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
