(ns metabase.lib.drill-thru.column-filter-test
  (:require
   [clojure.test :refer [deftest]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]))

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
