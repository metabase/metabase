(ns metabase.driver.redshift-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.java.jdbc :as jdbc]
            [metabase
             [public-settings :as pubset]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as execute]
             [sync :as sql-jdbc.sync]]
            [metabase.models.database :refer [Database]]
            [metabase.plugins.jdbc-proxy :as jdbc-proxy]
            [metabase.test.data.redshift :as rstest]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :plugins))
(use-fixtures :once (fixtures/initialize :db))

(deftest correct-driver-test
  (mt/test-driver
    :redshift
    (is (= "com.amazon.redshift.jdbc.Driver"
           (.getName (class (jdbc-proxy/wrapped-driver (java.sql.DriverManager/getDriver "jdbc:redshift://host:5432/testdb")))))
        "Make sure we're using the correct driver for Redshift")))

(defn- query->native [query]
  (let [native-query (atom nil)]
    (with-redefs [execute/prepared-statement (fn [_ _ sql _]
                                               (reset! native-query sql)
                                               (throw (Exception. "done")))]
      (u/ignore-exceptions
        (qp/process-query query))
      @native-query)))

(deftest remark-test
  (testing "single field user-specified value"
   (let [expected (str/replace
                   (str
                    "-- /* partner: \"metabase\", {\"dashboard_id\":null,\"chart_id\":1234,\"optional_user_id\":1000,"
                    "\"optional_account_id\":\"" (pubset/site-uuid) "\","
                    "\"filter_values\":{\"id\":[\"1\",\"2\",\"3\"]}} */"
                    " Metabase:: userID: 1000 queryType: MBQL queryHash: cb83d4f6eedc250edb0f2c16f8d9a21e5d42f322ccece1494c8ef3d634581fe2\n"
                    "SELECT \"%schema%\".\"test_data_users\".\"id\" AS \"id\","
                    " \"%schema%\".\"test_data_users\".\"name\" AS \"name\","
                    " \"%schema%\".\"test_data_users\".\"last_login\" AS \"last_login\""
                    " FROM \"%schema%\".\"test_data_users\""
                    " WHERE (\"%schema%\".\"test_data_users\".\"id\" = 1 OR \"%schema%\".\"test_data_users\".\"id\" = 2"
                    " OR \"%schema%\".\"test_data_users\".\"id\" = 3)"
                    " LIMIT 2000")
                   "%schema%" rstest/session-schema-name)]
     (mt/test-driver
      :redshift
      (is (= expected
             (query->native
              (assoc
               (mt/mbql-query users {:limit 2000})
               :parameters [{:type "id", :target ["dimension" ["field-id" (mt/id :users :id)]], :value ["1" "2" "3"]}]
               :info {:executed-by 1000
                      :card-id 1234
                      :context :ad-hoc
                      :nested? false
                      :query-hash (byte-array [-53, -125, -44, -10, -18, -36, 37, 14, -37, 15, 44, 22, -8, -39, -94, 30, 93, 66, -13, 34, -52, -20, -31, 73, 76, -114, -13, -42, 52, 88, 31, -30])})))
          "if I run a Redshift query, does it get a remark added to it?")))))

(deftest determine-select-privilege
  (mt/test-driver :redshift
    (testing "Do we correctly determine SELECT privilege"
      (let [db-name "privilege_test"
            spec    (sql-jdbc.conn/connection-details->spec :redshift (tx/dbdef->connection-details :redshift :server nil))]
        (jdbc/execute! spec [(format "DROP DATABASE IF EXISTS \"%s\";
                                      CREATE DATABASE \"%s\";" db-name db-name)]
                       {:transaction? false})
        (let [details (mt/dbdef->connection-details :redshift :db {:database-name db-name})
              spec    (sql-jdbc.conn/connection-details->spec :redshift details)]
          (mt/with-temp Database [db {:engine  :redshift
                                      :details details}]
            (doseq [statement ["create user GUEST password 'guest';"
                               "drop table if exists \"birds\";"
                               "create table \"birds\" ();"
                               "grant all on \"birds\" to GUEST;"]]
              (jdbc/execute! spec [statement]))
            (is (= #{{:table_name "birds" :table_schem nil}}
                   (sql-jdbc.sync/accessible-tables-for-user :redshift db "GUEST")))
            (jdbc/execute! spec ["revoke all on \"birds\" from GUEST;"])
            (is (empty? (sql-jdbc.sync/accessible-tables-for-user :redshift db "GUEST")))))))))
