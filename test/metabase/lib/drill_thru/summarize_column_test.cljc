(ns metabase.lib.drill-thru.summarize-column-test
  (:require
   [clojure.test :refer [deftest]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]))

(deftest ^:parallel returns-summarize-column-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column
    :click-type  :header
    :query-type  :unaggregated
    :column-name "ID"
    :expected    {:type :drill-thru/summarize-column, :aggregations [:distinct]}}))

(deftest ^:parallel returns-summarize-column-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column
    :click-type  :header
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type :drill-thru/summarize-column, :aggregations [:distinct]}}))

(deftest ^:parallel returns-summarize-column-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column
    :click-type  :header
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    {:type :drill-thru/summarize-column, :aggregations [:distinct :sum :avg]}}))

(deftest ^:parallel returns-summarize-column-test-4
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column
    :click-type  :header
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type :drill-thru/summarize-column, :aggregations [:distinct]}}))

(deftest ^:parallel returns-summarize-column-test-5
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/summarize-column
    :click-type  :header
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type :drill-thru/summarize-column, :aggregations [:distinct :sum :avg]}}))
