(ns metabase.lib.drill-thru.compare-aggregations-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]))

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
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/compare-aggregations
    :click-type  :header
    :query-type  :aggregated
    :query-kinds [:mbql]
    :column-name "count"
    :expected    {:lib/type    :metabase.lib.drill-thru/drill-thru
                  :type        :drill-thru/compare-aggregations
                  :aggregation [:count {}]}}))

(deftest ^:parallel returns-compare-aggregations-for-multi-stage-queries-test
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type   :drill-thru/compare-aggregations
    :click-type   :header
    :query-type   :aggregated
    :query-kinds  [:mbql]
    :column-name  "count"
    :custom-query (let [base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                       (lib/aggregate (lib/count))
                                       (lib/breakout (meta/field-metadata :orders :product-id))
                                       lib/append-stage)
                        count-col  (m/find-first #(= (:name %) "count")
                                                 (lib/returned-columns base-query))
                        _          (is (some? count-col))
                        query      (lib/filter base-query (lib/> count-col 0))]
                    query)
    :custom-row   {"PRODUCT_ID" 3
                   "count"      77}
    :expected     {:lib/type    :metabase.lib.drill-thru/drill-thru
                   :type        :drill-thru/compare-aggregations
                   :aggregation [:count {}]}}))

(deftest ^:parallel compare-aggregations-not-returned-for-non-aggregation-cols-test
  (lib.drill-thru.tu/test-drill-not-returned
   {:drill-type  :drill-thru/compare-aggregations
    :click-type  :header
    :query-kinds [:mbql]
    :query-type  :aggregated
    :query-table "ORDERS"
    :column-name "CREATED_AT"}))
