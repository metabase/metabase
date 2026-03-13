(ns metabase.lib-metric.schema-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.util.malli.registry :as mr]))

(def ^:private uuid-a "550e8400-e29b-41d4-a716-446655440000")
(def ^:private uuid-b "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-c "550e8400-e29b-41d4-a716-446655440002")

(deftest ^:parallel dimension-id-test
  (testing "dimension-id must be a valid UUID string"
    (are [id valid?] (= valid? (mr/validate ::lib-metric.schema/dimension-id id))
      "550e8400-e29b-41d4-a716-446655440000" true
      "00000000-0000-0000-0000-000000000000" true
      "not-a-uuid"                           false
      ""                                     false
      nil                                    false
      123                                    false)))

(deftest ^:parallel dimension-test
  (testing "valid dimensions"
    (are [dim] (nil? (me/humanize (mr/explain ::lib-metric.schema/dimension dim)))
      {:id "550e8400-e29b-41d4-a716-446655440000"}
      {:id             "550e8400-e29b-41d4-a716-446655440000"
       :display-name   "Category"
       :effective-type :type/Text
       :semantic-type  :type/Category}
      {:id             "550e8400-e29b-41d4-a716-446655440000"
       :display-name   nil
       :effective-type nil
       :semantic-type  nil}
      {:id           "550e8400-e29b-41d4-a716-446655440000"
       :display-name "Product Name"}))
  (testing "invalid dimensions"
    (testing "missing id"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension
                                          {:display-name "Category"})))))
    (testing "invalid id"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension
                                          {:id "not-a-uuid"})))))
    (testing "invalid effective-type"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension
                                          {:id             "550e8400-e29b-41d4-a716-446655440000"
                                           :effective-type :not/a-type})))))
    (testing "invalid semantic-type"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension
                                          {:id            "550e8400-e29b-41d4-a716-446655440000"
                                           :semantic-type :not/a-semantic-type})))))))

(deftest ^:parallel dimension-mapping-type-test
  (testing "dimension-mapping.type must be :table"
    (is (mr/validate ::lib-metric.schema/dimension-mapping.type :table))
    (is (not (mr/validate ::lib-metric.schema/dimension-mapping.type :other)))
    (is (not (mr/validate ::lib-metric.schema/dimension-mapping.type "table")))))

(deftest ^:parallel dimension-mapping-target-test
  (testing "valid field references"
    (are [target] (mr/validate ::lib-metric.schema/dimension-mapping.target target)
      [:field {:lib/uuid "550e8400-e29b-41d4-a716-446655440000"} 1]
      [:field {:lib/uuid "550e8400-e29b-41d4-a716-446655440000" :source-field 1} 2]
      [:field {:lib/uuid "550e8400-e29b-41d4-a716-446655440000" :base-type :type/Text} "column_name"]))
  (testing "invalid field references"
    (are [target] (not (mr/validate ::lib-metric.schema/dimension-mapping.target target))
      [:expression {} "expr"]
      [:field {} 1])))

(deftest ^:parallel dimension-mapping-test
  (testing "valid dimension mappings"
    (are [mapping] (nil? (me/humanize (mr/explain ::lib-metric.schema/dimension-mapping mapping)))
      {:type         :table
       :table-id     1
       :dimension-id "550e8400-e29b-41d4-a716-446655440000"
       :target       [:field {:lib/uuid "550e8400-e29b-41d4-a716-446655440001"} 2]}
      {:type         :table
       :table-id     100
       :dimension-id "00000000-0000-0000-0000-000000000000"
       :target       [:field {:lib/uuid "550e8400-e29b-41d4-a716-446655440001" :source-field 1} 2]}))
  (testing "invalid dimension mappings"
    (testing "missing required fields"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-mapping
                                          {:type :table})))))
    (testing "invalid type"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-mapping
                                          {:type         :invalid
                                           :table-id     1
                                           :dimension-id "550e8400-e29b-41d4-a716-446655440000"
                                           :target       [:field {:lib/uuid "550e8400-e29b-41d4-a716-446655440001"} 2]})))))
    (testing "invalid table-id"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-mapping
                                          {:type         :table
                                           :table-id     -1
                                           :dimension-id "550e8400-e29b-41d4-a716-446655440000"
                                           :target       [:field {:lib/uuid "550e8400-e29b-41d4-a716-446655440001"} 2]})))))
    (testing "invalid target"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-mapping
                                          {:type         :table
                                           :table-id     1
                                           :dimension-id "550e8400-e29b-41d4-a716-446655440000"
                                           :target       [:not-a-field {} 2]})))))))

(deftest ^:parallel dimension-reference-options-test
  (testing "valid dimension-reference options"
    (are [opts] (nil? (me/humanize (mr/explain ::lib-metric.schema/dimension-reference.options opts)))
      {}
      {:display-name "Custom Name"}
      {:effective-type :type/Integer}
      {:semantic-type :type/Category}
      {:display-name   "Custom Name"
       :effective-type :type/Text
       :semantic-type  :type/Name}
      {:display-name   nil
       :effective-type nil
       :semantic-type  nil}))
  (testing "invalid dimension-reference options"
    (testing "invalid effective-type"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-reference.options
                                          {:effective-type :not/valid})))))
    (testing "invalid semantic-type"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-reference.options
                                          {:semantic-type :not/valid})))))))

(deftest ^:parallel dimension-reference-test
  (testing "valid dimension references"
    (are [ref] (nil? (me/humanize (mr/explain ::lib-metric.schema/dimension-reference ref)))
      [:dimension {} "550e8400-e29b-41d4-a716-446655440000"]
      [:dimension {:display-name "Custom"} "550e8400-e29b-41d4-a716-446655440000"]
      [:dimension
       {:display-name   "Custom Name"
        :effective-type :type/Text
        :semantic-type  :type/Category}
       "550e8400-e29b-41d4-a716-446655440000"]))
  (testing "invalid dimension references"
    (testing "wrong tag"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-reference
                                          [:field {} "550e8400-e29b-41d4-a716-446655440000"])))))
    (testing "invalid dimension-id"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-reference
                                          [:dimension {} "not-a-uuid"])))))
    (testing "missing options map"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-reference
                                          [:dimension "550e8400-e29b-41d4-a716-446655440000"])))))
    (testing "wrong arity"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/dimension-reference
                                          [:dimension {} "550e8400-e29b-41d4-a716-446655440000" "extra"])))))))

;;; -------------------------------------------------- Ad-hoc Schemas --------------------------------------------------

(def ^:private sample-field-ref
  [:field {:lib/uuid uuid-a :table-id 1} 42])

(def ^:private sample-adhoc-dimension
  {:id             uuid-a
   :field-ref      sample-field-ref
   :display-name   "Tax"
   :effective-type :type/Float
   :semantic-type  :type/Currency})

(def ^:private sample-adhoc-definition
  {:database-id 1
   :table-id    10
   :aggregation [:count {}]
   :dimensions  [sample-adhoc-dimension]})

(deftest ^:parallel adhoc-dimension-test
  (testing "valid adhoc dimensions"
    (are [dim] (nil? (me/humanize (mr/explain ::lib-metric.schema/adhoc-dimension dim)))
      sample-adhoc-dimension
      ;; minimal — only required fields
      {:id        uuid-a
       :field-ref sample-field-ref}
      ;; optional fields explicitly nil
      {:id             uuid-a
       :field-ref      sample-field-ref
       :display-name   nil
       :effective-type nil
       :semantic-type  nil}))
  (testing "invalid adhoc dimensions"
    (testing "missing id"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/adhoc-dimension
                                          {:field-ref sample-field-ref})))))
    (testing "missing field-ref"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/adhoc-dimension
                                          {:id uuid-a})))))
    (testing "invalid id (not UUID)"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/adhoc-dimension
                                          {:id "not-uuid" :field-ref sample-field-ref})))))))

(deftest ^:parallel adhoc-definition-test
  (testing "valid definitions"
    (are [def-map] (nil? (me/humanize (mr/explain ::lib-metric.schema/adhoc-definition def-map)))
      sample-adhoc-definition
      ;; with filter
      (assoc sample-adhoc-definition :filter [:= {} [:field {} 1] "foo"])
      ;; empty dimensions
      (assoc sample-adhoc-definition :dimensions [])
      ;; aggregation with column
      (assoc sample-adhoc-definition :aggregation [:sum {} [:field {:lib/uuid uuid-b :table-id 10} 5]])))
  (testing "invalid definitions"
    (testing "missing database-id"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/adhoc-definition
                                          (dissoc sample-adhoc-definition :database-id))))))
    (testing "missing table-id"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/adhoc-definition
                                          (dissoc sample-adhoc-definition :table-id))))))
    (testing "missing aggregation"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/adhoc-definition
                                          (dissoc sample-adhoc-definition :aggregation))))))
    (testing "missing dimensions"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/adhoc-definition
                                          (dissoc sample-adhoc-definition :dimensions))))))))

(deftest ^:parallel adhoc-expression-ref-test
  (testing "valid adhoc expression refs"
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/adhoc-expression-ref
                                       [:adhoc {:lib/uuid uuid-a} sample-adhoc-definition])))))
  (testing "invalid adhoc expression refs"
    (testing "missing lib/uuid"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/adhoc-expression-ref
                                          [:adhoc {} sample-adhoc-definition])))))
    (testing "wrong tag"
      (is (some? (me/humanize (mr/explain ::lib-metric.schema/adhoc-expression-ref
                                          [:metric {:lib/uuid uuid-a} sample-adhoc-definition])))))))

(deftest ^:parallel expression-leaf-adhoc-test
  (testing "adhoc refs are accepted by the expression-leaf union"
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/expression-leaf
                                       [:adhoc {:lib/uuid uuid-a} sample-adhoc-definition])))))
  (testing "metric refs still validate"
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/expression-leaf
                                       [:metric {:lib/uuid uuid-a} 42])))))
  (testing "measure refs still validate"
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/expression-leaf
                                       [:measure {:lib/uuid uuid-a} 99]))))))

(deftest ^:parallel normalize-math-expression-adhoc-test
  (testing "normalizes an adhoc leaf expression"
    (let [raw     ["adhoc" {"lib/uuid" uuid-a}
                   {:database-id 1 :table-id 10
                    :aggregation [:count {}]
                    :dimensions  [{:id        uuid-b
                                   :field-ref [:field {"lib/uuid" uuid-c "table-id" 10} 42]
                                   :effective-type "type/Integer"}]}]
          result  (lib-metric.schema/normalize-math-expression raw)]
      (is (= :adhoc (first result)))
      (is (= uuid-a (get-in result [1 :lib/uuid])))
      (is (= :type/Integer (get-in result [2 :dimensions 0 :effective-type])))))
  (testing "adhoc leaf validates as metric-math-expression after normalization"
    (is (mr/validate ::lib-metric.schema/metric-math-expression
                     [:adhoc {:lib/uuid uuid-a} sample-adhoc-definition])))
  (testing "arithmetic with adhoc + metric validates"
    (is (mr/validate ::lib-metric.schema/metric-math-expression
                     [:+ {}
                      [:metric {:lib/uuid uuid-a} 1]
                      [:adhoc {:lib/uuid uuid-b} sample-adhoc-definition]])))
  (testing "arithmetic with adhoc + measure validates"
    (is (mr/validate ::lib-metric.schema/metric-math-expression
                     [:- {}
                      [:measure {:lib/uuid uuid-a} 5]
                      [:adhoc {:lib/uuid uuid-b} sample-adhoc-definition]]))))

(deftest ^:parallel typed-projection-adhoc-test
  (testing "adhoc typed projection with lib/uuid validates"
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/typed-projection
                                       {:type       :adhoc
                                        :lib/uuid   uuid-a
                                        :projection [[:dimension {} uuid-b]]})))))
  (testing "metric typed projection still validates"
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/typed-projection
                                       {:type       :metric
                                        :id         42
                                        :projection [[:dimension {} uuid-a]]})))))
  (testing "measure typed projection still validates"
    (is (nil? (me/humanize (mr/explain ::lib-metric.schema/typed-projection
                                       {:type       :measure
                                        :id         99
                                        :projection [[:dimension {} uuid-a]]}))))))
