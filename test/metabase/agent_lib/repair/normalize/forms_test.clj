(ns metabase.agent-lib.repair.normalize.forms-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.repair.normalize.forms :as forms]))

(deftest ^:parallel expression-definition-tuple-test
  (testing "recognizes expression definitions"
    (is (true? (forms/expression-definition-tuple? ["expression" "Net Total" ["-" ["field" 1] 10]]))))
  (testing "rejects wrong operator"
    (is (false? (forms/expression-definition-tuple? ["filter" "Name" ["-" 1 2]]))))
  (testing "rejects wrong arity"
    (is (false? (forms/expression-definition-tuple? ["expression" "Name"])))
    (is (false? (forms/expression-definition-tuple? ["expression" "Name" 1 2]))))
  (testing "rejects blank name"
    (is (false? (forms/expression-definition-tuple? ["expression" "" ["-" 1 2]]))))
  (testing "rejects non-vectors"
    (is (false? (forms/expression-definition-tuple? "expression")))))

(deftest ^:parallel temporal-expression-test
  (testing "now literal is temporal"
    (is (true? (forms/temporal-expression? "now")))
    (is (true? (forms/temporal-expression? "NOW"))))
  (testing "temporal tuples are temporal"
    (is (true? (forms/temporal-expression? ["absolute-datetime" "2024-01-01" "day"])))
    (is (true? (forms/temporal-expression? ["relative-datetime" -3 "month"])))
    (is (true? (forms/temporal-expression? ["now"]))))
  (testing "non-temporal values"
    (is (false? (forms/temporal-expression? "hello")))
    (is (false? (forms/temporal-expression? 42)))
    (is (false? (forms/temporal-expression? ["field" 1])))))

(deftest ^:parallel repair-case-args-three-bare-args-test
  (testing "three bare args become branch pair + fallback"
    (is (= [[["pred" "then"]] "else"]
           (forms/repair-case-args ["pred" "then" "else"])))))

(deftest ^:parallel repair-case-args-wrapped-branch-pairs-test
  (testing "single wrapped vector of branch pairs"
    (is (= [[[[">" 1] "a"] [["<" 0] "b"]]]
           (forms/repair-case-args [[[">" 1] "a"] [["<" 0] "b"]])))))

(deftest ^:parallel repair-case-args-wrapped-branch-pairs-with-fallback-test
  (testing "wrapped branches with fallback"
    (is (= [[[[">" 1] "a"]] "default"]
           (forms/repair-case-args [[[">" 1] "a"] "default"])))))

(deftest ^:parallel repair-case-args-leading-branch-pairs-test
  (testing "leading branch pairs followed by fallback"
    (is (= [[[[">" 1] "a"]] "default"]
           (forms/repair-case-args [[[">" 1] "a"] "default"])))))

(deftest ^:parallel repair-case-args-flat-even-vector-test
  (testing "flat even-length vector inside wrapper"
    (is (= [[[1 2] [3 4]]]
           (forms/repair-case-args [[1 2 3 4]])))))

(deftest ^:parallel repair-case-args-else-branch-test
  (testing "else branch is split out"
    (is (= [[[[">" 1] "a"]] "fallback"]
           (forms/repair-case-args [[[">" 1] "a"] ["else" "fallback"]])))))

(deftest ^:parallel repair-between-bounds-test
  (testing "wraps ISO date when other bound is temporal"
    (is (= [["field" 1] ["relative-datetime" -3 "month"] ["absolute-datetime" "2025-09-30" "day"]]
           (forms/repair-between-bounds
            [["field" 1] ["relative-datetime" -3 "month"] "2025-09-30"]))))
  (testing "wraps now literal into expression"
    (is (= [["field" 1] ["relative-datetime" -3 "month"] ["now"]]
           (forms/repair-between-bounds
            [["field" 1] ["relative-datetime" -3 "month"] "now"]))))
  (testing "leaves non-temporal bounds unchanged"
    (is (= [["field" 1] 10 20]
           (forms/repair-between-bounds [["field" 1] 10 20])))))

(deftest ^:parallel repair-operator-form-field-coercion-test
  (testing "coerces field id string to integer"
    (is (= ["field" 42]
           (forms/repair-operator-form identity ["field" "42"])))))

(deftest ^:parallel repair-operator-form-is-null-test
  (testing "is with null becomes is-null"
    (is (= ["is-null" ["field" 1]]
           (forms/repair-operator-form identity ["is" ["field" 1] "null"]))))
  (testing "is with non-null becomes ="
    (is (= ["=" ["field" 1] "hello"]
           (forms/repair-operator-form identity ["is" ["field" 1] "hello"])))))

(deftest ^:parallel repair-operator-form-is-not-null-test
  (testing "is-not with null becomes not-null"
    (is (= ["not-null" ["field" 1]]
           (forms/repair-operator-form identity ["is-not" ["field" 1] nil]))))
  (testing "is-not with non-null becomes !="
    (is (= ["!=" ["field" 1] "hello"]
           (forms/repair-operator-form identity ["is-not" ["field" 1] "hello"])))))

(deftest ^:parallel repair-operator-form-eq-with-sequential-promotes-to-in-test
  (testing "= with sequential RHS promotes to in"
    (is (= ["in" ["field" 1] ["a" "b"]]
           (forms/repair-operator-form identity ["=" ["field" 1] ["a" "b"]])))))

(deftest ^:parallel repair-operator-form-neq-with-sequential-promotes-to-not-in-test
  (testing "!= with sequential RHS promotes to not-in"
    (is (= ["not-in" ["field" 1] ["a" "b"]]
           (forms/repair-operator-form identity ["!=" ["field" 1] ["a" "b"]])))))

(deftest ^:parallel repair-operator-form-contains-strips-boolean-flag-test
  (testing "contains strips trailing boolean option"
    (is (= ["contains" ["field" 1] "text"]
           (forms/repair-operator-form identity ["contains" ["field" 1] "text" false]))))
  (testing "contains strips trailing map option"
    (is (= ["contains" ["field" 1] "text"]
           (forms/repair-operator-form identity ["contains" ["field" 1] "text" {:case-sensitive false}])))))

(deftest ^:parallel repair-operator-form-with-temporal-bucket-extraction-alias-test
  (testing "with-temporal-bucket rewrites extraction aliases"
    (is (= ["get-hour" ["field" 1]]
           (forms/repair-operator-form identity ["with-temporal-bucket" ["field" 1] "hour-of-day"])))
    (is (= ["get-day-of-week" ["field" 1]]
           (forms/repair-operator-form identity ["with-temporal-bucket" ["field" 1] "day-of-week"]))))
  (testing "non-extraction buckets pass through"
    (is (= ["with-temporal-bucket" ["field" 1] "month"]
           (forms/repair-operator-form identity ["with-temporal-bucket" ["field" 1] "month"])))))

(deftest ^:parallel repair-operator-form-percentile-test
  (testing "normalizes percentile scale"
    (is (= ["percentile" ["field" 1] 0.9]
           (forms/repair-operator-form identity ["percentile" ["field" 1] 90])))))

(deftest ^:parallel repair-operator-form-case-from-if-test
  (testing "if alias normalizes to case with three args"
    (is (= ["case" [["> 1" "then"]] "else"]
           (forms/repair-operator-form identity ["if" "> 1" "then" "else"])))))

(deftest ^:parallel repair-operator-form-passthrough-test
  (testing "unrecognized-but-valid operators pass through"
    (is (= ["+" 1 2]
           (forms/repair-operator-form identity ["+" 1 2])))))
