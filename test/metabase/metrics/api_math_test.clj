(ns metabase.metrics.api-math-test
  "Schema validation tests for the metric math expression contract.
   Tests cover expression schemas, per-instance filters, typed projections,
   and JSON normalization."
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.metrics.api :as metrics.api]
   [metabase.util.malli.registry :as mr]))

(defn- valid?
  "Check if a value is valid against a registered schema, with normalization."
  [schema-key value]
  (mc/validate (mr/resolve-schema schema-key)
               (mc/decode (mr/resolve-schema schema-key) value (mtx/transformer {:name :normalize}))))

(defn- decode
  "Decode a value against a registered schema with normalization."
  [schema-key value]
  (mc/decode (mr/resolve-schema schema-key) value (mtx/transformer {:name :normalize})))

(defn- valid-definition?
  "Check if a definition map is valid against the ::Definition schema."
  [value]
  (valid? ::metrics.api/Definition value))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Valid Expression Tests                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest bare-metric-reference-test
  (testing "A bare metric reference is a valid expression"
    (is (valid? ::lib-metric.schema/metric-math-expression
                [:metric {:lib/uuid "abc-123"} 42]))))

(deftest bare-measure-reference-test
  (testing "A bare measure reference is a valid expression"
    (is (valid? ::lib-metric.schema/metric-math-expression
                [:measure {:lib/uuid "def-456"} 7]))))

(deftest simple-arithmetic-test
  (testing "Simple arithmetic with two operands is valid"
    (doseq [op [:+ :- :* :/]]
      (testing (str "operator " op)
        (is (valid? ::lib-metric.schema/metric-math-expression
                    [op {} [:metric {:lib/uuid "a"} 1] [:metric {:lib/uuid "b"} 2]]))))))

(deftest nested-arithmetic-test
  (testing "Nested arithmetic (3+ levels) is valid"
    (is (valid? ::lib-metric.schema/metric-math-expression
                [:/ {}
                 [:- {}
                  [:metric {:lib/uuid "a"} 1]
                  [:metric {:lib/uuid "b"} 1]]
                 [:measure {:lib/uuid "c"} 3]]))))

(deftest mixed-metric-measure-expression-test
  (testing "Mixed metric + measure in same expression is valid"
    (is (valid? ::lib-metric.schema/metric-math-expression
                [:+ {}
                 [:metric {:lib/uuid "a"} 10]
                 [:measure {:lib/uuid "b"} 20]]))))

(deftest three-operand-arithmetic-test
  (testing "Arithmetic with three operands is valid"
    (is (valid? ::lib-metric.schema/metric-math-expression
                [:+ {}
                 [:metric {:lib/uuid "a"} 1]
                 [:metric {:lib/uuid "b"} 2]
                 [:metric {:lib/uuid "c"} 3]]))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Invalid Expression Tests                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest missing-uuid-on-reference-test
  (testing "Missing :lib/uuid on metric reference is invalid"
    (is (not (valid? ::lib-metric.schema/metric-math-expression
                     [:metric {} 42]))))
  (testing "Missing :lib/uuid on measure reference is invalid"
    (is (not (valid? ::lib-metric.schema/metric-math-expression
                     [:measure {} 7])))))

(deftest single-operand-arithmetic-test
  (testing "Arithmetic with a single operand is invalid"
    (is (not (valid? ::lib-metric.schema/metric-math-expression
                     [:+ {} [:metric {:lib/uuid "a"} 1]])))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Definition Validation Tests                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest valid-definition-bare-expression-test
  (testing "Valid definition with bare metric expression"
    (is (valid-definition?
         {:expression [:metric {:lib/uuid "a"} 42]}))))

(deftest valid-definition-with-filters-test
  (testing "Valid definition with matching filter UUIDs"
    (is (valid-definition?
         {:expression [:- {}
                       [:metric {:lib/uuid "a"} 1]
                       [:metric {:lib/uuid "b"} 2]]
          :filters    [{:lib/uuid "a"
                        :filter   [:= {} [:dimension {} "dim-1"] "value"]}]}))))

(deftest valid-definition-with-projections-test
  (testing "Valid definition with matching projection type/id"
    (is (valid-definition?
         {:expression  [:metric {:lib/uuid "a"} 42]
          :projections [{:type       :metric
                         :id         42
                         :projection [[:dimension {} "dim-1"]]}]}))))

(deftest duplicate-uuid-invalid-test
  (testing "Duplicate :lib/uuid values in expression are invalid"
    (is (not (valid-definition?
              {:expression [:- {}
                            [:metric {:lib/uuid "a"} 1]
                            [:metric {:lib/uuid "a"} 2]]})))))

(deftest filter-uuid-not-in-expression-test
  (testing "Filter referencing UUID not in expression is invalid"
    (is (not (valid-definition?
              {:expression [:metric {:lib/uuid "a"} 42]
               :filters    [{:lib/uuid "does-not-exist"
                             :filter   [:= {} [:dimension {} "dim-1"] "value"]}]})))))

(deftest projection-type-id-not-in-expression-test
  (testing "Projection type/id not matching expression leaf is invalid"
    (is (not (valid-definition?
              {:expression  [:metric {:lib/uuid "a"} 42]
               :projections [{:type       :measure
                              :id         99
                              :projection [[:dimension {} "dim-1"]]}]})))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Normalization Tests                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest normalize-string-tags-test
  (testing "String tags are normalized to keywords"
    (let [decoded (decode ::lib-metric.schema/metric-math-expression
                          ["metric" {"lib/uuid" "abc"} 1])]
      (is (= :metric (first decoded)))
      (is (= "abc" (get (second decoded) :lib/uuid))))))

(deftest normalize-string-operator-test
  (testing "String arithmetic operator is normalized to keyword"
    (let [decoded (decode ::lib-metric.schema/metric-math-expression
                          ["+" {} ["metric" {"lib/uuid" "a"} 1] ["metric" {"lib/uuid" "b"} 2]])]
      (is (= :+ (first decoded))))))

(deftest normalize-nested-string-expression-test
  (testing "Nested expression with all strings normalizes correctly"
    (let [decoded (decode ::lib-metric.schema/metric-math-expression
                          ["-" {}
                           ["metric" {"lib/uuid" "a"} 1]
                           ["measure" {"lib/uuid" "b"} 2]])]
      (is (= :- (first decoded)))
      (is (= :metric (first (nth decoded 2))))
      (is (= :measure (first (nth decoded 3)))))))

(deftest normalize-instance-filter-test
  (testing "Instance filter with string keys normalizes correctly"
    (let [decoded (decode ::lib-metric.schema/instance-filter
                          {"lib/uuid" "abc" "filter" ["=" {} ["dimension" {} "d1"] "val"]})]
      (is (= "abc" (:lib/uuid decoded)))
      (is (some? (:filter decoded))))))

(deftest normalize-typed-projection-test
  (testing "Typed projection with string keys normalizes correctly"
    (let [decoded (decode ::lib-metric.schema/typed-projection
                          {"type" "metric" "id" 42 "projection" [["dimension" {} "d1"]]})]
      (is (= :metric (:type decoded)))
      (is (= 42 (:id decoded)))
      (is (= 1 (count (:projection decoded)))))))
