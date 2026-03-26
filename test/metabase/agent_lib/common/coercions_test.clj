(ns metabase.agent-lib.common.coercions-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.common.coercions :as coercions]))

(deftest ^:parallel quarter-label->number-test
  (testing "converts Q labels to integers"
    (is (= 1 (coercions/quarter-label->number "Q1")))
    (is (= 2 (coercions/quarter-label->number "q2")))
    (is (= 3 (coercions/quarter-label->number " Q3 ")))
    (is (= 4 (coercions/quarter-label->number "Q4"))))
  (testing "returns nil for invalid inputs"
    (is (nil? (coercions/quarter-label->number "Q5")))
    (is (nil? (coercions/quarter-label->number "Q0")))
    (is (nil? (coercions/quarter-label->number "abc")))
    (is (nil? (coercions/quarter-label->number nil)))))

(deftest ^:parallel parse-int-string-test
  (testing "parses valid integer strings"
    (is (= 42 (coercions/parse-int-string "42")))
    (is (= -7 (coercions/parse-int-string "-7")))
    (is (= 0 (coercions/parse-int-string "0"))))
  (testing "returns nil for invalid inputs"
    (is (nil? (coercions/parse-int-string "abc")))
    (is (nil? (coercions/parse-int-string "3.14")))
    (is (nil? (coercions/parse-int-string "")))
    (is (nil? (coercions/parse-int-string nil)))))

(deftest ^:parallel coerce-positive-int-test
  (testing "passes through positive integers"
    (is (= 5 (coercions/coerce-positive-int 5))))
  (testing "coerces positive integer strings"
    (is (= 5 (coercions/coerce-positive-int "5")))
    (is (= 100 (coercions/coerce-positive-int "100"))))
  (testing "does not coerce non-positive strings"
    (is (= "0" (coercions/coerce-positive-int "0")))
    (is (= "-1" (coercions/coerce-positive-int "-1"))))
  (testing "passes through non-string values"
    (is (= :kw (coercions/coerce-positive-int :kw)))
    (is (= -1 (coercions/coerce-positive-int -1)))))

(deftest ^:parallel coerce-non-negative-int-test
  (testing "passes through non-negative integers"
    (is (= 0 (coercions/coerce-non-negative-int 0)))
    (is (= 5 (coercions/coerce-non-negative-int 5))))
  (testing "coerces non-negative integer strings"
    (is (= 0 (coercions/coerce-non-negative-int "0")))
    (is (= 42 (coercions/coerce-non-negative-int "42"))))
  (testing "does not coerce negative strings"
    (is (= "-1" (coercions/coerce-non-negative-int "-1"))))
  (testing "passes through non-string values"
    (is (= :kw (coercions/coerce-non-negative-int :kw)))))

(deftest ^:parallel direction-string-test
  (testing "recognizes direction strings"
    (is (some? (coercions/direction-string? "asc")))
    (is (some? (coercions/direction-string? "desc")))
    (is (some? (coercions/direction-string? "ASC")))
    (is (some? (coercions/direction-string? :desc))))
  (testing "rejects non-direction values"
    (is (nil? (coercions/direction-string? "up")))
    (is (nil? (coercions/direction-string? nil)))))

(deftest ^:parallel normalize-direction-test
  (testing "normalizes to lowercase string"
    (is (= "asc" (coercions/normalize-direction "ASC")))
    (is (= "desc" (coercions/normalize-direction :desc)))
    (is (= "asc" (coercions/normalize-direction 'asc))))
  (testing "returns nil for nil"
    (is (nil? (coercions/normalize-direction nil)))))

(deftest ^:parallel unwrap-singleton-form-test
  (testing "unwraps nested singletons but stops at scalar-sequential"
    (is (= [5] (coercions/unwrap-singleton-form [[[[5]]]]))))
  (testing "stops at operator tuples"
    (is (= ["field" 1] (coercions/unwrap-singleton-form [[["field" 1]]]))))
  (testing "passes through non-singleton vectors"
    (is (= [1 2] (coercions/unwrap-singleton-form [1 2]))))
  (testing "passes through scalars"
    (is (= "hello" (coercions/unwrap-singleton-form "hello")))
    (is (= 42 (coercions/unwrap-singleton-form 42)))))

(deftest ^:parallel normalize-percentile-value-test
  (testing "converts whole-number percentages to fractions"
    (is (= 0.9 (coercions/normalize-percentile-value 90)))
    (is (= 0.5 (coercions/normalize-percentile-value 50)))
    (is (= 1.0 (coercions/normalize-percentile-value 100))))
  (testing "passes through values already in fraction form"
    (is (= 0.9 (coercions/normalize-percentile-value 0.9)))
    (is (= 0.5 (coercions/normalize-percentile-value 0.5))))
  (testing "boundary: 1.0 is already a fraction"
    (is (= 1.0 (coercions/normalize-percentile-value 1.0))))
  (testing "passes through non-numbers"
    (is (= "abc" (coercions/normalize-percentile-value "abc")))))

(deftest ^:parallel normalize-join-conditions-test
  (testing "unwraps extra singleton nesting"
    (is (= [["=" ["field" 1] ["field" 2]]]
           (coercions/normalize-join-conditions [[["=" ["field" 1] ["field" 2]]]]))))
  (testing "leaves properly-structured conditions alone"
    (is (= [["=" ["field" 1] ["field" 2]]]
           (coercions/normalize-join-conditions [["=" ["field" 1] ["field" 2]]]))))
  (testing "handles deeply nested singleton wrapping"
    (is (= [["=" ["field" 1] ["field" 2]]]
           (coercions/normalize-join-conditions [[[["=" ["field" 1] ["field" 2]]]]])))))

(deftest ^:parallel normalize-map-key-test
  (testing "converts string keys to keywords"
    (is (= :foo (coercions/normalize-map-key "foo"))))
  (testing "passes through keyword keys"
    (is (= :bar (coercions/normalize-map-key :bar))))
  (testing "passes through non-string keys"
    (is (= 42 (coercions/normalize-map-key 42)))))
