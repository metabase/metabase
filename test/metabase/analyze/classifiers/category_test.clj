(ns metabase.analyze.classifiers.category-test
  "Tests for the category classifier."
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.category :as classifiers.category]
   [metabase.analyze.core :as analyze]
   [metabase.models.interface :as mi]))

(defn- field
  [base-type has-field-values distinct-count]
  (mi/instance :model/Field
               {:id                  1
                :table_id            1
                :name                "f"
                :display_name        "F"
                :database_type       "VARCHAR"
                :base_type           base-type
                :semantic_type       nil
                :has_field_values    has-field-values
                :active              true
                :visibility_type     :normal
                :preview_display     true
                :fingerprint_version 1
                :fingerprint         {:global {:distinct-count distinct-count, :nil% 0.0}}}))

(defn- has-field-values-after [base-type has-field-values distinct-count]
  (let [f (field base-type has-field-values distinct-count)]
    (:has_field_values (or (classifiers.category/infer-has-field-values f (:fingerprint f)) f))))

(deftest ^:parallel too-many-distinct-values-for-a-list-test
  (testing "an auto-list field whose sample has more than 1,500 distinct values gets search"
    (is (= :search (has-field-values-after :type/Text :auto-list 1501)))
    (is (= :search (has-field-values-after :type/Integer :auto-list 5000))))
  (testing "at 1,500 distinct values or fewer it stays a list"
    (is (= :auto-list (has-field-values-after :type/Text :auto-list 1500)))
    (is (= :auto-list (has-field-values-after :type/Text :auto-list 3))))
  (testing "a field that is not auto-list does not change"
    (is (= :list (has-field-values-after :type/Text :list 5000)))
    (is (= :none (has-field-values-after :type/Text :none 5000)))
    (is (nil? (has-field-values-after :type/Text nil 5000))))
  (testing "a field with no distinct count does not change"
    (let [f (field :type/Text :auto-list nil)]
      (is (nil? (classifiers.category/infer-has-field-values f nil))))))

(deftest ^:parallel run-classifiers-sets-search-test
  (testing "the classifiers that sync runs include this rule"
    (let [f (field :type/Text :auto-list 2000)]
      (is (= :search (:has_field_values (analyze/run-classifiers f (:fingerprint f))))))))
