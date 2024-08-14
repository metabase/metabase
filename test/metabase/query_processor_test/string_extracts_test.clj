(ns metabase.query-processor-test.string-extracts-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.data :as data]))

(defn- test-string-extract
  [expr & [filter]]
  (->> {:expressions {"test" expr}
        :fields      [[:expression "test"]]
        ;; filter clause is optional
        :filter      filter
        ;; To ensure stable ordering
        :order-by    [[:asc [:field (data/id :venues :id) nil]]]
        :limit       1}
       (mt/run-mbql-query venues)
       mt/rows
       ffirst))

(deftest ^:parallel test-length
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= 3 (int (test-string-extract [:length "foo"]))))))

(deftest ^:parallel test-trim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foo" (test-string-extract [:trim " foo "])))))

(deftest ^:parallel test-ltrim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foo " (test-string-extract [:ltrim " foo "])))))

(deftest ^:parallel test-rtrim
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= " foo" (test-string-extract [:rtrim " foo "])))))

(deftest ^:parallel test-upper
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "RED MEDICINE" (test-string-extract [:upper [:field (data/id :venues :name) nil]])))))

(deftest ^:parallel test-lower
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "red medicine" (test-string-extract [:lower [:field (data/id :venues :name) nil]])))))

(deftest ^:parallel test-substring
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "Red" (test-string-extract [:substring [:field (data/id :venues :name) nil] 1 3])))
    ;; 0 is normalized 1 to by the normalize/canonicalize processing
    (is (= "Red" (test-string-extract [:substring [:field (data/id :venues :name) nil] 0 3])))
    (is (= "ed Medicine" (test-string-extract [:substring [:field (data/id :venues :name) nil] 2])))
    (is (= "Red Medicin" (test-string-extract [:substring [:field (data/id :venues :name) nil]
                                               1 [:- [:length [:field (data/id :venues :name) nil]] 1]])))
    (is (= "ne" (test-string-extract [:substring [:field (data/id :venues :name) nil]
                                      [:- [:length [:field (data/id :venues :name) nil]] 1]])))))

(deftest ^:parallel test-replace
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (when (or (not= driver/*driver* :mongo)
              ;; mongo supports $replaceAll since version 4.4
              (driver.u/semantic-version-gte
               (-> (mt/db) :dbms_version :semantic-version)
               [4 4]))
      (is (= "Red Baloon" (test-string-extract [:replace [:field (data/id :venues :name) nil] "Medicine" "Baloon"])))
      (is (= "Rod Modicino" (test-string-extract [:replace [:field (data/id :venues :name) nil] "e" "o"])))
      (is (= "Red" (test-string-extract [:replace [:field (data/id :venues :name) nil] " Medicine" ""])))
      (is (= "Larry's The Prime Rib" (test-string-extract
                                      [:replace [:field (data/id :venues :name) nil] "Lawry's" "Larry's"]
                                      [:= [:field (data/id :venues :name) nil] "Lawry's The Prime Rib"]))))))

(deftest ^:parallel test-coalesce
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "Red Medicine" (test-string-extract [:coalesce
                                                [:field (data/id :venues :name) nil]
                                                "b"])))))

(deftest ^:parallel test-concat
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "foobar" (test-string-extract [:concat "foo" "bar"])))
    (testing "Does concat work with >2 args"
      (is (= "foobar" (test-string-extract [:concat "f" "o" "o" "b" "a" "r"]))))))

(deftest ^:parallel test-regex-match-first
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex)
    (is (= "Red" (test-string-extract [:regex-match-first [:field (data/id :venues :name) nil] "(.ed+)"])))))

(deftest ^:parallel test-nesting
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= "MED" (test-string-extract [:upper [:substring [:trim [:substring [:field (data/id :venues :name) nil] 4]] 1 3]])))))

(deftest ^:parallel test-breakout
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= ["20th Century Cafefoo" 1]
           (->> {:expressions  {"test" [:concat [:field (data/id :venues :name) nil] "foo"]}
                 :breakout     [[:expression "test"]]
                 :aggregation  [[:count]]
                 :limit        1}
                (mt/run-mbql-query venues)
                (mt/formatted-rows [identity int])
                first)))))

(deftest ^:parallel regex-match-first-escaping-test
  (mt/test-drivers
      (mt/normal-drivers-with-feature :expressions :regex)
      (is (= "Taylor's" (test-string-extract
                         [:regex-match-first [:field (data/id :venues :name) nil] "^Taylor's"]
                         [:= [:field (data/id :venues :name) nil] "Taylor's Prime Steak House"])))))

(deftest ^:parallel regex-extract-in-explict-join-test
  (testing "Should be able to use regex extra in an explict join (#17790)"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions :regex :left-join)
      (mt/dataset test-data
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
