(ns metabase.lib.drill-thru.summarize-column-by-time-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.summarize-column-by-time
    :as lib.drill-thru.summarize-column-by-time]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel aggregate-column-test
  (testing "Don't suggest summarize-column-by-time drill thrus for aggregate columns like `count(*)`"
    (let [query     (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/aggregate (lib/count))
                        (lib/breakout (meta/field-metadata :orders :product-id)))
          count-col (m/find-first (fn [col]
                                    (= (:display-name col) "Count"))
                                  (lib/returned-columns query))
          context   {:column     count-col
                     :column-ref (lib/ref count-col)
                     :value      nil}]
      (is (some? count-col))
      (is (nil? (lib.drill-thru.summarize-column-by-time/summarize-column-by-time-drill query -1 context))))))

(deftest ^:parallel returns-summarize-column-by-time-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column-by-time
    :click-type  :header
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    {:type :drill-thru/summarize-column-by-time}}))

(deftest ^:parallel returns-summarize-column-by-time-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column-by-time
    :click-type  :header
    :query-type  :unaggregated
    :column-name "DISCOUNT"
    :expected    {:type :drill-thru/summarize-column-by-time}}))

(deftest ^:parallel returns-summarize-column-by-time-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column-by-time
    :click-type  :header
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type :drill-thru/summarize-column-by-time}}))
