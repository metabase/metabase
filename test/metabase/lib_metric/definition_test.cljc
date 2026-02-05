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
    (testing "has correct source"
      (is (= {:type     :source/metric
              :id       42
              :metadata sample-metric-metadata}
             (:source definition))))
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
    (testing "has correct source"
      (is (= {:type     :source/measure
              :id       99
              :metadata sample-measure-metadata}
             (:source definition))))
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
                          (assoc :filters [filter-clause]))]
    (is (= [filter-clause] (lib-metric.definition/filters definition)))))

(deftest ^:parallel filters-returns-multiple-filters-test
  (let [filter-1   [:= [:dimension {} uuid-1] "Electronics"]
        filter-2   [:> [:dimension {} uuid-2] "2024-01-01"]
        definition (-> (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)
                       (assoc :filters [filter-1 filter-2]))]
    (is (= [filter-1 filter-2] (lib-metric.definition/filters definition)))))

;;; -------------------------------------------------- projections --------------------------------------------------

(deftest ^:parallel projections-returns-empty-vector-for-new-definition-test
  (let [definition (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)]
    (is (= [] (lib-metric.definition/projections definition)))))

(deftest ^:parallel projections-returns-projections-from-definition-test
  (let [projection  [:dimension {} uuid-1]
        definition  (-> (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)
                        (assoc :projections [projection]))]
    (is (= [projection] (lib-metric.definition/projections definition)))))

(deftest ^:parallel projections-returns-multiple-projections-test
  (let [projection-1 [:dimension {} uuid-1]
        projection-2 [:dimension {:temporal-unit :month} uuid-2]
        definition   (-> (lib-metric.definition/from-metric-metadata mock-provider sample-metric-metadata)
                         (assoc :projections [projection-1 projection-2]))]
    (is (= [projection-1 projection-2] (lib-metric.definition/projections definition)))))

;;; -------------------------------------------------- Schema Validation --------------------------------------------------

(deftest ^:parallel metric-definition-source-type-schema-test
  (testing "valid source types"
    (is (mr/validate ::lib-metric.schema/metric-definition.source-type :source/metric))
    (is (mr/validate ::lib-metric.schema/metric-definition.source-type :source/measure)))
  (testing "invalid source types"
    (is (not (mr/validate ::lib-metric.schema/metric-definition.source-type :source/other)))
    (is (not (mr/validate ::lib-metric.schema/metric-definition.source-type "metric")))
    (is (not (mr/validate ::lib-metric.schema/metric-definition.source-type nil)))))

(deftest ^:parallel metric-definition-source-schema-test
  (testing "valid source"
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/metric-definition.source
                                       {:type     :source/metric
                                        :id       1
                                        :metadata {:lib/type :metadata/metric :id 1}})))))
  (testing "invalid source - missing fields"
    (is (some? (me/humanize (mr/explain ::lib-metric.schema/metric-definition.source
                                        {:type :source/metric})))))
  (testing "invalid source - negative id"
    (is (some? (me/humanize (mr/explain ::lib-metric.schema/metric-definition.source
                                        {:type     :source/metric
                                         :id       -1
                                         :metadata {}})))))
  (testing "invalid source - zero id"
    (is (some? (me/humanize (mr/explain ::lib-metric.schema/metric-definition.source
                                        {:type     :source/metric
                                         :id       0
                                         :metadata {}}))))))

(deftest ^:parallel metric-definition-schema-test
  (let [valid-definition {:lib/type          :metric/definition
                          :source            {:type     :source/metric
                                              :id       1
                                              :metadata {:lib/type :metadata/metric :id 1}}
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
                                          (dissoc valid-definition :source))))))
    (testing "definition with projections"
      (is (nil? (me/humanize (mr/explain ::lib-metric.schema/metric-definition
                                         (assoc valid-definition
                                                :projections [[:dimension {} uuid-1]]))))))))
