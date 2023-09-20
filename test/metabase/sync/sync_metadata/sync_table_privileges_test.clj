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
  ;; TODO: The following expression should be replaced by
  ;; (mt/test-drivers (mt/normal-drivers-with-feature :table-privileges) ...)
  ;; and we should use more general DDL functions to create tables
  (mt/test-drivers #{:postgres}
    (testing "`TablePrivileges` should store the correct data for current_user and role privileges for postgres"
      (mt/with-empty-db
        (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
          (jdbc/execute! conn-spec (str "CREATE SCHEMA foo; "
                                        "CREATE TABLE foo.baz (id INTEGER);"))
          (sync-tables/sync-tables-and-database! (mt/db))
          (sync-table-privileges/sync-table-privileges! (mt/db))
          (let [table-id (t2/select-one-pk :model/Table :name "baz" :schema "foo")]
            (is (=? [{:table_id        table-id
                      :role            nil
                      :select          true
                      :delete          true
                      :insert          true
                      :update          true}]
                    (t2/select :model/TablePrivileges :table_id table-id :role nil))))))))
  (mt/test-drivers #{:mysql}
    (when (-> (mt/db) :dbms_version :flavor (not= "MariaDB"))
      (testing "`TablePrivileges` should store the correct data for current_user and role privileges for postgres"
        (mt/with-empty-db
          (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
            (jdbc/execute! conn-spec (str "CREATE TABLE baz (id INTEGER);"))
            (sync-tables/sync-tables-and-database! (mt/db))
            (sync-table-privileges/sync-table-privileges! (mt/db))
            (let [table-id (t2/select-one-pk :model/Table :name "baz" :schema nil)]
              (is (=? [{:table_id        table-id
                        :role            nil
                        :select          true
                        :delete          true
                        :insert          true
                        :update          true}]
                      (t2/select :model/TablePrivileges :table_id table-id :role nil))))))))))
