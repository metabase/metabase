(ns metabase.sync.sync-metadata.sync-table-privileges-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.sync.sync-metadata.sync-table-privileges :as sync-table-privileges]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest sync-table-privileges!-test
  (mt/test-drivers #{:postgres}
    (testing "`TablePrivileges` should store the correct data for current_user and role privileges for postgres"
      (mt/with-model-cleanup [:model/Field :model/Table :model/Database :model/TablePrivileges]
       (mt/with-empty-db
         (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
           (jdbc/execute! conn-spec (str "CREATE SCHEMA foo; "
                                         "CREATE TABLE foo.baz (id INTEGER);"))
           (sync-tables/sync-tables-and-database! (mt/db))
           (sync-table-privileges/sync-table-privileges! (mt/db))
           (let [table-id (t2/select-one-pk :model/Table :name "baz" :schema "foo")]
             (is (=? [{:table_id        table-id
                       :role            string? ; this should be the current user, but it doesn't matter until we need table_privileges to work with connection impersonation
                       :is_current_user true
                       :select          true
                       :delete          true
                       :insert          true
                       :update          true}]
                     (t2/select :model/TablePrivileges :table_id table-id :is_current_user true))))))))))
