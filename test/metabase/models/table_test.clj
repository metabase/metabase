(ns metabase.models.table-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.serialization :as serdes]
   [metabase.models.table :as table :refer [Table]]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest valid-field-order?-test
  (testing "A valid field ordering is a set IDs  of all active fields in a given table"
    (is (#'table/valid-field-order? (mt/id :venues)
                                    [(mt/id :venues :name)
                                     (mt/id :venues :category_id)
                                     (mt/id :venues :latitude)
                                     (mt/id :venues :longitude)
                                     (mt/id :venues :price)
                                     (mt/id :venues :id)])))
  (testing "Field ordering is invalid if some fields are missing"
    (is (false? (#'table/valid-field-order? (mt/id :venues)
                                            [(mt/id :venues :category_id)
                                             (mt/id :venues :latitude)
                                             (mt/id :venues :longitude)
                                             (mt/id :venues :price)
                                             (mt/id :venues :id)]))))
  (testing "Field ordering is invalid if some fields are from a differnt table"
    (is (false? (#'table/valid-field-order? (mt/id :venues)
                                            [(mt/id :venues :name)
                                             (mt/id :venues :category_id)
                                             (mt/id :venues :latitude)
                                             (mt/id :venues :longitude)
                                             (mt/id :venues :price)
                                             (mt/id :checkins :id)]))))
  (testing "Only active fields should be considerd when checking field order"
    (one-off-dbs/with-blank-db
      (doseq [statement [ ;; H2 needs that 'guest' user for QP purposes. Set that up
                         "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                         ;; Keep DB open until we say otherwise :)
                         "SET DB_CLOSE_DELAY -1;"
                         ;; create table & load data
                         "DROP TABLE IF EXISTS \"BIRDS\";"
                         "CREATE TABLE \"BIRDS\" (\"SPECIES\" VARCHAR PRIMARY KEY, \"EXAMPLE_NAME\" VARCHAR);"
                         "GRANT ALL ON \"BIRDS\" TO GUEST;"
                         (str "INSERT INTO \"BIRDS\" (\"SPECIES\", \"EXAMPLE_NAME\") VALUES "
                              "('House Finch', 'Marshawn Finch'),  "
                              "('California Gull', 'Steven Seagull'), "
                              "('Chicken', 'Colin Fowl');")]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (sync/sync-database! (mt/db))
      (is (#'table/valid-field-order? (mt/id :birds)
                                      [(mt/id :birds :species)
                                       (mt/id :birds :example_name)]))
      (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"BIRDS\" DROP COLUMN \"EXAMPLE_NAME\";"])
      (sync/sync-database! (mt/db))
      (is (#'table/valid-field-order? (mt/id :birds)
                                      [(mt/id :birds :species)])))))

(deftest slashes-in-schema-names-test
  (testing "Schema names should allow forward or back slashes (#8693, #12450)"
    (doseq [schema-name ["my\\schema"
                         "my\\\\schema"
                         "my/schema"
                         "my\\/schema"
                         "my\\\\/schema"]]
      (testing (format "Should be able to create/delete Table with schema name %s" (pr-str schema-name))
        (t2.with-temp/with-temp [Table {table-id :id} {:schema schema-name}]
          (is (= schema-name
                 (t2/select-one-fn :schema Table :id table-id))))))))

(deftest identity-hash-test
  (testing "Table hashes are composed of the schema name, table name and the database's identity-hash"
    (mt/with-temp [Database db    {:name "field-db" :engine :h2}
                   Table    table {:schema "PUBLIC" :name "widget" :db_id (:id db)}]
      (let [db-hash (serdes/identity-hash db)]
        (is (= "0395fe49"
               (serdes/raw-hash ["PUBLIC" "widget" db-hash])
               (serdes/identity-hash table)))))))

(deftest set-new-table-permissions!-test
  (testing "New permissions are set appropriately for a new table, for all groups"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                   :model/Database         {db-id :id}    {}
                   :model/Table            {table-id :id} {:db_id  db-id
                                                           :schema "PUBLIC"}]
      ;; All Users group should have full data access, full download abilities, and full metadata management
      (let [all-users-group-id (u/the-id (perms-group/all-users))]
        (is (partial=
             {all-users-group-id
              {db-id
               {:perms/data-access           {"PUBLIC" {table-id :unrestricted}}
                :perms/download-results      {"PUBLIC" {table-id :one-million-rows}}
                :perms/manage-table-metadata {"PUBLIC" {table-id :no}}}}}
             (data-perms/data-permissions-graph :group-id all-users-group-id :db-id db-id))))

      ;; Other groups should have no-self-service data access and no download abilities or metadata management
      (is (partial=
           {group-id
            {db-id
             {:perms/data-access           {"PUBLIC" {table-id :no-self-service}}
              :perms/download-results      {"PUBLIC" {table-id :no}}
              :perms/manage-table-metadata {"PUBLIC" {table-id :no}}}}}
           (data-perms/data-permissions-graph :group-id group-id :db-id db-id))))))

(deftest cleanup-permissions-after-delete-table-test
  (mt/with-temp
    [:model/Database         {db-id :id}    {}
     :model/Table            {table-id :id} {:db_id  db-id}]
    (is (true? (t2/exists? :model/DataPermissions :table_id table-id)))
    (t2/delete! :model/Table table-id)
    (testing "Table-level permissions are deleted when we delete the table"
      (is (false? (t2/exists? :model/DataPermissions :table_id table-id))))))
