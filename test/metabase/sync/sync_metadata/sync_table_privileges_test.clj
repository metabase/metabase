(ns metabase.sync.sync-metadata.sync-table-privileges-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models]
   [metabase.sync.sync-metadata.sync-table-privileges :as sync-table-privileges]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest sync-table-privileges!-test
  (mt/with-test-drivers #{:postgres}
    (testing "`TablePrivileges` should store the correct data for current_user and role privileges for postgres"
      (mt/with-empty-db
        (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
          (try
            (jdbc/execute! conn-spec (str "CREATE SCHEMA foo;"
                                          "CREATE TABLE foo.baz (id INTEGER);"
                                          "CREATE ROLE privilege_rows_test_example_role WITH LOGIN;"
                                          "GRANT SELECT ON foo.baz TO privilege_rows_test_example_role;"
                                          "GRANT USAGE ON SCHEMA foo TO privilege_rows_test_example_role;"))
            (t2/delete! :model/Table) ;; delete previously created tables
            (sync-tables/sync-tables-and-database! (mt/db))
            (sync-table-privileges/sync-table-privileges! (mt/db))
            (let [table-id (t2/select-one-pk :model/Table :name "baz" :schema "foo")]
              (is (= [{:table_id        table-id
                       :is_current_user false
                       :role            "privilege_rows_test_example_role"
                       :select          true
                       :delete          false
                       :insert          false
                       :update          false}]
                     (->> (t2/select :model/TablePrivileges :table_id table-id)
                          (filter #(= (:role %) "privilege_rows_test_example_role"))
                          (map #(dissoc % :id))))))
            (finally
              (doseq [stmt ["REVOKE ALL PRIVILEGES ON TABLE foo.baz FROM privilege_rows_test_example_role;"
                            "REVOKE ALL PRIVILEGES ON SCHEMA foo FROM privilege_rows_test_example_role;"
                            "DROP ROLE privilege_rows_test_example_role;"]]
                (jdbc/execute! conn-spec stmt)))))))))
