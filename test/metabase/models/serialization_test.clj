(ns metabase.models.serialization-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel drop-mbql-5-uuids-on-export-test
  (binding [serdes/*export-field-fk* (constantly ::field-id)]
    (is (= [:field {} :metabase.models.serialization-test/field-id]
           (#'serdes/export-mbql-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1])))
    (binding [serdes/*required-lib-uuids-for-export* #{"00000000-0000-0000-0000-000000000001"}]
      (is (= [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} :metabase.models.serialization-test/field-id]
             (#'serdes/export-mbql-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1])))
      (is (= [:field {} :metabase.models.serialization-test/field-id]
             (#'serdes/export-mbql-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 1]))))))

(deftest ^:parallel drop-mbql-5-uuids-on-export-test-2
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/filter (lib/= (meta/field-metadata :venues :id) 1))
                  (lib/aggregate (-> (lib/count)
                                     (lib/update-options assoc :lib/uuid "00000000-0000-0000-0000-000000000000")))
                  (as-> $query (lib/order-by $query (first (lib/aggregations-metadata $query)))))]
    (is (= #{"00000000-0000-0000-0000-000000000000"}
           (#'serdes/collect-required-lib-uuids query)))
    (binding [serdes/*export-database-fk* (constantly "DATABASE")
              serdes/*export-table-fk*    (constantly ["DATABASE" "SCHEMA" "TABLE"])
              serdes/*export-field-fk*    (constantly ["DATABASE" "SCHEMA" "TABLE" "FIELD"])]
      (is (= {:lib/type :mbql/query
              :database "DATABASE"
              :stages   [{:lib/type     :mbql.stage/mbql
                          :source-table ["DATABASE" "SCHEMA" "TABLE"]
                          :filters      [[:=
                                          {}
                                          [:field
                                           {:effective-type :type/BigInteger, :base-type :type/BigInteger}
                                           ["DATABASE" "SCHEMA" "TABLE" "FIELD"]]
                                          1]]
                          :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
                          :order-by     [[:asc
                                          {}
                                          [:aggregation
                                           {:base-type       :type/Integer
                                            :effective-type  :type/Integer
                                            :lib/source-name "count"}
                                           "00000000-0000-0000-0000-000000000000"]]]}]}
             (serdes/export-mbql query))))))

(deftest ^:parallel hydrate-mbql-5-uuids-on-import-test
  ;; when read out of the YAML, map keys should get keywordized but not other strings
  (let [query {:lib/type "mbql/query"
               :database "DATABASE"
               :stages   [{:lib/type     "mbql.stage/mbql"
                           :source-table ["DATABASE" "SCHEMA" "TABLE"]
                           :filters      [["="
                                           {}
                                           ["field"
                                            {:effective-type "type/BigInteger", :base-type "type/BigInteger"}
                                            ["DATABASE" "SCHEMA" "TABLE" "FIELD"]]
                                           1]]
                           :aggregation  [["count" {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
                           :order-by     [["asc"
                                           {}
                                           [:aggregation {:base-type       "type/Integer"
                                                          :effective-type  "type/Integer"
                                                          :lib/source-name "count"}
                                            "00000000-0000-0000-0000-000000000000"]]]}]}]
    (binding [serdes/*import-database-fk* (constantly 1)
              serdes/*import-table-fk*    (constantly 2)
              serdes/*import-field-fk*    (constantly 3)]
      (is (=? {:lib/type :mbql/query
               :database 1
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table 2
                           :filters      [[:=
                                           {:lib/uuid string?}
                                           [:field
                                            {:lib/uuid       string?
                                             :effective-type :type/BigInteger
                                             :base-type      :type/BigInteger}
                                            3]
                                           1]]
                           :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
                           :order-by     [[:asc
                                           {:lib/uuid string?}
                                           [:aggregation
                                            {:base-type       :type/Integer
                                             :effective-type  :type/Integer
                                             :lib/source-name "count"}
                                            "00000000-0000-0000-0000-000000000000"]]]}]}
              (serdes/import-mbql query))))))

(deftest ^:parallel hydrate-mbql-5-uuids-on-import-test-2
  (binding [serdes/*import-field-fk* (constantly 3)]
    (are [x expected] (=? expected
                          (serdes/import-mbql x))
      ["field" {} ["DB" "SCHEMA" "TABLE" "FIELD"]]
      [:field {:lib/uuid string?} 3]

      ["dimension" ["field" ["DB" "SCHEMA" "TABLE" "FIELD"] {:source-field ["DB" "SCHEMA" "TABLE" "FIELD2"]}]]
      [:dimension [:field 3 {:source-field 3}]])))

(deftest ^:parallel export-mbql-3-field-id-ref-in-viz-settings-test
  (testing "Allegedly viz settings can still contain MBQL 3 `:field-id` refs, make sure we export them properly"
    (binding [serdes/*export-field-fk* (constantly ["A" "B" "C" "D"])]
      (are [clause expected] (= expected
                                (#'serdes/export-mbql clause))

        [:field-id 1]
        [:field-id ["A" "B" "C" "D"]]

        ["field-id" 1]
        [:field-id ["A" "B" "C" "D"]]

        [:fk-> [:field-id 1] [:field-id 2]]
        [:fk-> [:field-id ["A" "B" "C" "D"]] [:field-id ["A" "B" "C" "D"]]]

        ["fk->" ["field-id" 1] ["field-id" 2]]
        ["fk->" [:field-id ["A" "B" "C" "D"]] [:field-id ["A" "B" "C" "D"]]]))))

(deftest ^:parallel export-visualization-settings-test
  (binding [serdes/*export-field-fk* (constantly ["A" "B" "C" "D"])
            serdes/*export-fk*       (fn [id model]
                                       (format "%s___%d" (name model) id))]
    (is (= {:column_settings
            {"[\"ref\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],null]]"
             {:column_title "Locus"
              :click_behavior
              {:type     "link"
               :linkType "question"
               :targetId "Card___1"
               :parameterMapping
               {"[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                {:id     "[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                 :source {:type "column", :id "Category_ID", :name "Category ID"}
                 :target {:type      "dimension"
                          :id        "[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                          :dimension [:dimension [:field ["A" "B" "C" "D"] {:source-field ["A" "B" "C" "D"]}]]}}}}}}}
           (serdes/export-visualization-settings
            {:column_settings
             {"[\"ref\",[\"field\",54,null]]"
              {:column_title "Locus"
               :click_behavior
               {:type     "link"
                :linkType "question"
                :targetId 1
                :parameterMapping
                {(keyword "[\"dimension\",[\"field\",54,{\"source-field\":53}]]")
                 {:id     "[\"dimension\",[\"field\",54,{\"source-field\":53}]]"
                  :source {:type "column", :id "Category_ID", :name "Category ID"}
                  :target {:type      "dimension"
                           :id        "[\"dimension\",[\"field\",54,{\"source-field\":53}]]"
                           :dimension ["dimension" [:field 54 {:source-field 53}]]}}}}}}})))))

(deftest ^:parallel import-viz-settings-test
  (binding [serdes/*import-field-fk* (constantly 3)]
    (is (= {:column_settings
            {"[\"ref\",[\"field\",3,null]]"
             {:click_behavior
              {:parameterMapping
               {"[\"dimension\",[\"field\",3,{\"source-field\":3}]]"
                {:id     "[\"dimension\",[\"field\",3,{\"source-field\":3}]]"
                 :target {:type      "dimension"
                          :dimension [:dimension [:field 3 {:source-field 3}]]
                          :id        "[\"dimension\",[\"field\",3,{\"source-field\":3}]]"}}}}}}}
           (serdes/import-visualization-settings
            {:column_settings
             {"[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],null]]"
              {:click_behavior
               {:parameterMapping
                {"[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"
                 {:id     "[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"
                  :target {:type      "dimension"
                           :dimension [:dimension
                                       [:field
                                        ["my-db" nil "orders" "invoice"]
                                        {:source-field ["my-db" nil "orders" "subtotal"]}]]
                           :id        "[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"}}}}}}})))))

(deftest ^:parallel export-import-template-tag-table-id-test
  (testing "template tags of type :table serialize their :table-id as a portable tuple"
    (let [template-tags {"table" {:id           "abc"
                                  :name         "table"
                                  :display-name "Table"
                                  :type         :table
                                  :table-id     42}}
          exported      (binding [serdes/*export-table-fk* (constantly ["DB" "SCHEMA" "TABLE"])]
                          (serdes/export-mbql template-tags))]
      (is (= {"table" {:id           "abc"
                       :name         "table"
                       :display-name "Table"
                       :type         :table
                       :table-id     ["DB" "SCHEMA" "TABLE"]}}
             exported))
      (is (= 42
             (binding [serdes/*import-table-fk* (constantly 42)]
               (get-in (#'serdes/import-mbql* exported) ["table" :table-id])))))))

(deftest ^:parallel template-tag-table-id-deps-test
  (testing "template tag :table-id contributes a Table dependency"
    (is (contains? (#'serdes/mbql-deps-map {:table-id ["DB" "SCHEMA" "TABLE"]})
                   [{:model "Database" :id "DB"}
                    {:model "Schema" :id "SCHEMA"}
                    {:model "Table" :id "TABLE"}]))))

(deftest ^:parallel export-parameters-test
  (binding [serdes/*export-fk*       (fn [id model]
                                       (format "%s___%d" (name model) id))
            serdes/*export-field-fk* (constantly ["DATABASE" "SCHEMA" "TABLE" "FIELD"])]
    (is (= [{:id                   "abc"
             :name                 "CATEGORY"
             :position             0
             :type                 :category
             :values_source_config {:card_id     "Card___1"
                                    :value_field [:field ["DATABASE" "SCHEMA" "TABLE" "FIELD"] nil]}
             :values_source_type   :card}]
           (serdes/export-parameters [{:id                   "abc"
                                       :type                 :category
                                       :name                 "CATEGORY"
                                       :values_source_type   :card
                                       :values_source_config {:card_id 1, :value_field [:field 53 nil]}
                                       :position             0}])))))

;;;; ## Batch FK resolvers
;;;;
;;;; Each `*export-X-fk*` is now a singleton overlay over `*export-X-fks*` (plural). The plural
;;;; primary uses a partition-map over `:nil`/`:hit`/`:miss` to short-circuit nils, serve hits
;;;; from the dynamic cache atom, and batch misses into a single `WHERE id IN (...)` SELECT. Tests
;;;; cover order preservation, nil passthrough, recursion across the three layers (field → table
;;;; → database), cross-call cache sharing, and the actual SQL-query reduction.

(deftest export-database-fks-batch-test
  (mt/with-temp [:model/Database {db1 :id} {:name "alpha"}
                 :model/Database {db2 :id} {:name "beta"}]
    (testing "order-preserving, nil passthrough, deduped cache writes"
      (serdes/with-cache
        (let [out (serdes/*export-database-fks* [db1 nil db2 db1 nil])]
          (is (= ["alpha" nil "beta" "alpha" nil] out))
          (is (= {db1 "alpha" db2 "beta"} @serdes/*database-fk-cache*)))))
    (testing "singleton overlay shares the same cache"
      (serdes/with-cache
        (t2/with-call-count [qc]
          (is (= "alpha" (serdes/*export-database-fk* db1)))
          (is (= "beta"  (serdes/*export-database-fk* db2)))
          ;; Two singleton calls = two batch invocations of one element each = two SELECTs
          (let [after-misses (qc)]
            (is (= "alpha" (serdes/*export-database-fk* db1)))
            (is (= "alpha" (serdes/*export-database-fk* db1)))
            ;; Repeat calls hit the cache: zero new queries
            (is (= after-misses (qc)))))))))

(deftest export-table-fks-batch-test
  (mt/with-temp [:model/Database {db :id} {:name "things"}
                 :model/Table {t1 :id} {:db_id db :name "alpha" :schema "public"}
                 :model/Table {t2 :id} {:db_id db :name "beta"  :schema "public"}
                 :model/Table {t3 :id} {:db_id db :name "gamma" :schema nil}]
    (testing "batch resolves tables and recursively batches their database"
      (serdes/with-cache
        (t2/with-call-count [qc]
          (let [out (serdes/*export-table-fks* [t1 nil t2 t3 t1])]
            (is (= [["things" "public" "alpha"]
                    nil
                    ["things" "public" "beta"]
                    ["things" nil     "gamma"]
                    ["things" "public" "alpha"]]
                   out))
            ;; one SELECT for the 3 distinct tables + one SELECT for the 1 distinct database = 2
            (is (= 2 (qc))))
          ;; second call with overlapping ids: zero queries (all hits)
          (let [before (qc)]
            (is (= [["things" "public" "alpha"] ["things" nil "gamma"]]
                   (serdes/*export-table-fks* [t1 t3])))
            (is (= before (qc)))))))))

(deftest export-field-fks-batch-test
  (mt/with-temp [:model/Database {db :id} {:name "things"}
                 :model/Table {tbl :id} {:db_id db :name "alpha" :schema "public"}
                 :model/Field {f1 :id} {:table_id tbl :name "id"   :base_type :type/Integer}
                 :model/Field {f2 :id} {:table_id tbl :name "name" :base_type :type/Text}
                 :model/Field {f3 :id} {:table_id tbl :name "qty"  :base_type :type/Integer}]
    (testing "field batch chains: 1 SELECT fields + 1 SELECT tables + 1 SELECT databases = 3"
      (serdes/with-cache
        (t2/with-call-count [qc]
          (let [out (serdes/*export-field-fks* [f1 nil f2 f3 f1])]
            (is (= [["things" "public" "alpha" "id"]
                    nil
                    ["things" "public" "alpha" "name"]
                    ["things" "public" "alpha" "qty"]
                    ["things" "public" "alpha" "id"]]
                   out))
            (is (= 3 (qc))))
          (testing "all three caches populated"
            (is (= #{f1 f2 f3} (set (keys @serdes/*field-fk-cache*))))
            (is (= #{tbl}      (set (keys @serdes/*table-fk-cache*))))
            (is (= #{db}       (set (keys @serdes/*database-fk-cache*)))))
          (testing "follow-up singleton call is a pure cache hit (no queries)"
            (let [before (qc)]
              (is (= ["things" "public" "alpha" "name"] (serdes/*export-field-fk* f2)))
              (is (= before (qc))))))))))

(deftest fks-batch-cross-table-test
  (testing "fields spanning multiple tables — one SELECT per layer regardless of fanout"
    (mt/with-temp [:model/Database {db :id} {:name "things"}
                   :model/Table {t1 :id} {:db_id db :name "a" :schema "public"}
                   :model/Table {t2 :id} {:db_id db :name "b" :schema "public"}
                   :model/Table {t3 :id} {:db_id db :name "c" :schema "public"}
                   :model/Field {f1 :id} {:table_id t1 :name "f1" :base_type :type/Integer}
                   :model/Field {f2 :id} {:table_id t2 :name "f2" :base_type :type/Integer}
                   :model/Field {f3 :id} {:table_id t3 :name "f3" :base_type :type/Integer}]
      (serdes/with-cache
        (t2/with-call-count [qc]
          (is (= [["things" "public" "a" "f1"]
                  ["things" "public" "b" "f2"]
                  ["things" "public" "c" "f3"]]
                 (serdes/*export-field-fks* [f1 f2 f3])))
          ;; 3 fields across 3 tables across 1 db = 3 SELECTs total (not 9)
          (is (= 3 (qc))))))))

(deftest fks-without-with-cache-test
  (testing "outside `with-cache` the batch primaries still work — they just don't share state"
    (mt/with-temp [:model/Database {db :id} {:name "thing"}]
      ;; No `with-cache` wrapping. The cache atoms are nil → no cross-call dedup, but the
      ;; in-batch dedup (via `distinct` before SELECT) still applies.
      (is (= ["thing" "thing" nil] (serdes/*export-database-fks* [db db nil])))
      (is (nil? serdes/*database-fk-cache*)))))

(deftest export-mbql-batch-shape-preservation-test
  (testing "Layerwise batch produces the same output as pointwise export-mbql, tree by tree"
    (mt/with-temp [:model/Database {db :id} {:name "thing"}
                   :model/Table {t1 :id} {:db_id db :name "alpha" :schema "public"}
                   :model/Table {t2 :id} {:db_id db :name "beta"  :schema "public"}
                   :model/Field {f1 :id} {:table_id t1 :name "a" :base_type :type/Integer}
                   :model/Field {f2 :id} {:table_id t1 :name "b" :base_type :type/Integer}
                   :model/Field {f3 :id} {:table_id t2 :name "c" :base_type :type/Integer}]
      (let [trees [{:lib/type :mbql/query :database db
                    :stages   [{:lib/type :mbql.stage/mbql
                                :source-table t1
                                :fields [[:field {} f1] [:field {} f2]]}]}
                   {:lib/type :mbql/query :database db
                    :stages   [{:lib/type :mbql.stage/mbql
                                :source-table t2
                                :fields [[:field {} f3]]}]}]]
        (serdes/with-cache
          (let [pointwise (mapv serdes/export-mbql trees)]
            (serdes/with-cache  ; fresh cache so we're not biased by the first run
              (let [batch     (serdes/export-mbql-batch trees)]
                (is (= pointwise batch)
                    "layerwise output is structurally identical to the pointwise output")))))))))

(deftest export-mbql-batch-amortizes-fk-resolution-test
  (testing "Batched export across N trees collapses FK resolution to ~3 SELECTs total"
    (mt/with-temp [:model/Database {db :id} {:name "thing"}
                   :model/Table {t1 :id} {:db_id db :name "alpha" :schema "public"}
                   :model/Table {t2 :id} {:db_id db :name "beta"  :schema "public"}
                   :model/Field {f1 :id} {:table_id t1 :name "a" :base_type :type/Integer}
                   :model/Field {f2 :id} {:table_id t1 :name "b" :base_type :type/Integer}
                   :model/Field {f3 :id} {:table_id t2 :name "c" :base_type :type/Integer}
                   :model/Field {f4 :id} {:table_id t2 :name "d" :base_type :type/Integer}]
      ;; 4 distinct trees, each referencing different fields. Pointwise would need many more queries.
      (let [trees [{:lib/type :mbql/query :database db
                    :stages [{:lib/type :mbql.stage/mbql :source-table t1 :fields [[:field {} f1]]}]}
                   {:lib/type :mbql/query :database db
                    :stages [{:lib/type :mbql.stage/mbql :source-table t1 :fields [[:field {} f2]]}]}
                   {:lib/type :mbql/query :database db
                    :stages [{:lib/type :mbql.stage/mbql :source-table t2 :fields [[:field {} f3]]}]}
                   {:lib/type :mbql/query :database db
                    :stages [{:lib/type :mbql.stage/mbql :source-table t2 :fields [[:field {} f4]]}]}]]
        (serdes/with-cache
          (t2/with-call-count [qc]
            (serdes/export-mbql-batch trees)
            ;; 3 batched SELECTs total: fields, tables, databases. Independent of N.
            ;; (Note: process-refs-batch falls back to pointwise export-mbql-ref for now,
            ;;  which calls the cache-aware singletons. Field FKs go through the batch primary.)
            (is (= 3 (qc)))))))))
