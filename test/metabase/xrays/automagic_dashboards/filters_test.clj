(ns metabase.xrays.automagic-dashboards.filters-test
  (:require
   [clojure.test :refer :all]
   [metabase.xrays.automagic-dashboards.filters :as filters]))

(deftest ^:parallel replace-date-range-test
  (testing "Replace range with the more specific `:=`."
    (is (= [:and
            [:= [:field 2 nil] 42]
            [:= [:field 9 {:source-field 1}] "foo"]]
           (filters/inject-refinement
            [:and
             [:= [:field 9 {:source-field 1}] "foo"]
             [:and
              [:> [:field 2 nil] 10]
              [:< [:field 2 nil] 100]]]
            [:= [:field 2 nil] 42])))))

(deftest ^:parallel merge-using-and-test
  (testing "If there's no overlap between filter clauses, just merge using `:and`."
    (is (= [:and
            [:= [:field 3 nil] 42]
            [:= [:field 9 {:source-field 1}] "foo"]
            [:> [:field 2 nil] 10]
            [:< [:field 2 nil] 100]]
           (filters/inject-refinement
            [:and
             [:= [:field 9 {:source-field 1}] "foo"]
             [:and
              [:> [:field 2 nil] 10]
              [:< [:field 2 nil] 100]]]
            [:= [:field 3 nil] 42])))))
