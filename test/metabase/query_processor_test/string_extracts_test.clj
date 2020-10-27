(ns metabase.query-processor-test.string-extracts-test
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor-test :refer :all]
             [test :as mt]]
            [metabase.test.data :as data]))

(defn- test-string-extract
  [expr]
  (->> {:expressions {"test" expr}
        :fields      [[:expression "test"]]
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

(deftest test-replacea
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
