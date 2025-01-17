(ns metabase.lib.drill-thru.compare-aggregations-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest testing]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel compare-aggregations-availability-test
  (testing "compare-aggregations is available for any header click on an aggregation column, and nothing else"
    (canned/canned-test
     :drill-thru/compare-aggregations
     (fn [test-case _context {:keys [click column-kind]}]
       (and (= click :header)
            (not (:native? test-case))
            (= :aggregation column-kind))))))

(deftest ^:parallel returns-compare-aggregations-test
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "single-stage query"
   {:drill-type  :drill-thru/compare-aggregations
    :click-type  :header
    :query-type  :aggregated
    :query-kinds [:mbql]
    :column-name "count"
    :expected    {:lib/type    :metabase.lib.drill-thru/drill-thru
                  :type        :drill-thru/compare-aggregations
                  :aggregation [:count {}]}}

   "multi-stage query"
   {:custom-query #(lib.drill-thru.tu/append-filter-stage % "count")}))

(deftest ^:parallel compare-aggregations-not-returned-for-non-aggregation-cols-test
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-drill-not-returned
   "single-stage query"
   {:drill-type  :drill-thru/compare-aggregations
    :click-type  :header
    :query-kinds [:mbql]
    :query-type  :aggregated
    :query-table "ORDERS"
    :column-name "CREATED_AT"}

   "multi-stage query"
   {:custom-query #(lib.drill-thru.tu/append-filter-stage % "count")}))
