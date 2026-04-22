(ns metabase.agent-lib.syntax-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.syntax :as syntax]))

(deftest ^:parallel raw-op-name-test
  (testing "returns string for strings"
    (is (= "filter" (syntax/raw-op-name "filter"))))
  (testing "returns name for keywords"
    (is (= "filter" (syntax/raw-op-name :filter))))
  (testing "returns name for symbols"
    (is (= "filter" (syntax/raw-op-name 'filter))))
  (testing "returns nil for other types"
    (is (nil? (syntax/raw-op-name nil)))
    (is (nil? (syntax/raw-op-name 42)))
    (is (nil? (syntax/raw-op-name [])))))

(deftest ^:parallel canonical-op-name-test
  (testing "resolves aliases to canonical names"
    (is (= "case" (syntax/canonical-op-name "if")))
    (is (= "var" (syntax/canonical-op-name "variance")))
    (is (= "relative-datetime" (syntax/canonical-op-name "relative-date")))
    (is (= "datetime-diff" (syntax/canonical-op-name "temporal-diff")))
    (is (= "count-where" (syntax/canonical-op-name "count-if")))
    (is (= "distinct" (syntax/canonical-op-name "count-distinct")))
    (is (= "distinct" (syntax/canonical-op-name "distinct-count")))
    (is (= "not-null" (syntax/canonical-op-name "is-not-null")))
    (is (= "get-day-of-week" (syntax/canonical-op-name "dayofweek")))
    (is (= "get-day-of-week" (syntax/canonical-op-name "day-of-week")))
    (is (= "get-hour" (syntax/canonical-op-name "hour-of-day")))
    (is (= "get-month" (syntax/canonical-op-name "month-of-year")))
    (is (= "get-quarter" (syntax/canonical-op-name "quarter-of-year"))))
  (testing "passes through canonical names unchanged"
    (is (= "filter" (syntax/canonical-op-name "filter")))
    (is (= "count" (syntax/canonical-op-name "count"))))
  (testing "works with keywords and symbols"
    (is (= "case" (syntax/canonical-op-name :if)))
    (is (= "var" (syntax/canonical-op-name 'variance))))
  (testing "returns nil for nil"
    (is (nil? (syntax/canonical-op-name nil)))))

(deftest ^:parallel op-symbol-test
  (testing "normalizes to canonical symbol"
    (is (= 'case (syntax/op-symbol "if")))
    (is (= 'var (syntax/op-symbol "variance")))
    (is (= 'filter (syntax/op-symbol "filter"))))
  (testing "works with keywords and symbols"
    (is (= 'case (syntax/op-symbol :if)))
    (is (= 'filter (syntax/op-symbol 'filter))))
  (testing "returns nil for nil"
    (is (nil? (syntax/op-symbol nil)))))

(deftest ^:parallel possible-operator-tuple-test
  (testing "true for recognized operator tuples"
    (is (true? (syntax/possible-operator-tuple? ["filter" ["=" ["field" 1] 2]])))
    (is (true? (syntax/possible-operator-tuple? ["count"])))
    (is (true? (syntax/possible-operator-tuple? ["aggregate" ["count"]]))))
  (testing "true for alias operators"
    (is (true? (syntax/possible-operator-tuple? ["if" true 1 0])))
    (is (true? (syntax/possible-operator-tuple? ["variance" ["field" 1]]))))
  (testing "false for non-vectors"
    (is (false? (syntax/possible-operator-tuple? "filter")))
    (is (false? (syntax/possible-operator-tuple? {:op "filter"}))))
  (testing "false for unrecognized operators"
    (is (false? (syntax/possible-operator-tuple? ["bogus-op" 1 2])))))

(deftest ^:parallel boolean-wrapper-form-test
  (testing "true for boolean wrappers"
    (is (true? (syntax/boolean-wrapper-form? ["true" ["field" 1]])))
    (is (true? (syntax/boolean-wrapper-form? ["false" ["field" 1]])))
    (is (true? (syntax/boolean-wrapper-form? ["TRUE" ["field" 1]]))))
  (testing "false for wrong arity"
    (is (false? (syntax/boolean-wrapper-form? ["true"])))
    (is (false? (syntax/boolean-wrapper-form? ["true" 1 2]))))
  (testing "false for non-boolean strings"
    (is (false? (syntax/boolean-wrapper-form? ["maybe" ["field" 1]]))))
  (testing "false for non-vectors"
    (is (false? (syntax/boolean-wrapper-form? "true")))))

(deftest ^:parallel top-level-operation-tuple-test
  (testing "true for top-level operations"
    (is (true? (syntax/top-level-operation-tuple? ["filter" ["=" ["field" 1] 2]])))
    (is (true? (syntax/top-level-operation-tuple? ["aggregate" ["count"]])))
    (is (true? (syntax/top-level-operation-tuple? ["breakout" ["field" 1]])))
    (is (true? (syntax/top-level-operation-tuple? ["order-by" ["field" 1]])))
    (is (true? (syntax/top-level-operation-tuple? ["limit" 10]))))
  (testing "false for nested-only operators"
    (is (false? (syntax/top-level-operation-tuple? ["=" ["field" 1] 2])))
    (is (false? (syntax/top-level-operation-tuple? ["field" 1])))
    (is (false? (syntax/top-level-operation-tuple? ["count"])))))

(deftest ^:parallel operator-tuple-test
  (testing "true for recognized string-led operator tuples"
    (is (true? (syntax/operator-tuple? ["count"])))
    (is (true? (syntax/operator-tuple? ["field" 1])))
    (is (true? (syntax/operator-tuple? ["=" ["field" 1] 2]))))
  (testing "false for non-string first element"
    (is (false? (syntax/operator-tuple? [:count])))
    (is (false? (syntax/operator-tuple? [42]))))
  (testing "false for unrecognized operators"
    (is (false? (syntax/operator-tuple? ["bogus" 1 2]))))
  (testing "false for non-vectors"
    (is (false? (syntax/operator-tuple? "count")))))
