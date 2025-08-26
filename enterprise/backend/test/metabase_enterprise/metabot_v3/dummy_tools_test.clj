(ns metabase-enterprise.metabot-v3.dummy-tools-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.dummy-tools :as dummy-tools]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest get-tables-invalid-database-id-test
  (testing "returns error for invalid database-id"
    (is (= {:output "invalid database_id"} (dummy-tools/get-tables {:database-id "invalid"})))
    (is (= {:output "invalid database_id"} (dummy-tools/get-tables {:database-id nil})))
    (is (= {:output "invalid database_id"} (dummy-tools/get-tables {:database-id 1.5})))))

(deftest get-tables-with-database-and-tables-test
  (testing "returns database and tables with columns for valid database-id"
    (mt/with-temp [:model/Database {db-id :id} {:name "Test Database"
                                                :description "Test description"
                                                :engine :h2}
                   :model/Table {table1-id :id} {:name "Users"
                                                 :description "User table"
                                                 :db_id db-id
                                                 :active true}
                   :model/Table {table2-id :id} {:name "Orders"
                                                 :description "Order table"
                                                 :db_id db-id
                                                 :active true}
                   :model/Field {field1-id :id} {:name "id"
                                                 :description "User ID"
                                                 :table_id table1-id
                                                 :base_type :type/Integer}
                   :model/Field {field2-id :id} {:name "name"
                                                 :description "User name"
                                                 :table_id table1-id
                                                 :base_type :type/Text}
                   :model/Field {field3-id :id} {:name "order_id"
                                                 :description "Order ID"
                                                 :table_id table2-id
                                                 :base_type :type/Integer}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-tables {:database-id db-id})]
          (is (contains? result :structured-output))

          ;; Check database info
          (let [db-info (get-in result [:structured-output :database])]
            (is (= db-id (:id db-info)))
            (is (= "Test Database" (:name db-info)))
            (is (= "Test description" (:description db-info)))
            (is (= :h2 (:engine db-info))))

          ;; Check tables
          (let [tables (get-in result [:structured-output :tables])
                table-by-id (into {} (map (juxt :id identity)) tables)]
            (is (= 2 (count tables)))

            ;; Check Users table
            (let [users-table (get table-by-id table1-id)]
              (is (= "Users" (:name users-table)))
              (is (= "User table" (:description users-table)))
              (is (= 2 (count (:columns users-table))))

              ;; Check Users table columns
              (let [columns-by-name (into {} (map (juxt :name identity)) (:columns users-table))]
                (let [id-col (get columns-by-name "id")]
                  (is (= field1-id (:id id-col)))
                  (is (= "User ID" (:description id-col)))
                  (is (= "number" (:type id-col))))

                (let [name-col (get columns-by-name "name")]
                  (is (= field2-id (:id name-col)))
                  (is (= "User name" (:description name-col)))
                  (is (= "string" (:type name-col))))))

            ;; Check Orders table
            (let [orders-table (get table-by-id table2-id)]
              (is (= "Orders" (:name orders-table)))
              (is (= "Order table" (:description orders-table)))
              (is (= 1 (count (:columns orders-table))))

              ;; Check Orders table column
              (let [order-id-col (first (:columns orders-table))]
                (is (= field3-id (:id order-id-col)))
                (is (= "order_id" (:name order-id-col)))
                (is (= "Order ID" (:description order-id-col)))
                (is (= "number" (:type order-id-col)))))))))))

(deftest get-tables-excludes-inactive-tables-test
  (testing "excludes inactive tables"
    (mt/with-temp [:model/Database {db-id :id} {:name "Test DB" :engine :h2}
                   :model/Table {active-table-id :id} {:name "Active Table"
                                                       :db_id db-id
                                                       :active true}
                   :model/Table {inactive-table-id :id} {:name "Inactive Table"
                                                         :db_id db-id
                                                         :active false}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-tables {:database-id db-id})
              tables (get-in result [:structured-output :tables])
              table-ids (set (map :id tables))]
          (is (contains? table-ids active-table-id))
          (is (not (contains? table-ids inactive-table-id))))))))

(deftest get-tables-handles-empty-tables-test
  (testing "handles tables with no columns"
    (mt/with-temp [:model/Database {db-id :id} {:name "Test DB" :engine :h2}
                   :model/Table {table-id :id} {:name "Empty Table"
                                                :db_id db-id
                                                :active true}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-tables {:database-id db-id})
              tables (get-in result [:structured-output :tables])
              empty-table (first (filter #(= table-id (:id %)) tables))]
          (is (some? empty-table))
          (is (= [] (:columns empty-table))))))))

(deftest get-tables-base-type-conversion-test
  (testing "converts base types to appropriate string types"
    (mt/with-temp [:model/Database {db-id :id} {:name "Test DB" :engine :h2}
                   :model/Table {table-id :id} {:name "Type Test Table"
                                                :db_id db-id
                                                :active true}
                   :model/Field _ {:name "int_field" :table_id table-id :base_type :type/Integer}
                   :model/Field _ {:name "float_field" :table_id table-id :base_type :type/Float}
                   :model/Field _ {:name "text_field" :table_id table-id :base_type :type/Text}
                   :model/Field _ {:name "date_field" :table_id table-id :base_type :type/Date}
                   :model/Field _ {:name "datetime_field" :table_id table-id :base_type :type/DateTime}
                   :model/Field _ {:name "time_field" :table_id table-id :base_type :type/Time}
                   :model/Field _ {:name "boolean_field" :table_id table-id :base_type :type/Boolean}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-tables {:database-id db-id})
              table (first (get-in result [:structured-output :tables]))
              columns-by-name (into {} (map (juxt :name identity)) (:columns table))]
          (is (= "number" (:type (get columns-by-name "int_field"))))
          (is (= "number" (:type (get columns-by-name "float_field"))))
          (is (= "string" (:type (get columns-by-name "text_field"))))
          (is (= "date" (:type (get columns-by-name "date_field"))))
          (is (= "datetime" (:type (get columns-by-name "datetime_field"))))
          (is (= "time" (:type (get columns-by-name "time_field"))))
          (is (= "boolean" (:type (get columns-by-name "boolean_field")))))))))

(deftest get-tables-user-permissions-test
  (testing "respects user permissions"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database {db-id :id} {:name "Test DB" :engine :h2}
                     :model/Table {allowed-table-id :id} {:name "Unestricted Table"
                                                          :db_id db-id
                                                          :active true}
                     :model/Table {disallowed-table-id :id} {:name "Restricted Table"
                                                             :db_id db-id
                                                             :active true}]
        (perms/set-table-permission! (perms/all-users-group) allowed-table-id :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms/all-users-group) disallowed-table-id :perms/view-data :blocked)
        (perms/set-table-permission! (perms/all-users-group) allowed-table-id :perms/create-queries :query-builder-and-native)
        (perms/set-table-permission! (perms/all-users-group) disallowed-table-id :perms/create-queries :no)
        ;; Test with regular user (non-superuser)
        (mt/with-current-user (mt/user->id :rasta)
          (let [result (dummy-tools/get-tables {:database-id db-id})]
            (is (some #(= allowed-table-id (:id %)) (get-in result [:structured-output :tables])))
            (is (not (some #(= disallowed-table-id (:id %)) (get-in result [:structured-output :tables]))))))))))

(deftest get-document-details-invalid-document-id-test
  (testing "returns error for invalid document-id"
    (is (= {:output "invalid document_id"} (dummy-tools/get-document-details {:document-id "invalid"})))
    (is (= {:output "invalid document_id"} (dummy-tools/get-document-details {:document-id nil})))
    (is (= {:output "invalid document_id"} (dummy-tools/get-document-details {:document-id 1.5})))))

(deftest get-document-details-valid-document-test
  (testing "returns document details for valid document-id"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Document {doc-id :id} {:name "Test Document"
                                                 :document "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Hello World\"}]}]}"
                                                 :collection_id coll-id
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Test Document" (:name doc-info)))
            (is (= {:content [{:content [{:text "Hello World", :type "text"}], :type "paragraph"}], :type "doc"}
                   (:document doc-info)))))))))

(deftest get-document-details-nonexistent-document-test
  (testing "returns 'document not found' for non-existent document"
    (let [result (dummy-tools/get-document-details {:document-id 99999})]
      (is (= {:output "error fetching document: Not found."} result)))))

(deftest get-document-details-archived-document-test
  (testing "returns document details for archived document"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Document {doc-id :id} {:name "Archived Document"
                                                 :document "{\"type\":\"doc\",\"content\":[]}"
                                                 :collection_id coll-id
                                                 :creator_id (mt/user->id :crowberto)
                                                 :archived true}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Archived Document" (:name doc-info)))
            (is (= {:content [], :type "doc"} (:document doc-info)))))))))

(deftest get-document-details-minimal-document-test
  (testing "returns document details for document with minimal fields"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Minimal Document"
                                                 :document "{\"type\":\"doc\"}"
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Minimal Document" (:name doc-info)))
            (is (= {:type "doc"} (:document doc-info)))))))))

(deftest get-document-details-empty-document-content-test
  (testing "returns document details for document with empty content"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Empty Document"
                                                 :document ""
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Empty Document" (:name doc-info)))
            (is (= nil (:document doc-info)))))))))

(deftest get-document-no-user-access
  (testing "does not return details if the user can't access the document"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Document {doc-id :id} {:name "Empty Document"
                                                   :document ""
                                                   :creator_id (mt/user->id :crowberto)}]
        (mt/with-current-user (mt/user->id :rasta)
          (is (= {:output "error fetching document: You don't have permissions to do that."}
                 (dummy-tools/get-document-details {:document-id doc-id}))))))))
