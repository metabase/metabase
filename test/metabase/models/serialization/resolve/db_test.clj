(ns metabase.models.serialization.resolve.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest import-table-fk-existing-test
  (testing "returns the existing table id when found"
    (mt/with-temp [:model/Database {db-id :id}    {:name "test-db"}
                   :model/Table    {table-id :id} {:db_id db-id :name "users" :schema "public"}]
      (is (= table-id (serdes/*import-table-fk* ["test-db" "public" "users"]))))))

(deftest import-table-fk-synthesizes-inactive-table-test
  (testing "creates an inactive table when the database exists but the table doesn't"
    (mt/with-model-cleanup [:model/Table]
      (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}]
        (let [table-id (serdes/*import-table-fk* ["test-db" "public" "missing"])]
          (is (=? {:id     table-id
                   :db_id  db-id
                   :schema "public"
                   :name   "missing"
                   :active false}
                  (t2/select-one :model/Table :id table-id))))))))

(deftest import-table-fk-no-schema-test
  (testing "synthesizes a table when schema is nil"
    (mt/with-model-cleanup [:model/Table]
      (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}]
        (let [table-id (serdes/*import-table-fk* ["test-db" nil "schemaless"])]
          (is (=? {:id     table-id
                   :db_id  db-id
                   :schema nil
                   :name   "schemaless"
                   :active false}
                  (t2/select-one :model/Table :id table-id))))))))

(deftest import-table-fk-throws-when-database-missing-test
  (testing "throws when the database itself does not exist"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"database not found"
                          (serdes/*import-table-fk* ["does-not-exist" "public" "users"])))))

(deftest import-field-fk-existing-test
  (testing "returns the existing field id when found"
    (mt/with-temp [:model/Database {db-id :id}    {:name "test-db"}
                   :model/Table    {table-id :id} {:db_id db-id :name "users" :schema "public"}
                   :model/Field    {field-id :id} {:table_id table-id :name "email"}]
      (is (= field-id
             (serdes/*import-field-fk* ["test-db" "public" "users" "email"]))))))

(deftest import-field-fk-synthesizes-inactive-field-test
  (testing "creates an inactive field when the table exists but the field doesn't"
    (mt/with-model-cleanup [:model/Field]
      (mt/with-temp [:model/Database {db-id :id}    {:name "test-db"}
                     :model/Table    {table-id :id} {:db_id db-id :name "users" :schema "public"}]
        (let [field-id (serdes/*import-field-fk* ["test-db" "public" "users" "missing"])]
          (is (=? {:id        field-id
                   :table_id  table-id
                   :parent_id nil
                   :name      "missing"
                   :active    false}
                  (t2/select-one :model/Field :id field-id))))))))

(deftest import-field-fk-synthesizes-nested-chain-test
  (testing "creates inactive parent fields along the chain when missing"
    (mt/with-model-cleanup [:model/Field]
      (mt/with-temp [:model/Database {db-id :id}    {:name "test-db"}
                     :model/Table    {table-id :id} {:db_id db-id :name "events" :schema "public"}]
        (let [field-id (serdes/*import-field-fk* ["test-db" "public" "events" "outer" "middle" "inner"])
              inner    (t2/select-one :model/Field :id field-id)
              middle   (t2/select-one :model/Field :id (:parent_id inner))
              outer    (t2/select-one :model/Field :id (:parent_id middle))]
          (is (=? {:name "inner"  :active false}                                                   inner))
          (is (=? {:name "middle" :active false :parent_id (:id outer)}                            middle))
          (is (=? {:name "outer"  :active false :parent_id nil          :table_id table-id}        outer)))))))

(deftest import-field-fk-reuses-existing-parent-test
  (testing "uses an existing parent field rather than creating a duplicate"
    (mt/with-model-cleanup [:model/Field]
      (mt/with-temp [:model/Database {db-id :id}     {:name "test-db"}
                     :model/Table    {table-id :id}  {:db_id db-id :name "events" :schema "public"}
                     :model/Field    {parent-id :id} {:table_id table-id :name "outer"}]
        (let [field-id (serdes/*import-field-fk* ["test-db" "public" "events" "outer" "inner"])]
          (is (=? {:id        field-id
                   :name      "inner"
                   :parent_id parent-id
                   :active    false}
                  (t2/select-one :model/Field :id field-id)))
          (is (= 1 (t2/count :model/Field :table_id table-id :name "outer"))))))))
