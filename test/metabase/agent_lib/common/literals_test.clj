(ns metabase.agent-lib.common.literals-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.common.literals :as literals]))

(deftest ^:parallel scalar-literal-test
  (testing "nil is a scalar literal"
    (is (true? (literals/scalar-literal? nil))))
  (testing "strings are scalar literals"
    (is (true? (literals/scalar-literal? "hello")))
    (is (true? (literals/scalar-literal? ""))))
  (testing "numbers are scalar literals"
    (is (true? (literals/scalar-literal? 42)))
    (is (true? (literals/scalar-literal? 3.14)))
    (is (true? (literals/scalar-literal? 0))))
  (testing "booleans are scalar literals"
    (is (true? (literals/scalar-literal? true)))
    (is (true? (literals/scalar-literal? false))))
  (testing "maps and vectors are not scalar literals"
    (is (false? (literals/scalar-literal? {})))
    (is (false? (literals/scalar-literal? [])))
    (is (false? (literals/scalar-literal? :keyword)))))

(deftest ^:parallel non-blank-string-test
  (testing "non-blank strings"
    (is (true? (literals/non-blank-string? "hello")))
    (is (true? (literals/non-blank-string? " x "))))
  (testing "blank strings"
    (is (false? (literals/non-blank-string? "")))
    (is (false? (literals/non-blank-string? "   "))))
  (testing "non-strings"
    (is (false? (literals/non-blank-string? nil)))
    (is (false? (literals/non-blank-string? 42)))))

(deftest ^:parallel quarter-label-string-test
  (testing "valid quarter labels"
    (is (some? (literals/quarter-label-string? "Q1")))
    (is (some? (literals/quarter-label-string? "Q4")))
    (is (some? (literals/quarter-label-string? "q2")))
    (is (some? (literals/quarter-label-string? " Q3 "))))
  (testing "invalid quarter labels"
    (is (nil? (literals/quarter-label-string? "Q5")))
    (is (nil? (literals/quarter-label-string? "Q0")))
    (is (nil? (literals/quarter-label-string? "Q")))
    (is (nil? (literals/quarter-label-string? "")))
    (is (not (literals/quarter-label-string? nil)))))

(deftest ^:parallel now-literal-test
  (testing "case-insensitive now"
    (is (true? (literals/now-literal? "now")))
    (is (true? (literals/now-literal? "NOW")))
    (is (true? (literals/now-literal? " now "))))
  (testing "not-now values"
    (is (false? (literals/now-literal? "not-now")))
    (is (false? (literals/now-literal? nil)))
    (is (false? (literals/now-literal? 42)))))

(deftest ^:parallel iso-date-string-test
  (testing "valid ISO dates"
    (is (some? (literals/iso-date-string? "2024-01-15")))
    (is (some? (literals/iso-date-string? " 2024-12-31 "))))
  (testing "invalid date formats"
    (is (nil? (literals/iso-date-string? "2024-1-15")))
    (is (nil? (literals/iso-date-string? "not-a-date")))
    (is (not (literals/iso-date-string? nil)))))

(deftest ^:parallel null-literal-test
  (testing "nil is null"
    (is (true? (literals/null-literal? nil))))
  (testing "string null variants"
    (is (true? (literals/null-literal? "null")))
    (is (true? (literals/null-literal? "NULL"))))
  (testing "non-null values"
    (is (false? (literals/null-literal? "not null")))
    (is (false? (literals/null-literal? 0)))
    (is (false? (literals/null-literal? false)))))

(deftest ^:parallel scalar-sequential-test
  (testing "vector of scalars"
    (is (true? (literals/scalar-sequential? [1 2 3])))
    (is (true? (literals/scalar-sequential? ["a" "b"])))
    (is (true? (literals/scalar-sequential? [nil true 42 "x"]))))
  (testing "empty vector is scalar-sequential"
    (is (true? (literals/scalar-sequential? []))))
  (testing "rejects operator tuples"
    (is (false? (literals/scalar-sequential? ["count"])))
    (is (false? (literals/scalar-sequential? ["field" 1]))))
  (testing "rejects non-sequential"
    (is (false? (literals/scalar-sequential? "abc")))
    (is (false? (literals/scalar-sequential? 42)))))

(deftest ^:parallel aggregation-form-test
  (testing "recognizes canonical aggregation operators"
    (is (some? (literals/aggregation-form? ["count"])))
    (is (some? (literals/aggregation-form? ["sum" ["field" 1]])))
    (is (some? (literals/aggregation-form? ["avg" ["field" 1]])))
    (is (some? (literals/aggregation-form? ["min" ["field" 1]])))
    (is (some? (literals/aggregation-form? ["max" ["field" 1]])))
    (is (some? (literals/aggregation-form? ["distinct" ["field" 1]])))
    (is (some? (literals/aggregation-form? ["median" ["field" 1]])))
    (is (some? (literals/aggregation-form? ["stddev" ["field" 1]])))
    (is (some? (literals/aggregation-form? ["var" ["field" 1]])))
    (is (some? (literals/aggregation-form? ["count-where" ["field" 1]])))
    (is (some? (literals/aggregation-form? ["percentile" ["field" 1] 0.9])))
    (is (some? (literals/aggregation-form? ["metric" 42]))))
  (testing "rejects non-aggregation operators"
    (is (nil? (literals/aggregation-form? ["field" 1])))
    (is (nil? (literals/aggregation-form? ["=" 1 2]))))
  (testing "rejects non-vectors"
    (is (not (literals/aggregation-form? "count")))))

(deftest ^:parallel default-map-test
  (testing "maps with :default key"
    (is (true? (literals/default-map? {:default nil})))
    (is (true? (literals/default-map? {"default" 42}))))
  (testing "maps without default key"
    (is (false? (literals/default-map? {:other 1})))
    (is (false? (literals/default-map? {}))))
  (testing "non-maps"
    (is (false? (literals/default-map? nil)))
    (is (false? (literals/default-map? [])))))

(deftest ^:parallel bare-field-id-test
  (testing "positive integers"
    (is (true? (literals/bare-field-id? 1)))
    (is (true? (literals/bare-field-id? 42))))
  (testing "zero and negatives"
    (is (false? (literals/bare-field-id? 0)))
    (is (false? (literals/bare-field-id? -1))))
  (testing "non-integers"
    (is (false? (literals/bare-field-id? 3.14)))
    (is (false? (literals/bare-field-id? "42")))
    (is (false? (literals/bare-field-id? nil)))))
