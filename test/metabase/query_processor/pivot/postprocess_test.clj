(ns metabase.query-processor.pivot.postprocess-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.pivot.postprocess :as process]))

(def ^:private column-titles
  ["A" "B" "C" "D" "pivot-grouping" "MEASURE"])

(def ^:private pivot-spec
  {:pivot-rows [2 3]
   :pivot-cols [0 1]
   :column-titles column-titles})

(deftest add-pivot-measures-test
  (testing "Given a `pivot-spec` without `:pivot-measures`, add them."
    (is (= [5] (:pivot-measures (process/add-pivot-measures pivot-spec))))))

(deftest pivot-aggregation-test
  (testing "The pivot aggregation datastructure stores values as expected"
    (let [pivot-config {:pivot-rows     [0]
                        :pivot-cols     [1]
                        :column-titles  ["A" "B" "pivot-grouping" "Count"]
                        :row-totals?    true
                        :col-totals?    true
                        :pivot-measures [3]
                        :pivot-grouping 2}
          pivot        (process/init-pivot pivot-config)
          pivot-data   (reduce process/add-row pivot [["aA" "bA" 0 1] ; add 4 rows in aA bA
                                                      ["aA" "bA" 0 1]
                                                      ["aA" "bA" 0 1]
                                                      ["aA" "bA" 0 1]
                                                      ["aA" "bB" 0 1]
                                                      ["aA" "bC" 0 1]
                                                      ["aA" "bD" 0 1]
                                                      ["aB" "bA" 0 1]
                                                      ["aB" "bB" 0 1]
                                                      ["aB" "bC" 0 1]
                                                      ["aB" "bD" 0 1]])]
      (testing "data aggregation matches the input rows"
        ;; Every row will contribute to the MEASURE somewhere, determined by
        ;; the values in each pivot-row and pivot-col index. For example,
        ;; given the pivot-config in this test, the row `["X" "Y" 0 1]` will end up adding
        ;; {"X" {"Y" {3 1}}}
        ;; the operation is essentially an assoc-in done per measure:

        ;;   assoc-in    path from rows cols and measures            value from measure idx
        ;; `(assoc-in (concat pivot-rows pivot-cols pivot-measures) (get-in row measure-idx))`
        (is (= {"aA" {"bA" {3 4} "bB" {3 1} "bC" {3 1} "bD" {3 1}}
                "aB" {"bA" {3 1} "bB" {3 1} "bC" {3 1} "bD" {3 1}}}
               (:data pivot-data)))

        ;; all distinct values encountered for each row/col index are stored
        ;; this is necessary to construct the headers as well as the combinations
        ;; that make up the 'paths' to get measure values for every cell in the pivot table
        (is (= {:row-values {0 #{"aA" "aB"}}
                :column-values {1 #{"bA" "bB" "bC" "bD"}}}
               (select-keys pivot-data [:row-values :column-values])))

        ;; since everything is aggregated as a row is added, we can store all of the
        ;; relevant totals right away and use them to construct the pivot table totals
        ;; if the user has specified them on (they're on by default and likely to be on most of the time)
        (is (= {:grand-total {3 11}
                :section-totals {"aA" {3 7} "aB" {3 4}} ;; section refers to the 'row totals' interspersed between each row-wise group
                :column-totals {"aA" {"bA" {3 4} "bB" {3 1} "bC" {3 1} "bD" {3 1}}
                                "aB" {"bA" {3 1} "bB" {3 1} "bC" {3 1} "bD" {3 1}}}
                "aA" {3 7}
                "aB" {3 4}
                "bC" {3 2}
                "bB" {3 2}
                "bD" {3 2}
                "bA" {3 5}}
               (:totals pivot-data)))))))
