(ns metabase.search.scoring-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.scoring :as scoring]))

(deftest normalize-text-test
  (testing "normalize-text lower-cases, strips commas, collapses whitespace runs, and trims"
    (are [in out] (= out (scoring/normalize-text in))
      "Sales, Revenue"     "sales revenue"
      "Sales,  Revenue"    "sales revenue"
      "  Sales   Revenue " "sales revenue"
      "Sales,Revenue"      "sales revenue"
      "SALES"              "sales"
      ""                   "")))
