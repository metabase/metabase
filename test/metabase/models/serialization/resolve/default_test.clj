(ns metabase.models.serialization.resolve.default-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.default :as resolve.default]
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

(defn- query-count [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(deftest export-fields-query-count-test
  (testing "exporting nested Fields in bulk takes one query per nesting level, whatever their number"
    (mt/with-temp [:model/Database {db-id :id}    {:name "test-db"}
                   :model/Table    {table-id :id} {:db_id db-id :name "events" :schema "public"}
                   :model/Field    {outer-id :id} {:table_id table-id :name "outer"}]
      (let [field-ids (vec (for [i (range 30)]
                             (t2/insert-returning-pk! :model/Field {:table_id      table-id
                                                                    :parent_id     outer-id
                                                                    :name          (str "inner_" i)
                                                                    :base_type     :type/Text
                                                                    :database_type "TEXT"})))
            export    #(resolve/export-fields resolve.default/default-export-resolver %)]
        (is (= {(first field-ids) ["test-db" "public" "events" "outer" "inner_0"]
                (last field-ids)  ["test-db" "public" "events" "outer" "inner_29"]}
               (select-keys (export field-ids) [(first field-ids) (last field-ids)])))
        (is (= (query-count #(export (take 2 field-ids)))
               (query-count #(export field-ids))))))))

(deftest import-fields-bulk-test
  (testing "importing Field paths in bulk finds existing Fields and creates each missing node once"
    (mt/with-model-cleanup [:model/Field]
      (mt/with-temp [:model/Database {db-id :id}    {:name "test-db"}
                     :model/Table    {table-id :id} {:db_id db-id :name "events" :schema "public"}
                     :model/Field    {outer-id :id} {:table_id table-id :name "outer"}]
        (let [paths    [["test-db" "public" "events" "outer"]
                        ["test-db" "public" "events" "outer" "x"]
                        ["test-db" "public" "events" "outer" "y"]
                        ["test-db" "public" "events" "fresh" "z"]]
              resolved (resolve/import-fields resolve.default/default-import-resolver paths)]
          (is (= outer-id (get resolved (first paths))))
          (is (= #{outer-id} (t2/select-fn-set :parent_id :model/Field :id [:in (map resolved (take 2 (rest paths)))])))
          (is (= 1 (t2/count :model/Field :table_id table-id :name "fresh")))
          (testing "and resolves the same paths again without creating anything"
            (is (= resolved (resolve/import-fields resolve.default/default-import-resolver paths)))
            (is (= 5 (t2/count :model/Field :table_id table-id))))
          (testing "with a query count independent of the number of paths"
            (is (= (query-count #(resolve/import-fields resolve.default/default-import-resolver (take 2 paths)))
                   (query-count #(resolve/import-fields resolve.default/default-import-resolver paths))))))))))

(deftest export-fks-bulk-test
  (testing "exporting FKs in bulk leaves out missing targets, and the single lookup throws for them"
    (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {}]
      (is (= {coll-id coll-eid}
             (resolve/export-fks resolve.default/default-export-resolver :model/Collection [coll-id Integer/MAX_VALUE])))
      (is (=? {:skip true :metabase.models.serialization/type :target-not-found}
              (try (serdes/*export-fk* Integer/MAX_VALUE :model/Collection)
                   nil
                   (catch clojure.lang.ExceptionInfo e (ex-data e))))))))

(deftest export-table-fk-missing-test
  (testing "exporting missing Table throws target-not-found error"
    (is (=? {:skip true :metabase.models.serialization/type :target-not-found}
            (try (serdes/*export-table-fk* Integer/MAX_VALUE)
                 nil
                 (catch clojure.lang.ExceptionInfo e (ex-data e)))))))

(deftest lenient-import-fk-test
  (testing "lenient resolver resolves missing FK target to nil, and strict one throws"
    (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {}]
      (let [missing "aaaaaaaaaaaaaaaaaaaaa"]
        (is (= {coll-eid coll-id missing nil}
               (resolve/import-fks resolve.default/lenient-import-resolver :model/Collection [coll-eid missing])))
        (is (=? {:metabase.models.serialization/type :target-not-found}
                (try (resolve/import-fk resolve.default/default-import-resolver missing :model/Collection)
                     nil
                     (catch clojure.lang.ExceptionInfo e (ex-data e)))))))))
