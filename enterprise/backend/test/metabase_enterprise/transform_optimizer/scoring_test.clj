(ns metabase-enterprise.transform-optimizer.scoring-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transform-optimizer.scoring :as scoring]))

(set! *warn-on-reflection* true)

(deftest optimization-degree-test
  (testing "empty / nil proposal list ⇒ 100 (already optimized)"
    (is (= 100 (scoring/optimization-degree [])))
    (is (= 100 (scoring/optimization-degree nil))))

  (testing "single proposal per severity matches rubric weights"
    (is (= 70 (scoring/optimization-degree [{:severity :high}])))
    (is (= 85 (scoring/optimization-degree [{:severity :medium}])))
    (is (= 95 (scoring/optimization-degree [{:severity :low}]))))

  (testing "weights stack additively"
    (is (= 10 (scoring/optimization-degree
               [{:severity :high} {:severity :high} {:severity :high}])))
    (is (= 70 (scoring/optimization-degree
               [{:severity :medium} {:severity :medium}])))
    (is (= 55 (scoring/optimization-degree
               [{:severity :high} {:severity :medium}]))))

  (testing "score floors at 0; never negative"
    (is (= 0 (scoring/optimization-degree
              (repeat 10 {:severity :high}))))
    (is (= 0 (scoring/optimization-degree
              (repeat 100 {:severity :low})))))

  (testing "severity strings are accepted (keyword coercion)"
    ;; LLM emits JSON strings; we treat "high" and :high identically so
    ;; callers don't have to coerce before passing to scoring.
    (is (= 70 (scoring/optimization-degree [{:severity "high"}])))
    (is (= 85 (scoring/optimization-degree [{:severity "medium"}]))))

  (testing "unknown / missing severities fall back to :low (5)"
    ;; A garbled LLM response shouldn't yield NaN or throw — it should
    ;; degrade gracefully.
    (is (= 95 (scoring/optimization-degree [{:severity :critical}])))
    (is (= 95 (scoring/optimization-degree [{:severity nil}])))
    (is (= 95 (scoring/optimization-degree [{}]))))

  (testing "irrelevant proposal keys are ignored"
    (is (= 70 (scoring/optimization-degree
               [{:severity :high
                 :name "foo"
                 :rationale "bar"
                 :ddl_statements [{:statement "anything"}]}])))))
