(ns metabase.query-processor.pivot.postprocess-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]))

(def ^:private pivot-base-rows
  (for [a ["AA" "AB" "AC" "AD"]
        b ["BA" "BB" "BC" "BD"]
        c ["CA" "CB" "CC" "CD"]
        d ["DA" "DB" "DC" "DD"]]
    [a b c d 0 1]))

(def ^:private column-titles
  ["A" "B" "C" "D" "pivot-grouping" "MEASURE"])

(def ^:private pivot-spec
  {:pivot-rows [2 3]
   :pivot-cols [0 1]
   :column-titles column-titles})

(deftest add-pivot-measures-test
  (testing "Given a `pivot-spec` without `:pivot-measures`, add them."
    (is (= [5] (:pivot-measures (#'qp.pivot.postprocess/add-pivot-measures pivot-spec))))))

(deftest all-values-for-test
  (testing "The `all-values-for` function correctly finds the values for the given column idx"
    (doseq [[idx include-nil? expected-values] [[0 true  ["AA" "AB" "AC" "AD" nil]]
                                                [1 false ["BA" "BB" "BC" "BD"]]
                                                [2 true  ["CA" "CB" "CC" "CD" nil]]
                                                [3 false ["DA" "DB" "DC" "DD"]]
                                                [5 false [1]]]]
      (testing (format "Column index %s has correct expected values." idx)
        (is (= expected-values
               (#'qp.pivot.postprocess/all-values-for pivot-base-rows idx include-nil?)))))))

(deftest header-builder-test
  (testing "The `header-builder` function returns the correctly formed header(s)."
    ;; Title from Pivot Rows, then values from first pivot-cols, then 'Row Totals'
    (is (= [["C" "AA" "AB" "AC" "AD" "Row totals"]]
           (#'qp.pivot.postprocess/header-builder pivot-base-rows (merge
                                                                   pivot-spec
                                                                   {:pivot-cols [0]
                                                                    :pivot-rows [2]}))))
    (is (= [["C" "D" "BA" "BB" "BC" "BD" "Row totals"]]
           (#'qp.pivot.postprocess/header-builder pivot-base-rows (merge
                                                                   pivot-spec
                                                                   {:pivot-cols [1]
                                                                    :pivot-rows [2 3]}))))
    (is (= [["C" "AA" "AA" "AA" "AA" "AB" "AB" "AB" "AB" "AC" "AC" "AC" "AC" "AD" "AD" "AD" "AD" "Row totals"]
            ["C" "BA" "BB" "BC" "BD" "BA" "BB" "BC" "BD" "BA" "BB" "BC" "BD" "BA" "BB" "BC" "BD" "Row totals"]]
           (#'qp.pivot.postprocess/header-builder pivot-base-rows (merge
                                                                   pivot-spec
                                                                   {:pivot-cols [0 1]
                                                                    :pivot-rows [2]}))))
    (is (= [["C" "D" "AA" "AA" "AA" "AA" "AB" "AB" "AB" "AB" "AC" "AC" "AC" "AC" "AD" "AD" "AD" "AD" "Row totals"]
            ["C" "D" "BA" "BB" "BC" "BD" "BA" "BB" "BC" "BD" "BA" "BB" "BC" "BD" "BA" "BB" "BC" "BD" "Row totals"]]
           (#'qp.pivot.postprocess/header-builder pivot-base-rows (merge
                                                                   pivot-spec
                                                                   {:pivot-cols [0 1]
                                                                    :pivot-rows [2 3]}))))))
