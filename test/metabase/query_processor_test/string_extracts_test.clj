(ns metabase.query-processor-test.string-extracts-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor :as qp]
            [metabase.query-processor-test :refer :all]
            [metabase.test :as mt]
            [metabase.test.data :as data]))

(defn- test-string-extract
  [expr & [filter]]
  (->> {:expressions {"test" expr}
        :fields      [[:expression "test"]]
        ;; filter clause is optional
        :filter      filter
        ;; To ensure stable ordering
        :order-by    [[:asc [:field-id (data/id :venues :id)]]]
        :limit       1}
       (mt/run-mbql-query venues)
       rows
       ffirst))

(deftest test-length
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 3 (int (test-string-extract [:length "foo"]))))))

(deftest test-trim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foo" (test-string-extract [:trim " foo "])))))

(deftest test-ltrim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foo " (test-string-extract [:ltrim " foo "])))))

(deftest test-rtrim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= " foo" (test-string-extract [:rtrim " foo "])))))

(deftest test-upper
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "RED MEDICINE" (test-string-extract [:upper [:field-id (data/id :venues :name)]])))))

(deftest test-lower
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "red medicine" (test-string-extract [:lower [:field-id (data/id :venues :name)]])))))

(deftest test-substring
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "Red" (test-string-extract [:substring [:field-id (data/id :venues :name)] 1 3])))
    (is (= "ed Medicine" (test-string-extract [:substring [:field-id (data/id :venues :name)] 2])))
    (is (= "Red Medicin" (test-string-extract [:substring [:field-id (data/id :venues :name)]
                                               1 [:- [:length [:field-id (data/id :venues :name)]] 1]])))))

(deftest test-replace
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "Red Baloon" (test-string-extract [:replace [:field-id (data/id :venues :name)] "Medicine" "Baloon"])))))

(deftest test-coalesce
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "a" (test-string-extract [:coalesce "a" "b"])))))

(deftest test-concat
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foobar" (test-string-extract [:concat "foo" "bar"])))
    (testing "Does concat work with >2 args"
      (is (= "foobar" (test-string-extract [:concat "f" "o" "o" "b" "a" "r"]))))))

(deftest test-regex-match-first
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex)
    (is (= "Red" (test-string-extract [:regex-match-first [:field-id (data/id :venues :name)] "(.ed+)"])))))

(deftest test-nesting
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "MED" (test-string-extract [:upper [:substring [:trim [:substring [:field-id (data/id :venues :name)] 4]] 1 3]])))))

(deftest test-breakout
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= ["20th Century Cafefoo" 1]
           (->> {:expressions  {"test" [:concat [:field-id (data/id :venues :name)] "foo"]}
                 :breakout     [[:expression "test"]]
                 :aggregation  [[:count]]
                 :limit        1}
                (mt/run-mbql-query venues)
                (mt/formatted-rows [identity int])
                first)))))

(deftest replace-escaping-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :expressions)
    (is (= "Larry's The Prime Rib" (test-string-extract
                                    [:replace [:field-id (data/id :venues :name)] "Lawry's" "Larry's"]
                                    [:= [:field-id (data/id :venues :name)] "Lawry's The Prime Rib"])))))

(deftest regex-match-first-escaping-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :expressions :regex)
    (is (= "Taylor's" (test-string-extract
                       [:regex-match-first [:field-id (data/id :venues :name)] "^Taylor's"]
                       [:= [:field-id (data/id :venues :name)] "Taylor's Prime Steak House"])))))

(deftest regex-extract-in-explict-join-test
  (testing "Should be able to use regex extra in an explict join (#17790)"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex :left-join)
      (mt/dataset sample-dataset
        (let [query (mt/mbql-query orders
                      {:joins       [{:source-table $$products
                                      :alias        "Products"
                                      :condition    [:= $product_id &Products.products.id]
                                      :fields       :all}]
                       :expressions {:regex [:regex-match-first &Products.products.category ".*"]}
                       :order-by    [[:asc $id]]
                       :limit       2})]
          (mt/with-native-query-testing-context query
            (is (= [[1 1 14 37.65 2.07 39.72 nil "2019-02-11T21:40:27.892Z" 2
                     "Widget"
                     14 "8833419218504" "Awesome Concrete Shoes" "Widget" "McClure-Lockman" 25.1 4.0 "2017-12-31T14:41:56.87Z"]
                    [2 1 123 110.93 6.1 117.03 nil "2018-05-15T08:04:04.58Z" 3
                     "Gizmo"
                     123 "3621077291879" "Mediocre Wooden Bench" "Gizmo" "Flatley-Kunde" 73.95 2.0 "2017-11-16T13:53:14.232Z"]]
                   (mt/formatted-rows [int int int 2.0 2.0 2.0 int str int
                                       str
                                       int str str str str 2.0 2.0 str]
                     (qp/process-query query))))))))))
