(ns metabase-enterprise.replacement.source-check-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.source-check :as replacement.source-check]
   [metabase-enterprise.replacement.usages :as replacement.usages]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest same-source-returns-failure-test
  (testing "replacing a source with itself returns {:success false} with no errors or mappings"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}]
      (is (= {:success false}
             (replacement.source-check/check-replace-source
              [:table table-id] [:table table-id])))))
  (testing "same card source also returns {:success false}"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Card {card-id :id} {:database_id db-id}]
      (is (= {:success false}
             (replacement.source-check/check-replace-source
              [:card card-id] [:card card-id]))))))

(deftest database-mismatch-table-test
  (testing "table sources in different databases produce :database-mismatch and no column_mappings"
    (mt/with-temp [:model/Database {db1-id :id} {}
                   :model/Database {db2-id :id} {}
                   :model/Table {t1-id :id} {:db_id db1-id}
                   :model/Table {t2-id :id} {:db_id db2-id}
                   :model/Field _ {:table_id t1-id :name "col" :base_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "col" :base_type :type/Integer}]
      (let [result (replacement.source-check/check-replace-source
                    [:table t1-id] [:table t2-id])]
        (is (false? (:success result)))
        (is (= [:database-mismatch] (:errors result)))
        (is (nil? (:column_mappings result))
            "column_mappings should not be computed when databases differ")))))

(deftest database-mismatch-card-test
  (testing "card sources in different databases produce :database-mismatch"
    (mt/with-temp [:model/Database {db1-id :id} {}
                   :model/Database {db2-id :id} {}
                   :model/Card {c1-id :id} {:database_id db1-id}
                   :model/Card {c2-id :id} {:database_id db2-id}]
      (let [result (replacement.source-check/check-replace-source
                    [:card c1-id] [:card c2-id])]
        (is (false? (:success result)))
        (is (= [:database-mismatch] (:errors result)))
        (is (nil? (:column_mappings result)))))))

(deftest cycle-detected-test
  (testing "cycle detection when new source transitively uses old source"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Field _ {:table_id t1-id :name "id" :base_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer}]
      (with-redefs [replacement.usages/transitive-usages
                    (constantly [[:table t2-id]])]
        (let [result (replacement.source-check/check-replace-source
                      [:table t1-id] [:table t2-id])]
          (is (false? (:success result)))
          (is (some #{:cycle-detected} (:errors result))))))))

(deftest implicit-joins-with-incoming-fks-test
  (testing "table source with incoming FKs produces :incompatible-implicit-joins"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Table {t3-id :id} {:db_id db-id}
                   :model/Field {f1-id :id} {:table_id t1-id :name "id" :base_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer}
                   ;; FK from t3 pointing to a field in t1
                   :model/Field _ {:table_id t3-id :name "t1_fk" :base_type :type/Integer
                                   :semantic_type :type/FK :fk_target_field_id f1-id}]
      (let [result (replacement.source-check/check-replace-source
                    [:table t1-id] [:table t2-id])]
        (is (false? (:success result)))
        (is (some #{:incompatible-implicit-joins} (:errors result)))))))

(deftest no-implicit-joins-without-incoming-fks-test
  (testing "table source without incoming FKs does not produce :incompatible-implicit-joins"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Field _ {:table_id t1-id :name "id" :base_type :type/Integer
                                   :effective_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer
                                   :effective_type :type/Integer}]
      (let [result (replacement.source-check/check-replace-source
                    [:table t1-id] [:table t2-id])]
        (is (nil? (some #{:incompatible-implicit-joins} (:errors result))))))))

(deftest no-implicit-joins-for-card-source-test
  (testing "implicit joins check only applies to :table sources, not :card sources"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Field {f1-id :id} {:table_id t1-id :name "id" :base_type :type/Integer}
                   ;; FK from t2 pointing to t1
                   :model/Field _ {:table_id t2-id :name "t1_fk" :base_type :type/Integer
                                   :semantic_type :type/FK :fk_target_field_id f1-id}
                   :model/Card {c1-id :id} {:database_id db-id
                                            :result_metadata [{:name "id"
                                                               :base_type :type/Integer
                                                               :effective_type :type/Integer
                                                               :display_name "ID"
                                                               :field_ref [:field "id" {:base-type :type/Integer}]}]}
                   :model/Card {c2-id :id} {:database_id db-id
                                            :result_metadata [{:name "id"
                                                               :base_type :type/Integer
                                                               :effective_type :type/Integer
                                                               :display_name "ID"
                                                               :field_ref [:field "id" {:base-type :type/Integer}]}]}]
      (let [result (replacement.source-check/check-replace-source
                    [:card c1-id] [:card c2-id])]
        (is (nil? (some #{:incompatible-implicit-joins} (:errors result))))))))

(deftest no-implicit-joins-for-empty-table-test
  (testing "table with no fields: has-incoming-fks? returns false via not-empty nil branch"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}]
      (let [result (replacement.source-check/check-replace-source
                    [:table t1-id] [:table t2-id])]
        (is (true? (:success result)))
        (is (nil? (:errors result)))
        (is (nil? (:column_mappings result))
            "no column_mappings when both tables have no fields")))))

(deftest successful-replacement-test
  (testing "tables with matching columns produce a successful result with column_mappings"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Field _ {:table_id t1-id :name "id" :base_type :type/Integer
                                   :effective_type :type/Integer}
                   :model/Field _ {:table_id t1-id :name "name" :base_type :type/Text
                                   :effective_type :type/Text}
                   :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer
                                   :effective_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "name" :base_type :type/Text
                                   :effective_type :type/Text}]
      (let [result (replacement.source-check/check-replace-source
                    [:table t1-id] [:table t2-id])]
        (is (true? (:success result)))
        (is (nil? (:errors result)))
        (is (seq (:column_mappings result)))
        (doseq [m (:column_mappings result)]
          (is (:source m))
          (is (:target m)))))))

(deftest missing-column-in-target-test
  (testing "source column with no matching target causes failure via has-missing?"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Field _ {:table_id t1-id :name "id" :base_type :type/Integer}
                   :model/Field _ {:table_id t1-id :name "extra" :base_type :type/Text}
                   :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer}]
      (let [result (replacement.source-check/check-replace-source
                    [:table t1-id] [:table t2-id])]
        (is (false? (:success result)))
        (is (seq (:column_mappings result)))
        (is (some (fn [m] (and (:source m) (nil? (:target m))))
                  (:column_mappings result))
            "should have a mapping with source but no target for the missing column")))))

(deftest column-type-mismatch-test
  (testing "columns with same name but different effective types produce column-level errors"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Field _ {:table_id t1-id :name "col" :base_type :type/Integer
                                   :effective_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "col" :base_type :type/Text
                                   :effective_type :type/Text}]
      (let [result (replacement.source-check/check-replace-source
                    [:table t1-id] [:table t2-id])]
        (is (false? (:success result)))
        (is (seq (:column_mappings result)))
        (is (some (fn [m] (seq (:errors m)))
                  (:column_mappings result))
            "should have column-level errors for type mismatches")))))

(deftest extra-column-in-target-test
  (testing "extra columns in target (not in source) do not cause failure"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Field _ {:table_id t1-id :name "id" :base_type :type/Integer
                                   :effective_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer
                                   :effective_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "extra" :base_type :type/Text
                                   :effective_type :type/Text}]
      (let [result (replacement.source-check/check-replace-source
                    [:table t1-id] [:table t2-id])]
        (is (true? (:success result)))
        (is (seq (:column_mappings result)))
        (is (some (fn [m] (and (nil? (:source m)) (:target m)))
                  (:column_mappings result))
            "extra target column appears as a mapping with target only")))))

(deftest multiple-errors-test
  (testing "cycle + implicit-joins errors are both reported"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Table {t3-id :id} {:db_id db-id}
                   :model/Field {f1-id :id} {:table_id t1-id :name "id" :base_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer}
                   ;; FK from t3 to t1 triggers implicit-joins
                   :model/Field _ {:table_id t3-id :name "t1_fk" :base_type :type/Integer
                                   :semantic_type :type/FK :fk_target_field_id f1-id}]
      (with-redefs [replacement.usages/transitive-usages
                    (constantly [[:table t2-id]])]
        (let [result (replacement.source-check/check-replace-source
                      [:table t1-id] [:table t2-id])]
          (is (false? (:success result)))
          (is (some #{:cycle-detected} (:errors result)))
          (is (some #{:incompatible-implicit-joins} (:errors result))))))))

(deftest database-mismatch-with-implicit-joins-test
  (testing "db-mismatch and implicit-joins errors are both reported, still no column_mappings"
    (mt/with-temp [:model/Database {db1-id :id} {}
                   :model/Database {db2-id :id} {}
                   :model/Table {t1-id :id} {:db_id db1-id}
                   :model/Table {t2-id :id} {:db_id db2-id}
                   :model/Table {t3-id :id} {:db_id db1-id}
                   :model/Field {f1-id :id} {:table_id t1-id :name "id" :base_type :type/Integer}
                   :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer}
                   ;; FK from t3 to t1
                   :model/Field _ {:table_id t3-id :name "t1_fk" :base_type :type/Integer
                                   :semantic_type :type/FK :fk_target_field_id f1-id}]
      (let [result (replacement.source-check/check-replace-source
                    [:table t1-id] [:table t2-id])]
        (is (false? (:success result)))
        (is (some #{:database-mismatch} (:errors result)))
        (is (some #{:incompatible-implicit-joins} (:errors result)))
        (is (nil? (:column_mappings result))
            "column_mappings still not computed when databases differ")))))

(deftest format-column-structure-test
  (testing "column_mappings entries have the expected structure from format-column"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t1-id :id} {:db_id db-id}
                   :model/Table {t2-id :id} {:db_id db-id}
                   :model/Field _ {:table_id t1-id :name "test_col" :base_type :type/Integer
                                   :effective_type :type/Integer :semantic_type :type/PK
                                   :display_name "Test Column"}
                   :model/Field _ {:table_id t2-id :name "test_col" :base_type :type/Integer
                                   :effective_type :type/Integer :semantic_type :type/PK
                                   :display_name "Test Column"}]
      (let [result  (replacement.source-check/check-replace-source
                     [:table t1-id] [:table t2-id])
            mapping (first (:column_mappings result))]
        (is (true? (:success result)))
        (is (some? mapping))
        (testing "source column structure"
          (let [src (:source mapping)]
            (is (integer? (:id src)))
            (is (string? (:name src)))
            (is (string? (:display_name src)))
            (is (string? (:base_type src)))
            (is (string? (:effective_type src)))))
        (testing "target column structure"
          (let [tgt (:target mapping)]
            (is (integer? (:id tgt)))
            (is (string? (:name tgt)))
            (is (string? (:display_name tgt)))
            (is (string? (:base_type tgt)))
            (is (string? (:effective_type tgt)))))))))

(deftest card-same-database-test
  (testing "card sources in the same database do not produce :database-mismatch"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Card {c1-id :id} {:database_id db-id
                                            :result_metadata [{:name "id"
                                                               :base_type :type/Integer
                                                               :effective_type :type/Integer
                                                               :display_name "ID"
                                                               :field_ref [:field "id" {:base-type :type/Integer}]}]}
                   :model/Card {c2-id :id} {:database_id db-id
                                            :result_metadata [{:name "id"
                                                               :base_type :type/Integer
                                                               :effective_type :type/Integer
                                                               :display_name "ID"
                                                               :field_ref [:field "id" {:base-type :type/Integer}]}]}]
      (let [result (replacement.source-check/check-replace-source
                    [:card c1-id] [:card c2-id])]
        (is (true? (:success result)))
        (is (nil? (some #{:database-mismatch} (:errors result))))))))
