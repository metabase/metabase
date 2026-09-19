(ns metabase.sync.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.db :as sync.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
    ;; `schema+table+names` is deliberately unmarked (rubric rule 5: it can be empty, and `[:composite ...]` is a
    ;; known limit of the lint). HoneySQL already binds each element of a `[:composite ...]` `:in` as a parameter,
    ;; so a SQL-looking triple still matches nothing.
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

(deftest ^:synchronized transformed-column-stays-a-kv-arg-test
  (testing ":semantic_type is a kv-arg so Toucan's transform runs and the type binds as a parameter"
    ;; As a `{:where [:= :semantic_type :type/Name]}` map the transform is skipped and HoneySQL formats the keyword
    ;; as an identifier -- `semantic_type = type."Name"` -- which matches nothing. See the rubric's transform section.
    (let [[sql & params] (t2/compile (t2/count :model/Field
                                               :table_id (long 1)
                                               :active true
                                               :visibility_type [:not-in ["sensitive" "retired"]]
                                               :semantic_type :type/Name))]
      (is (contains? (set params) "type/Name"))
      (is (not (re-find #"(?i)type\.\"?Name" sql)))))
  (mt/with-temp [:model/Database db {:name "vdb"}
                 :model/Table    t1 {:db_id (:id db) :name "orders" :schema "public" :active true}
                 :model/Field    _  {:table_id (:id t1) :name "name" :active true :semantic_type :type/Name}
                 :model/Field    _  {:table_id (:id t1) :name "total" :active true}]
    (is (= 1 (sync.db/name-field-count-for-table (:id t1))))))

(deftest ^:synchronized field-values-kv-arg-path-test
  (testing "the FieldValues reads stay kv-args so `define-before-select` still adds the hash_key predicate"
    (mt/with-temp [:model/Database    db {:name "vdb"}
                   :model/Table       t1 {:db_id (:id db) :name "orders" :schema "public" :active true}
                   :model/Field       f1 {:table_id (:id t1) :name "total" :active true}
                   :model/FieldValues _  {:field_id (:id f1) :type :full :values ["a" "b"]}]
      (is (true? (sync.db/field-values-exist? (:id f1))))
      ;; `:full` FieldValues have a nil hash_key, so the advanced-only count excludes them.
      (is (zero? (sync.db/advanced-field-values-count-before (:id f1) #{:linked-filter} 0))))))

(deftest update!-conditions-maps-filter-rather-than-naming-a-where-column
  (testing "update-tables! updates only the tables it is given"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {a :id} {:db_id db-id :name "A" :active true}
                   :model/Table {b :id} {:db_id db-id :name "B" :active true}]
      (is (= 1 (sync.db/update-tables! [a] {:active false})))
      (is (false? (t2/select-one-fn :active :model/Table :id a)))
      (is (true? (t2/select-one-fn :active :model/Table :id b)))))
  (testing "set-fields-fingerprint-version! updates only the fields it is given"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t-id :id} {:db_id db-id}
                   :model/Field {a :id} {:table_id t-id :name "fa" :fingerprint_version 1}
                   :model/Field {b :id} {:table_id t-id :name "fb" :fingerprint_version 1}]
      (is (= 1 (sync.db/set-fields-fingerprint-version! [a] 3)))
      (is (= 3 (t2/select-one-fn :fingerprint_version :model/Field :id a)))
      (is (= 1 (t2/select-one-fn :fingerprint_version :model/Field :id b))))))

(deftest ^:synchronized bound-conditional-in-clauses-test
  (testing "the seq-guarded :schema/:name narrowing binds its collections"
    (mt/with-temp [:model/Database db {:name "vdb"}
                   :model/Table    t1 {:db_id (:id db) :name "orders" :schema "public" :active true}]
      (is (= [(:id t1)]
             (into [] (map :id) (sync.db/sync-tables-reducible (:id db) ["public"] ["orders"]))))
      (testing "a schema or table name that looks like SQL matches nothing"
        (is (= [] (into [] (map :id) (sync.db/sync-tables-reducible (:id db) [sql-injection-attempt] nil))))
        (is (= [] (into [] (map :id) (sync.db/sync-tables-reducible (:id db) nil [sql-injection-attempt])))))
      (testing "an empty narrowing drops the clause rather than marking an empty collection"
        (is (= [(:id t1)]
               (into [] (map :id) (sync.db/sync-tables-reducible (:id db) [] []))))))))

(deftest transformed-in-collection-stays-unmarked-test
  (testing "marking a transformed column's `[:in coll]` would be eaten by the transform"
    ;; `:model/FieldValues` `:type` is `mi/transform-keyword`. In kv-arg position the transform maps
    ;; over whatever sits in the value slot, so it already binds each element -- and it would map
    ;; over a marker vector too, binding the literal string "auto/param" as a parameter. This pins
    ;; why `advanced-field-values-count-before` leaves `types` unmarked.
    (let [[sql & params] (t2/compile (t2/count :model/FieldValues
                                               :field_id (long 1)
                                               :type [:in #{:linked-filter :sandbox}]))]
      (is (not (re-find #"linked-filter" sql))
          "each type binds as a parameter rather than compiling into the statement")
      (is (= #{"linked-filter" "sandbox"} (set (remove number? params)))))))

(deftest ^:synchronized mark-fk-statement-emits-no-param-function-test
  (testing "the FK statement's values bind as parameters rather than compiling to a PARAM() call"
    ;; `mark-fk-statement` hands its query map straight to `honey.sql/format`, not to the Toucan
    ;; pipeline, so `metabase.app-db.value-guard` never lifts a marker there -- `[:auto/param v]`
    ;; compiles to the nonexistent function call `PARAM(?)`. The values are left unmarked because
    ;; HoneySQL binds a plain string on its own.
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {t-id :id} {:db_id db-id :name "orders" :schema "public" :active true}
                   :model/Field    {f-id :id} {:table_id t-id :name "user_id" :active true}
                   :model/Table    {p-id :id} {:db_id db-id :name "people" :schema "public" :active true}
                   :model/Field    _          {:table_id p-id :name "id" :active true}]
      (is (= 1 (sync.db/mark-fk! db-id "public" "orders" "user_id" "public" "people" "id")))
      (is (= (t2/select-one-fn :fk_target_field_id :model/Field :id f-id)
             (t2/select-one-pk :model/Field :table_id p-id :name "id")))
      (testing "a schema or column name that looks like SQL matches nothing"
        (is (zero? (sync.db/mark-fk! db-id "public" "orders" sql-injection-attempt
                                     "public" "people" "id")))))))

(deftest ^:synchronized update-field-by-name!-binds-its-conditions-map-test
  (testing "the conditions map filters on the name it is given rather than interpolating it"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {t-id :id} {:db_id db-id}
                   :model/Field    {a :id}    {:table_id t-id :name "total" :description nil}
                   :model/Field    {b :id}    {:table_id t-id :name "other" :description nil}]
      (is (= 1 (sync.db/update-field-by-name! t-id "total" {:description "d"})))
      (is (= "d" (t2/select-one-fn :description :model/Field :id a)))
      (is (nil? (t2/select-one-fn :description :model/Field :id b)))
      (testing "a field name that looks like SQL matches nothing"
        (is (zero? (sync.db/update-field-by-name! t-id sql-injection-attempt {:description "x"})))))))
