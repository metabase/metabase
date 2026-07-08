(ns metabase.lib.filter.negate-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.filter.negate :as lib.filter.negate]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- negate-boolean-expression [expr]
  (lib.filter.negate/negate-boolean-expression (lib/normalize expr)))

(deftest ^:parallel negate-simple-filter-clause-test-1
  (testing :=
    (is (=? [:!= {} [:field {} 1] 10]
            (negate-boolean-expression [:= {} [:field {} 1] 10])))))

(deftest ^:parallel negate-simple-filter-clause-test-2
  (testing :!=
    (is (=? [:= {} [:field {} 1] 10]
            (negate-boolean-expression [:!= {} [:field {} 1] 10])))))

(deftest ^:parallel negate-simple-filter-clause-test-3
  (testing :>
    (is (=? [:<= {} [:field {} 1] 10]
            (negate-boolean-expression [:> {} [:field {} 1] 10])))))

(deftest ^:parallel negate-simple-filter-clause-test-4
  (testing :<
    (is (=? [:>= {} [:field {} 1] 10]
            (negate-boolean-expression [:< {} [:field {} 1] 10])))))

(deftest ^:parallel negate-simple-filter-clause-test-5
  (testing :>=
    (is (=? [:< {} [:field {} 1] 10]
            (negate-boolean-expression [:>= {} [:field {} 1] 10])))))

(deftest ^:parallel negate-simple-filter-clause-test-6
  (testing :<=
    (is (=? [:> {} [:field {} 1] 10]
            (negate-boolean-expression [:<= {} [:field {} 1] 10])))))

(deftest ^:parallel negate-simple-filter-clause-test-7
  (testing :between
    (is (=? [:or {} [:< {} [:field {} 1] 10] [:> {} [:field {} 1] 20]]
            (negate-boolean-expression [:between {} [:field {} 1] 10 20])))))

(deftest ^:parallel negate-simple-filter-clause-test-8
  (testing :contains
    (is (=? [:not {} [:contains {} [:field {} 1] "ABC"]]
            (negate-boolean-expression [:contains {} [:field {} 1] "ABC"])))))

(deftest ^:parallel negate-simple-filter-clause-test-9
  (testing :starts-with
    (is (=? [:not {} [:starts-with {} [:field {} 1] "ABC"]]
            (negate-boolean-expression [:starts-with {} [:field {} 1] "ABC"])))))

(deftest ^:parallel negate-simple-filter-clause-test-10
  (testing :ends-with
    (is (=? [:not {} [:ends-with {} [:field {} 1] "ABC"]]
            (negate-boolean-expression [:ends-with {} [:field {} 1] "ABC"])))))

(deftest ^:parallel negate-compund-filter-clause-test-1
  (testing :not
    (is (=? [:= {} [:field {} 1] 10]
            (negate-boolean-expression
             [:not {} [:= {} [:field {} 1] 10]])) "negating `:not` should simply unwrap the clause")))

(deftest ^:parallel negate-compund-filter-clause-test-2
  (testing :and
    (is (=? [:or {} [:!= {} [:field {} 1] 10] [:!= {} [:field {} 2] 20]]
            (negate-boolean-expression
             [:and
              {}
              [:= {} [:field {} 1] 10]
              [:= {} [:field {} 2] 20]])))))

(deftest ^:parallel negate-compund-filter-clause-test-3
  (testing :or
    (is (=? [:and {}
             [:= {} [:field {} 1] 10]
             [:= {} [:field {} 2] 20]]
            (negate-boolean-expression [:or {} [:!= {} [:field {} 1] 10] [:!= {} [:field {} 2] 20]])))))

(deftest ^:parallel negate-syntactic-sugar-filter-clause-test-1
  (testing "= with extra args"
    (is (=? [:and {}
             [:!= {} [:field {} 1] 10]
             [:!= {} [:field {} 1] 20]
             [:!= {} [:field {} 1] 30]]
            (negate-boolean-expression [:= {} [:field {} 1] 10 20 30])))))

(deftest ^:parallel negate-syntactic-sugar-filter-clause-test-2
  (testing "!= with extra args"
    (is (=? [:or {} [:= {} [:field {} 1] 10] [:= {} [:field {} 1] 20] [:= {} [:field {} 1] 30]]
            (negate-boolean-expression [:!= {} [:field {} 1] 10 20 30])))))

(deftest ^:parallel negate-syntactic-sugar-filter-clause-test-3
  (testing :time-interval
    (is (=? [:!= {} [:field {:temporal-unit :week} 1] [:relative-datetime {} 0 :week]]
            (negate-boolean-expression [:time-interval {} [:field {} 1] :current :week])))))

(deftest ^:parallel negate-syntactic-sugar-filter-clause-test-4
  (testing :time-interval
    (is (=? [:!= {} [:expression {:temporal-unit :week} "CC"] [:relative-datetime {} 0 :week]]
            (negate-boolean-expression [:time-interval {} [:expression {} "CC"] :current :week])))))

(deftest ^:parallel negate-syntactic-sugar-filter-clause-test-5
  (testing :is-null
    (is (=? [:!= {} [:field {} 1] nil]
            (negate-boolean-expression [:is-null {} [:field {} 1]])))))

(deftest ^:parallel negate-syntactic-sugar-filter-clause-test-6
  (testing :not-null
    (is (=? [:= {} [:field {} 1] nil]
            (negate-boolean-expression [:not-null {} [:field {} 1]])))))

(deftest ^:parallel negate-syntactic-sugar-filter-clause-test-7
  (testing :inside
    (is (=? [:or
             {}
             [:< {} [:field {} 1] -10.0]
             [:> {} [:field {} 1] 10.0]
             [:< {} [:field {} 2] -20.0]
             [:> {} [:field {} 2] 20.0]]
            (negate-boolean-expression
             [:inside {} [:field {} 1] [:field {} 2] 10.0 -20.0 -10.0 20.0])))))
