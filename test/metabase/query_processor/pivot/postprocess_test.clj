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
