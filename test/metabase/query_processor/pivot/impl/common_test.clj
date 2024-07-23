(ns metabase.query-processor.pivot.impl.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.pivot.impl.common :as qp.pivot.impl.common]))

(deftest ^:parallel group-bitmask-test
  (doseq [[indices expected] {[0]     6
                              [0 1]   4
                              [0 1 2] 0
                              []      7}]
    (is (= expected
           (qp.pivot.impl.common/group-bitmask 3 indices)))))

(deftest ^:parallel powerset-test
  (is (= [[]]
         (qp.pivot.impl.common/powerset [])))
  (is (= [[0] []]
         (qp.pivot.impl.common/powerset [0])))
  (is (= [[0 1] [1] [0] []]
         (qp.pivot.impl.common/powerset [0 1])))
  (is (= [[0 1 2] [1 2] [0 2] [2] [0 1] [1] [0] []]
         (qp.pivot.impl.common/powerset [0 1 2]))))

(deftest ^:parallel breakout-combinations-test
  (testing "Should return the combos that Paul specified in (#14329)"
    (is (= [[0 1 2]
            [0 1]
            [0]
            []]
           (qp.pivot.impl.common/breakout-combinations 3 [0 1 2] [])))))

(deftest ^:parallel breakout-combinations-test-2
  (testing "Should return the combos that Paul specified in (#14329)"
    (is (= (sort-by
            (partial qp.pivot.impl.common/group-bitmask 4)
            [;; primary data
             [0 1 2 3]
             ;; subtotal rows
             [0     3]
             [0 1   3]
             ;; row totals
             [0 1 2]
             ;; subtotal rows within "row totals"
             [0]
             [0 1]
             ;; "grand totals" row
             [      3]
             ;; bottom right corner
             []])
           (qp.pivot.impl.common/breakout-combinations 4 [0 1 2] [3])))))

(deftest ^:parallel breakout-combinations-test-3
  (testing "Should return the combos that Paul specified in (#14329)"
    (testing "If pivot-rows and pivot-cols aren't specified, then just return the powerset"
      (is (= [[0 1 2]
              [  1 2]
              [0   2]
              [    2]
              [0 1]
              [  1]
              [0]
              []]
             (qp.pivot.impl.common/breakout-combinations 3 [] []))))))

(deftest ^:parallel breakout-combinations-test-4
  (testing "I guess in some cases the order of breakouts can change?"
    (is (= [[0 1 2] [1 2] [2] [1 0] [1] []]
           (qp.pivot.impl.common/breakout-combinations 3 [1 0] [2])))))

(deftest ^:parallel validate-pivot-rows-cols-test
  (testing "Should throw an Exception if you pass in invalid pivot-rows"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid pivot-rows: specified breakout at index 3, but we only have 3 breakouts"
         (qp.pivot.impl.common/breakout-combinations 3 [0 1 2 3] []))))
  (testing "Should throw an Exception if you pass in invalid pivot-cols"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid pivot-cols: specified breakout at index 3, but we only have 3 breakouts"
         (qp.pivot.impl.common/breakout-combinations 3 [] [0 1 2 3])))))

;; TODO -- we should require these columns to be distinct as well (I think?)
;; TODO -- require all numbers to be positive
;; TODO -- can you specify something in both pivot-rows and pivot-cols?

(deftest ^:parallel pivot-options-test
  (testing "`pivot-options` correctly generates pivot-rows and pivot-cols from a card's viz settings"
    (let [pivot-options {:pivot-rows [1 0], :pivot-cols [2]}]
      (are [num-breakouts expected] (= expected
                                       (qp.pivot.impl.common/breakout-combinations
                                        num-breakouts
                                        (:pivot-rows pivot-options)
                                        (:pivot-cols pivot-options)))
        3 [[0 1 2]   [1 2] [2] [1 0] [1] []]
        4 [[0 1 2 3] [1 2] [2] [1 0] [1] []]))))

(deftest ^:parallel ignore-bad-pivot-options-test
  (let [pivot-options {:pivot-rows [], :pivot-cols []}]
    (is (= [[0 1] [1] [0] []]
           (qp.pivot.impl.common/breakout-combinations 2 (:pivot-rows pivot-options) (:pivot-cols pivot-options))))))

(deftest ^:parallel nested-question-pivot-options-test
  (testing "#35025"
    (let [pivot-options {:pivot-rows [0], :pivot-cols [1]}]
      (is (= [[0 1] [1] [0] []]
             (qp.pivot.impl.common/breakout-combinations 2 (:pivot-rows pivot-options) (:pivot-cols pivot-options)))))))
