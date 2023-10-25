(ns metabase.lib.drill-thru.distribution-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.distribution :as lib.drill-thru.distribution]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel aggregate-column-test
  (testing "Don't suggest distribution drill thrus for aggregate columns like `count(*)`"
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
      (is (nil? (lib.drill-thru.distribution/distribution-drill query -1 context))))))

(deftest ^:parallel returns-distribution-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/distribution
    :click-type  :header
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type :drill-thru/distribution}}))

(deftest ^:parallel returns-distribution-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/distribution
    :click-type  :header
    :query-type  :unaggregated
    :column-name "TAX"
    :expected    {:type :drill-thru/distribution}}))

(deftest ^:parallel returns-distribution-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/distribution
    :click-type  :header
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type :drill-thru/distribution}}))

(deftest ^:parallel apply-to-fk-column-test
  (testing "do not apply binning to FK columns (#34343)"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :column-name    "USER_ID"
      :query-type     :unaggregated
      :drill-type     :drill-thru/distribution
      :expected       {:type   :drill-thru/distribution
                       :column {:name "USER_ID"}}
      :expected-query {:stages [{:source-table (meta/id :orders)
                                 :aggregation  [[:count {}]]
                                 :breakout     [[:field
                                                 {:binning (symbol "nil #_\"key is not present.\"")}
                                                 (meta/id :orders :user-id)]]}]}})))
