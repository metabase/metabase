(ns metabase.lib.drill-thru.column-filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel returns-column-filter-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "ID"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "TAX"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-4
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "DISCOUNT"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-5
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type :drill-thru/column-filter, :initial-op nil}}))

(deftest ^:parallel returns-column-filter-test-6
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-7
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :aggregated
    :column-name "PRODUCT_ID"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-8
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :aggregated
    :column-name "PRODUCT_ID"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-9
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :aggregated
    :column-name "CREATED_AT"
    :expected    {:type :drill-thru/column-filter, :initial-op nil}}))

;;; FIXME column-filter should be available for aggregated query metric column (#34223)
(deftest ^:parallel returns-column-filter-test-10
  #_(lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/column-filter
      :click-type  :header
      :query-type  :aggregated
      :column-name "count"
      :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

;;; FIXME column-filter should be available for aggregated query metric column (#34223)
(deftest ^:parallel returns-column-filter-test-11
  #_(lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/column-filter
      :click-type  :header
      :query-type  :aggregated
      :column-name "max"
      :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel aggregation-adds-extra-stage-test
  (testing "filtering an aggregation column adds an extra stage"
    (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :products :category)))
          [_category
           count-col] (lib/returned-columns query)
          new-stage   (lib/append-stage query)]
      (is (=? {:lib/type     :metabase.lib.drill-thru/drill-thru
               :type         :drill-thru/column-filter
               :query        new-stage
               :stage-number -1
               :column       (->> new-stage
                                  lib/filterable-columns
                                  (m/find-first #(= (:name %) "count")))}
              (->> {:column     count-col
                    :column-ref (lib/ref count-col)
                    :value      nil}
                   (lib/available-drill-thrus query -1)
                   (m/find-first #(= (:type %) :drill-thru/column-filter))))))))

(deftest ^:parallel aggregation-existing-extra-stage-test
  (testing "filtering an aggregation column uses an existing later stage"
    (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :products :category))
                          (lib/append-stage))
          [_category
           count-col] (lib/returned-columns query 0 (-> query :stages first))] ;; NOTE: columns of the first stage
      (is (=? {:lib/type     :metabase.lib.drill-thru/drill-thru
               :type         :drill-thru/column-filter
               :query        query
               :stage-number 1
               :column       (-> query lib/returned-columns second)}
              (->> {:column     count-col
                    :column-ref (lib/ref count-col)
                    :value      nil}
                   (lib/available-drill-thrus query 0)
                   (m/find-first #(= (:type %) :drill-thru/column-filter))))))))

(deftest ^:parallel no-aggregation-no-extra-stage-test
  (testing "filtering a non-aggregation column does not add another stage"
    (let [query      (lib/query meta/metadata-provider (meta/table-metadata :orders))
          subtotal   (m/find-first #(= (:name %) "SUBTOTAL")
                                   (lib/returned-columns query))]
      (is (=? {:lib/type     :metabase.lib.drill-thru/drill-thru
               :type         :drill-thru/column-filter
               :query        query
               :stage-number -1
               ;; The filterable-columns counterpart is returned, not the plain column.
               :column       {:lib/type  :metadata/column
                              :name      "SUBTOTAL"
                              :id        (meta/id :orders :subtotal)
                              :operators (fn [ops]
                                           (every? (every-pred map? #(= (:lib/type %) :operator/filter)) ops))}}
              (->> {:column     subtotal
                    :column-ref (lib/ref subtotal)
                    :value      nil}
                   (lib/available-drill-thrus query -1)
                   (m/find-first #(= (:type %) :drill-thru/column-filter))))))))
