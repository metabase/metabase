(ns metabase.lib-metric.definition-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.error :as me]
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.measures :as lib-metric.measures]
   [metabase.lib-metric.metrics :as lib-metric.metrics]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.util.malli.registry :as mr]))

;; Ensure multimethod implementations are loaded
(comment lib-metric.measures/keep-me
         lib-metric.metrics/keep-me)

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")

(def ^:private target-1 [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} 1])
(def ^:private target-2 [:field {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} 2])

(def ^:private sample-dimensions
  [{:id uuid-1 :name "category" :display-name "Category" :status :status/active}
   {:id uuid-2 :name "created_at" :display-name "Created At" :status :status/active}])

(def ^:private sample-mappings
  [{:type :table :table-id 1 :dimension-id uuid-1 :target target-1}
   {:type :table :table-id 1 :dimension-id uuid-2 :target target-2}])

(def ^:private sample-metric-metadata
  {:lib/type           :metadata/metric
   :id                 42
   :name               "Total Revenue"
   :dimensions         sample-dimensions
   :dimension-mappings sample-mappings
   :dataset-query      {:database 1 :type :query :query {:source-table 1}}})

(def ^:private sample-measure-metadata
  {:lib/type           :metadata/measure
   :id                 99
   :name               "Average Order Value"
   :dimensions         sample-dimensions
   :dimension-mappings sample-mappings
   :definition         {:database 1 :type :query :query {:source-table 2}}})

(def ^:private mock-provider
  "A mock metadata provider for testing."
  :mock-provider)

;;; -------------------------------------------------- from-metric-metadata --------------------------------------------------

(deftest ^:parallel from-metric-metadata-creates-valid-definition-test
  (let [definition (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)]
    (testing "has correct lib/type"
      (is (= :metric/definition (:lib/type definition))))
    (testing "has correct expression"
      (let [expr (:expression definition)]
        (is (= :metric (first expr)))
        (is (string? (get (second expr) :lib/uuid)))
        (is (= 42 (nth expr 2)))))
    (testing "dimensions are derived later, not stored in definition"
      (is (nil? (:dimensions definition))))
    (testing "dimension-mappings are derived later, not stored in definition"
      (is (nil? (:dimension-mappings definition))))
    (testing "starts with empty filters"
      (is (= [] (:filters definition))))
    (testing "starts with empty projections"
      (is (= [] (:projections definition))))
    (testing "preserves metadata-provider"
      (is (= mock-provider (:metadata-provider definition))))))

(deftest ^:parallel from-metric-metadata-validates-schema-test
  (let [definition (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)]
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/metric-definition definition)))
        "definition should conform to the Malli schema")))

;; Note: dimensions and dimension-mappings are derived when building the AST,
;; not copied from metadata to definition. Tests for dimension derivation
;; belong in the AST build tests.

;;; -------------------------------------------------- from-measure-metadata --------------------------------------------------

(deftest ^:parallel from-measure-metadata-creates-valid-definition-test
  (let [definition (lib-metric.definition/from-measure-metadata mock-provider sample-measure-metadata)]
    (testing "has correct lib/type"
      (is (= :metric/definition (:lib/type definition))))
    (testing "has correct expression"
      (let [expr (:expression definition)]
        (is (= :measure (first expr)))
        (is (string? (get (second expr) :lib/uuid)))
        (is (= 99 (nth expr 2)))))
    (testing "dimensions are derived later, not stored in definition"
      (is (nil? (:dimensions definition))))
    (testing "dimension-mappings are derived later, not stored in definition"
      (is (nil? (:dimension-mappings definition))))
    (testing "starts with empty filters"
      (is (= [] (:filters definition))))
    (testing "starts with empty projections"
      (is (= [] (:projections definition))))
    (testing "preserves metadata-provider"
      (is (= mock-provider (:metadata-provider definition))))))

(deftest ^:parallel from-measure-metadata-validates-schema-test
  (let [definition (lib-metric.definition/from-measure-metadata mock-provider sample-measure-metadata)]
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/metric-definition definition)))
        "definition should conform to the Malli schema")))

;; Note: dimensions and dimension-mappings are derived when building the AST,
;; not copied from metadata to definition. Tests for dimension derivation
;; belong in the AST build tests.

;;; -------------------------------------------------- source-metric-id --------------------------------------------------

(deftest ^:parallel source-metric-id-returns-id-for-metric-based-definition-test
  (let [definition (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)]
    (is (= 42 (lib-metric.definition/source-metric-id definition)))))

(deftest ^:parallel source-metric-id-returns-nil-for-measure-based-definition-test
  (let [definition (lib-metric.definition/from-measure-metadata mock-provider sample-measure-metadata)]
    (is (nil? (lib-metric.definition/source-metric-id definition)))))

;;; -------------------------------------------------- source-measure-id --------------------------------------------------

(deftest ^:parallel source-measure-id-returns-id-for-measure-based-definition-test
  (let [definition (lib-metric.definition/from-measure-metadata mock-provider sample-measure-metadata)]
    (is (= 99 (lib-metric.definition/source-measure-id definition)))))

(deftest ^:parallel source-measure-id-returns-nil-for-metric-based-definition-test
  (let [definition (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)]
    (is (nil? (lib-metric.definition/source-measure-id definition)))))

;;; -------------------------------------------------- filters --------------------------------------------------

(deftest ^:parallel filters-returns-empty-vector-for-new-definition-test
  (let [definition (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)]
    (is (= [] (lib-metric.definition/filters definition)))))

(deftest ^:parallel filters-returns-filters-from-definition-test
  (let [filter-clause [:= [:dimension {} uuid-1] "Electronics"]
        definition    (-> (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)
                          (assoc :filters [{:lib/uuid "inst-1" :filter filter-clause}]))]
    (is (= [{:lib/uuid "inst-1" :filter filter-clause}] (lib-metric.definition/filters definition)))))

(deftest ^:parallel filters-returns-multiple-filters-test
  (let [filter-1   [:= [:dimension {} uuid-1] "Electronics"]
        filter-2   [:> [:dimension {} uuid-2] "2024-01-01"]
        definition (-> (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)
                       (assoc :filters [{:lib/uuid "inst-1" :filter filter-1}
                                        {:lib/uuid "inst-1" :filter filter-2}]))]
    (is (= 2 (count (lib-metric.definition/filters definition))))))

;;; -------------------------------------------------- projections --------------------------------------------------

(deftest ^:parallel projections-returns-empty-vector-for-new-definition-test
  (let [definition (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)]
    (is (= [] (lib-metric.definition/projections definition)))))

(deftest ^:parallel projections-returns-projections-from-definition-test
  (let [projection  [:dimension {} uuid-1]
        definition  (-> (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)
                        (assoc :projections [{:type :metric :id 42 :projection [projection]}]))]
    (is (= [{:type :metric :id 42 :projection [projection]}]
           (lib-metric.definition/projections definition)))))

(deftest ^:parallel projections-returns-multiple-projections-test
  (let [projection-1 [:dimension {} uuid-1]
        projection-2 [:dimension {:temporal-unit :month} uuid-2]
        definition   (-> (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)
                         (assoc :projections [{:type :metric :id 42 :projection [projection-1 projection-2]}]))]
    (is (= [projection-1 projection-2]
           (lib-metric.definition/flat-projections (lib-metric.definition/projections definition))))))

;;; -------------------------------------------------- Expression Helpers --------------------------------------------------

(deftest ^:parallel expression-leaf?-test
  (testing "metric leaf"
    (is (lib-metric.definition/expression-leaf? [:metric {:lib/uuid "a"} 42])))
  (testing "measure leaf"
    (is (lib-metric.definition/expression-leaf? [:measure {:lib/uuid "a"} 99])))
  (testing "arithmetic is not a leaf"
    (is (not (lib-metric.definition/expression-leaf? [:+ {} [:metric {:lib/uuid "a"} 1] [:metric {:lib/uuid "b"} 2]]))))
  (testing "nil is not a leaf"
    (is (not (lib-metric.definition/expression-leaf? nil)))))

(deftest ^:parallel expression-leaf-type-test
  (is (= :metric (lib-metric.definition/expression-leaf-type [:metric {:lib/uuid "a"} 42])))
  (is (= :measure (lib-metric.definition/expression-leaf-type [:measure {:lib/uuid "a"} 99])))
  (is (nil? (lib-metric.definition/expression-leaf-type [:+ {} [:metric {:lib/uuid "a"} 1]]))))

(deftest ^:parallel expression-leaf-id-test
  (is (= 42 (lib-metric.definition/expression-leaf-id [:metric {:lib/uuid "a"} 42])))
  (is (= 99 (lib-metric.definition/expression-leaf-id [:measure {:lib/uuid "a"} 99])))
  (is (nil? (lib-metric.definition/expression-leaf-id nil))))

(deftest ^:parallel expression-leaf-uuid-test
  (is (= "a" (lib-metric.definition/expression-leaf-uuid [:metric {:lib/uuid "a"} 42])))
  (is (nil? (lib-metric.definition/expression-leaf-uuid nil))))

(deftest ^:parallel flat-projections-test
  (testing "empty"
    (is (= [] (lib-metric.definition/flat-projections []))))
  (testing "single entry with multiple dim-refs"
    (let [dr1 [:dimension {} "d1"]
          dr2 [:dimension {} "d2"]]
      (is (= [dr1 dr2]
             (lib-metric.definition/flat-projections [{:type :metric :id 1 :projection [dr1 dr2]}])))))
  (testing "multiple entries"
    (let [dr1 [:dimension {} "d1"]
          dr2 [:dimension {} "d2"]]
      (is (= [dr1 dr2]
             (lib-metric.definition/flat-projections [{:type :metric :id 1 :projection [dr1]}
                                                      {:type :measure :id 2 :projection [dr2]}]))))))

;;; -------------------------------------------------- expression-leaves --------------------------------------------------

(deftest ^:parallel expression-leaves-single-metric-leaf-test
  (testing "single metric leaf returns vector of that leaf"
    (let [leaf [:metric {:lib/uuid "a"} 42]]
      (is (= [leaf] (lib-metric.definition/expression-leaves leaf))))))

(deftest ^:parallel expression-leaves-single-measure-leaf-test
  (testing "single measure leaf returns vector of that leaf"
    (let [leaf [:measure {:lib/uuid "a"} 99]]
      (is (= [leaf] (lib-metric.definition/expression-leaves leaf))))))

(deftest ^:parallel expression-leaves-binary-arithmetic-test
  (testing "binary arithmetic returns both leaves"
    (let [leaf1 [:metric {:lib/uuid "a"} 1]
          leaf2 [:metric {:lib/uuid "b"} 2]
          expr  [:+ {} leaf1 leaf2]]
      (is (= [leaf1 leaf2] (lib-metric.definition/expression-leaves expr))))))

(deftest ^:parallel expression-leaves-nested-arithmetic-test
  (testing "nested arithmetic returns all leaves in traversal order"
    (let [leaf1 [:metric {:lib/uuid "a"} 1]
          leaf2 [:measure {:lib/uuid "b"} 2]
          leaf3 [:metric {:lib/uuid "c"} 3]
          inner [:+ {} leaf1 leaf2]
          expr  [:* {} inner leaf3]]
      (is (= [leaf1 leaf2 leaf3] (lib-metric.definition/expression-leaves expr))))))

(deftest ^:parallel expression-leaves-invalid-input-test
  (testing "invalid input returns empty vector"
    (is (= [] (lib-metric.definition/expression-leaves nil)))
    (is (= [] (lib-metric.definition/expression-leaves "not-an-expression")))
    (is (= [] (lib-metric.definition/expression-leaves [])))))

(deftest ^:parallel expression-leaves-all-operators-test
  (testing "all arithmetic operators are supported"
    (let [leaf1 [:metric {:lib/uuid "a"} 1]
          leaf2 [:metric {:lib/uuid "b"} 2]]
      (doseq [op [:+ :- :* :/]]
        (is (= [leaf1 leaf2]
               (lib-metric.definition/expression-leaves [op {} leaf1 leaf2]))
            (str "operator " op " should be supported"))))))

;;; -------------------------------------------------- Schema Validation --------------------------------------------------

(deftest ^:parallel metric-definition-schema-test
  (let [valid-definition {:lib/type          :metric/definition
                          :expression        [:metric {:lib/uuid "550e8400-e29b-41d4-a716-446655440001"} 1]
                          :filters           []
                          :projections       []
                          :metadata-provider nil}]
    (testing "valid definition"
      (is (nil? (me/humanize (mr/explain ::lib-metric.schema/metric-definition valid-definition)))))
    (testing "invalid lib/type"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/metric-definition
                                          (assoc valid-definition :lib/type :other/type))))))
    (testing "missing required fields"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/metric-definition
                                          (dissoc valid-definition :expression))))))
    (testing "definition with typed projections"
      (is (nil? (me/humanize (mr/explain ::lib-metric.schema/metric-definition
                                         (assoc valid-definition
                                                :projections [{:type :metric :id 1
                                                               :projection [[:dimension {} uuid-1]]}]))))))))
