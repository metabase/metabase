(ns metabase.lib.types.array-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.types.array :as lib.types.array]))

(deftest ^:parallel array-element-effective-type-test
  (testing "reads :array-element-type when present (BE path)"
    (is (= :type/Text
           (lib.types.array/array-element-effective-type
            {:base-type :type/Array, :array-element-type :type/Text}))))
  (testing "falls back to parsing database-type (FE path)"
    (is (= :type/Text
           (lib.types.array/array-element-effective-type
            {:base-type :type/Array, :database-type "_text"})))
    (is (= :type/Integer
           (lib.types.array/array-element-effective-type
            {:base-type :type/Array, :database-type "_int4"})))
    (is (= :type/Text
           (lib.types.array/array-element-effective-type
            {:base-type :type/Array, :database-type :_text}))))
  (testing "returns nil for non-array columns"
    (is (nil? (lib.types.array/array-element-effective-type
               {:base-type :type/Text, :database-type "text"})))))

(deftest ^:parallel column-for-filter-widget-test
  (let [array-col {:base-type :type/Array, :array-element-type :type/Integer, :effective-type :type/Array}]
    (is (= :type/Integer
           (:effective-type (lib.types.array/column-for-filter-widget array-col)))))
  (let [array-col-fe {:base-type :type/Array, :database-type "_int4", :effective-type :type/Array}]
    (is (= :type/Integer
           (:effective-type (lib.types.array/column-for-filter-widget array-col-fe)))))
  (let [text-col {:base-type :type/Text, :effective-type :type/Text}]
    (is (= text-col (lib.types.array/column-for-filter-widget text-col)))))
