(ns metabase.lib.drill-thru.summarize-column-test
  (:require
   [clojure.test :refer [deftest testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.types.isa :as lib.types.isa]))

(deftest ^:parallel summarize-column-availability-test
  (testing "summarize-column is available for column headers with no aggregations or breakouts"
    (canned/canned-test
      :drill-thru/summarize-column
      (fn [test-case context {:keys [click]}]
        (and (= click :header)
             (not (:native? test-case))
             (zero? (:aggregations test-case))
             (zero? (:breakouts test-case))
             (not (lib.types.isa/structured? (:column context))))))))

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

(deftest ^:parallel custom-column-test
  (testing "#34957"
    (lib.drill-thru.tu/test-drill-application
     {:drill-type     :drill-thru/summarize-column
      :click-type     :header
      :query-type     :unaggregated
      :custom-query   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/expression "CustomColumn" (lib/+ 1 1)))
      :custom-row     (assoc (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row])
                             "CustomColumn" 2)
      :column-name    "CustomColumn"
      :expected       {:type         :drill-thru/summarize-column
                       :column       {:name "CustomColumn"}
                       :aggregations [:distinct :sum :avg]}
      :drill-args     ["sum"]
      :expected-query {:stages
                       [{:lib/type     :mbql.stage/mbql,
                         :source-table (meta/id :orders)
                         :expressions  [[:+ {:lib/expression-name "CustomColumn"} 1 1]]
                         :aggregation  [[:sum {} [:expression {} "CustomColumn"]]]}]}})))
