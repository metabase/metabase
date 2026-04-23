(ns metabase.models.serialization.resolve.db-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.models.serialization.resolve.db :as resolve.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest import-table-fk-creates-stub-table-test
  (testing "import-table-fk creates a stub table when the table doesn't exist"
    (mt/with-temp [:model/Database {db-id :id db-name :name} {}]
      (let [table-name "BRAND_NEW_TABLE"
            schema     "PUBLIC"
            table-id   (resolve.db/import-table-fk [db-name schema table-name])]
        (testing "returns a numeric table ID"
          (is (pos-int? table-id)))
        (testing "the table exists in the DB with correct attributes"
          (let [table (t2/select-one :model/Table :id table-id)]
            (is (= table-name (:name table)))
            (is (= schema (:schema table)))
            (is (= db-id (:db_id table)))))
        (testing "calling again returns the same ID (idempotent)"
          (is (= table-id (resolve.db/import-table-fk [db-name schema table-name]))))))))

(deftest import-table-fk-existing-table-test
  (testing "import-table-fk returns existing table ID when table exists"
    (mt/with-temp [:model/Database {db-id :id db-name :name} {}
                   :model/Table    {table-id :id}             {:db_id db-id :name "ORDERS" :schema "PUBLIC"}]
      (is (= table-id (resolve.db/import-table-fk [db-name "PUBLIC" "ORDERS"]))))))

(deftest import-table-fk-unknown-database-test
  (testing "import-table-fk throws when the database doesn't exist"
    (is (thrown?
         clojure.lang.ExceptionInfo
         (resolve.db/import-table-fk ["no-such-database" "PUBLIC" "ORDERS"])))))

(deftest import-field-fk-creates-stub-field-test
  (testing "import-field-fk creates a stub field when the field doesn't exist on an existing table"
    (mt/with-temp [:model/Database {db-id :id db-name :name} {}
                   :model/Table    {table-id :id}             {:db_id db-id :name "ORDERS" :schema "PUBLIC"}]
      (let [field-id (resolve.db/import-field-fk
                      resolve.db/default-import-resolver
                      [db-name "PUBLIC" "ORDERS" "BRAND_NEW_FIELD"])]
        (testing "returns a numeric field ID"
          (is (pos-int? field-id)))
        (testing "the field exists with correct attributes"
          (let [field (t2/select-one :model/Field :id field-id)]
            (is (= "BRAND_NEW_FIELD" (:name field)))
            (is (= table-id (:table_id field)))
            (is (= :type/* (:base_type field)))))))))

(deftest import-field-fk-creates-stub-table-and-field-test
  (testing "import-field-fk creates both table and field when neither exists"
    (mt/with-temp [:model/Database {db-id :id db-name :name} {}]
      (let [field-id (resolve.db/import-field-fk
                      resolve.db/default-import-resolver
                      [db-name "PUBLIC" "BRAND_NEW_TABLE" "BRAND_NEW_FIELD"])]
        (testing "returns a numeric field ID"
          (is (pos-int? field-id)))
        (testing "the table was created"
          (is (t2/exists? :model/Table :name "BRAND_NEW_TABLE" :schema "PUBLIC" :db_id db-id)))
        (testing "the field was created on that table"
          (let [field    (t2/select-one :model/Field :id field-id)
                table-id (t2/select-one-pk :model/Table :name "BRAND_NEW_TABLE" :schema "PUBLIC" :db_id db-id)]
            (is (= "BRAND_NEW_FIELD" (:name field)))
            (is (= table-id (:table_id field)))))))))

(deftest import-field-fk-existing-field-test
  (testing "import-field-fk returns existing field ID when field already exists"
    (mt/with-temp [:model/Database {db-id :id db-name :name} {}
                   :model/Table    {table-id :id}             {:db_id db-id :name "ORDERS" :schema "PUBLIC"}
                   :model/Field    {field-id :id}             {:table_id table-id :name "TOTAL"
                                                               :base_type :type/Float :database_type "FLOAT"}]
      (is (= field-id (resolve.db/import-field-fk
                       resolve.db/default-import-resolver
                       [db-name "PUBLIC" "ORDERS" "TOTAL"]))))))

(deftest import-field-fk-unknown-database-test
  (testing "import-field-fk throws when the database doesn't exist"
    (is (thrown?
         clojure.lang.ExceptionInfo
         (resolve.db/import-field-fk
          resolve.db/default-import-resolver
          ["no-such-db" "PUBLIC" "ORDERS" "TOTAL"])))))
