(ns metabase.models.serialization.resolve.default-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.settings.models.setting.cache :as setting.cache]
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

(deftest import-database-fk-existing-test
  (testing "returns the existing database id when found"
    (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}]
      (is (= db-id (serdes/*import-database-fk* "test-db"))))))

(deftest import-database-fk-synthesizes-stub-database-test
  (testing "creates a stub database when the database doesn't exist"
    (mt/with-model-cleanup [:model/Database]
      (let [db-id (serdes/*import-database-fk* "does-not-exist")]
        (is (=? {:id      db-id
                 :name    "does-not-exist"
                 :engine  :postgres
                 :details {}
                 :is_stub true}
                (t2/select-one :model/Database :id db-id)))))))

(deftest import-table-fk-synthesizes-stub-database-test
  (testing "creates a stub database and an inactive table when the database doesn't exist"
    (mt/with-model-cleanup [:model/Database :model/Table]
      (let [table-id (serdes/*import-table-fk* ["does-not-exist" "public" "users"])
            table    (t2/select-one :model/Table :id table-id)]
        (is (=? {:name "users" :schema "public" :active false}
                table))
        (is (=? {:name "does-not-exist" :is_stub true}
                (t2/select-one :model/Database :id (:db_id table))))))))

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

(deftest export-database-fk-test
  (testing "returns the database name for an existing id"
    (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}]
      (is (= "test-db" (serdes/*export-database-fk* db-id)))))
  (testing "nil id returns nil"
    (is (nil? (serdes/*export-database-fk* nil))))
  (testing "unknown id returns nil"
    (is (nil? (serdes/*export-database-fk* Integer/MAX_VALUE)))))

(deftest export-table-fk-test
  (testing "returns [db-name schema table-name]"
    (mt/with-temp [:model/Database {db-id :id}    {:name "test-db"}
                   :model/Table    {table-id :id} {:db_id db-id :name "users" :schema "public"}]
      (is (= ["test-db" "public" "users"] (serdes/*export-table-fk* table-id)))))
  (testing "nil schema is preserved"
    (mt/with-temp [:model/Database {db-id :id}    {:name "test-db"}
                   :model/Table    {table-id :id} {:db_id db-id :name "schemaless" :schema nil}]
      (is (= ["test-db" nil "schemaless"] (serdes/*export-table-fk* table-id)))))
  (testing "nil id returns nil"
    (is (nil? (serdes/*export-table-fk* nil)))))

(deftest cached-export-database-fk-test
  (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}]
    (setting.cache/restore-cache!)
    (serdes/with-cache
      (t2/with-call-count [call-count]
        (is (= "test-db" (serdes/*export-database-fk* db-id)))
        (is (= "test-db" (serdes/*export-database-fk* db-id)))
        (testing "repeat lookups inside with-cache are served from the memoized resolver"
          (is (= 1 (call-count))))))))

(deftest cached-import-fk-keyed-does-not-memoize-a-missing-row-test
  (testing "A cached lookup that finds no row is not memoized, so a later lookup finds the row that was created since"
    (let [email "cached-import-missing-user@example.com"]
      (serdes/with-cache
        (is (nil? (serdes/*import-fk-keyed* email :model/User :email)))
        (mt/with-temp [:model/User {id :id} {:email email}]
          (is (= id (serdes/*import-fk-keyed* email :model/User :email))))))))

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
