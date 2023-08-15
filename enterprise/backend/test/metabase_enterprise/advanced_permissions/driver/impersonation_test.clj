(ns metabase-enterprise.advanced-permissions.driver.impersonation-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.api.util-test
    :as advanced-perms.api.tu]
   [metabase-enterprise.advanced-permissions.driver.impersonation
    :as impersonation]
   [metabase.driver.postgres-test :as postgres-test]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.server.middleware.session :as mw.session]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest connection-impersonation-role-test
  (testing "Returns nil when no impersonations are in effect"
    (is (nil? (@#'impersonation/connection-impersonation-role (mt/db)))))

  (testing "Correctly fetches the impersonation when one is in effect"
    (advanced-perms.api.tu/with-impersonations {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                :attributes     {"impersonation_attr" "impersonation_role"}}
      (is (= "impersonation_role"
             (@#'impersonation/connection-impersonation-role (mt/db))))))

  (testing "Throws exception if multiple conflicting impersonations are in effect"
    ;; Use nested `with-impersonations` macros so that different groups are used
    (advanced-perms.api.tu/with-impersonations {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr_1"}]
                                                :attributes     {"impersonation_attr_1" "impersonation_role_1"}}
      (advanced-perms.api.tu/with-impersonations {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr_2"}]
                                                  :attributes     {"impersonation_attr_2" "impersonation_role_2"}}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Multiple conflicting connection impersonation policies found for current user"
             (@#'impersonation/connection-impersonation-role (mt/db)))))))

  (testing "Returns nil if the permissions in another group supercede the impersonation"
    (advanced-perms.api.tu/with-impersonations {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                :attributes     {"impersonation_attr" "impersonation_role"}}
      ;; `with-impersonations` creates a new group and revokes data perms in `all users`, so if we re-grant data perms
      ;; for all users, it should supercede the impersonation policy in the new group
      (perms/grant-full-data-permissions! (perms-group/all-users) (mt/id))
      (is (nil? (@#'impersonation/connection-impersonation-role (mt/db))))))

  (testing "Returns nil for superuser, even if they are in a group with an impersonation policy defined"
    (advanced-perms.api.tu/with-impersonations {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                :attributes     {"impersonation_attr" "impersonation_role"}}
      (mw.session/as-admin
       (is (nil? (@#'impersonation/connection-impersonation-role (mt/db)))))))

  (testing "Does not throw an exception if passed a nil `database-or-id`"
    (advanced-perms.api.tu/with-impersonations {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                :attributes     {"impersonation_attr" "impersonation_role"}}
      (is (nil? (@#'impersonation/connection-impersonation-role nil))))))

(deftest conn-impersonation-test-postgres
  (mt/test-driver :postgres
    (premium-features-test/with-premium-features #{:advanced-permissions}
      (let [db-name "conn_impersonation_test"
            details (mt/dbdef->connection-details :postgres :db {:database-name db-name})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        (postgres-test/drop-if-exists-and-create-db! db-name)
        (doseq [statement ["DROP TABLE IF EXISTS PUBLIC.table_with_access;"
                           "DROP TABLE IF EXISTS PUBLIC.table_without_access;"
                           "CREATE TABLE PUBLIC.table_with_access (x INTEGER NOT NULL);"
                           "CREATE TABLE PUBLIC.table_without_access (y INTEGER NOT NULL);"
                           "DROP ROLE IF EXISTS impersonation_role;"
                           "CREATE ROLE impersonation_role;"
                           "REVOKE ALL PRIVILEGES ON DATABASE \"conn_impersonation_test\" FROM impersonation_role;"
                           "GRANT SELECT ON TABLE \"conn_impersonation_test\".PUBLIC.table_with_access TO impersonation_role;"]]
          (jdbc/execute! spec [statement]))
        (t2.with-temp/with-temp [Database database {:engine :postgres, :details details}]
          (mt/with-db database (sync/sync-database! database)
            (advanced-perms.api.tu/with-impersonations {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                        :attributes     {"impersonation_attr" "impersonation_role"}}
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
                         mt/rows))))))))))

(deftest conn-impersonation-test-snowflake
  (mt/test-driver :snowflake
    (premium-features-test/with-premium-features #{:advanced-permissions}
      (advanced-perms.api.tu/with-impersonations {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                  :attributes     {"impersonation_attr" "limited_role"}}
        ;; User with connection impersonation should not be able to query a table they don't have access to
        ;; (`limited_role` in CI Snowflake has no data access)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"SQL compilation error:\nDatabase.*does not exist or not authorized"
                              (mt/run-mbql-query venues
                                                 {:aggregation [[:count]]})))
        ;; Non-impersonated user should stil be able to query the table
        (mw.session/as-admin
         (is (= [100]
                (mt/first-row
                 (mt/run-mbql-query venues
                                    {:aggregation [[:count]]})))))))))
