(ns metabase.sync.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.db :as sync.db]
   [metabase.test :as mt]))

(def ^:private sql-injection-attempt
  "A value shaped like SQL. Bound as a parameter it matches nothing; interpolated it would match every row."
  "orders' OR '1'='1")

(deftest ^:synchronized bound-string-values-test
  (mt/with-temp [:model/Database db {:name "vdb"}
                 :model/Table    t1 {:db_id (:id db) :name "orders" :schema "public" :active true}]
    (testing "a marked string still matches the row it names"
      (is (= (:id t1) (:id (sync.db/table-by-name (:id db) "orders"))))
      (is (= (:id t1) (:id (sync.db/table-by-schema-and-name (:id db) "public" "orders"))))
      (is (= (:id t1) (sync.db/active-table-id-by-name (:id db) "orders")))
      (is (= [(:id t1)]
             (mapv :id (sync.db/sync-tables-by-lower-name-and-schema (:id db) "orders" "public")))))
    (testing "a value that looks like SQL matches nothing"
      (is (nil? (sync.db/table-by-name (:id db) sql-injection-attempt)))
      (is (nil? (sync.db/table-by-schema-and-name (:id db) "public" sql-injection-attempt)))
      (is (nil? (sync.db/active-table-id-by-name (:id db) sql-injection-attempt)))
      (is (empty? (sync.db/sync-tables-by-lower-name-and-schema (:id db) sql-injection-attempt "public")))
      (is (empty? (sync.db/tables-by-name [:model/Table :id] (:id db) [sql-injection-attempt]))))
    (testing "a marked nil is still IS NULL rather than = ?"
      (is (nil? (sync.db/table-by-schema-and-name (:id db) nil "orders"))))))

(deftest ^:synchronized bound-field-values-test
  (mt/with-temp [:model/Database db {:name "vdb"}
                 :model/Table    t1 {:db_id (:id db) :name "orders" :schema "public" :active true}
                 :model/Field    f1 {:table_id (:id t1) :name "total" :active true}]
    (testing "a marked field name still matches the field it names"
      (is (= [(:id f1)] (sync.db/top-level-field-ids-by-name (:id t1) ["total"]))))
    (testing "a field name that looks like SQL matches nothing"
      (is (empty? (sync.db/top-level-field-ids-by-name (:id t1) [sql-injection-attempt]))))
    ;; `schema+table+names` is deliberately unmarked -- see the comment on the function. HoneySQL already binds each
    ;; element of a `[:composite ...]` `:in` as a parameter, so a SQL-looking triple still matches nothing.
    (testing "the composite lookup binds its triples"
      (is (= [(:id f1)]
             (into [] (map :id) (sync.db/top-level-field-ids-by-schema-table-and-name-reducible
                                 (:id db) [["public" "orders" "total"]]))))
      (is (= []
             (into [] (sync.db/top-level-field-ids-by-schema-table-and-name-reducible
                       (:id db) [["public" "orders" sql-injection-attempt]])))))
    (testing "unmarked id-coerced queries still run"
      (is (empty? (sync.db/incomplete-analysis-fields-for-table (:id t1) 5)))
      (is (empty? (sync.db/inactive-fields-by-lower-name (:id t1) nil ["total"])))
      (is (= 1 (sync.db/active-table-count (:id db)))))))

(deftest ^:synchronized field-values-kv-arg-path-test
  (testing "the FieldValues reads stay kv-args so `define-before-select` still adds the hash_key predicate"
    (mt/with-temp [:model/Database    db {:name "vdb"}
                   :model/Table       t1 {:db_id (:id db) :name "orders" :schema "public" :active true}
                   :model/Field       f1 {:table_id (:id t1) :name "total" :active true}
                   :model/FieldValues _  {:field_id (:id f1) :type :full :values ["a" "b"]}]
      (is (true? (sync.db/field-values-exist? (:id f1))))
      ;; `:full` FieldValues have a nil hash_key, so the advanced-only count excludes them.
      (is (zero? (sync.db/advanced-field-values-count-before (:id f1) #{:linked-filter} 0))))))
