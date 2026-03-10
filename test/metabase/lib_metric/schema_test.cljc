(ns metabase.lib-metric.schema-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.util.malli.registry :as mr]))

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
