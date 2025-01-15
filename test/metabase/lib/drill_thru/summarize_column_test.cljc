(ns metabase.lib.drill-thru.summarize-column-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
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

(deftest ^:parallel summarize-column-not-returned-for-aggregate-or-breakout-cols-test
  (doseq [column-name ["PRODUCT_ID" "CREATED_AT" "count" "sum" "max"]]
    (testing (str "summarize-column drill not returned for ORDERS." column-name)
      (lib.drill-thru.tu/test-drill-not-returned
       {:drill-type  :drill-thru/summarize-column
        :click-type  :header
        :query-kinds [:mbql]
        :query-type  :aggregated
        :query-table "ORDERS"
        :column-name column-name}))))

(deftest ^:parallel summarize-column-not-returned-for-aggregate-or-breakout-cols-for-multi-stage-queries-test
  (doseq [column-name ["PRODUCT_ID" "count"]]
    (testing (str "summarize-column drill not returned for ORDERS." column-name)
      (lib.drill-thru.tu/test-drill-not-returned
       {:drill-type  :drill-thru/summarize-column
        :click-type  :header
        :query-kinds [:mbql]
        :query-type  :aggregated
        :custom-query (let [base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                           (lib/aggregate (lib/count))
                                           (lib/breakout (meta/field-metadata :orders :product-id))
                                           lib/append-stage)
                            count-col  (m/find-first #(= (:name %) "count")
                                                     (lib/returned-columns base-query))
                            _          (is (some? count-col))]
                        (lib/filter base-query (lib/> count-col 0)))
        :custom-row   {"PRODUCT_ID" 3
                       "count"      77}
        :column-name column-name}))))

(deftest ^:parallel custom-column-test
  (testing "#34957"
    (lib.drill-thru.tu/test-drill-application
     {:drill-type      :drill-thru/summarize-column
      :click-type      :header
      :query-type      :unaggregated
      :custom-query    (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/expression "CustomColumn" (lib/+ 1 1)))
      :custom-row      (assoc (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row])
                              "CustomColumn" 2)
      :column-name     "CustomColumn"
      :expected        {:type         :drill-thru/summarize-column
                        :column       {:name "CustomColumn"}
                        :aggregations [:distinct :sum :avg]}
      :drill-args      ["sum"]
      :expected-query  {:stages
                        [{:lib/type     :mbql.stage/mbql,
                          :source-table (meta/id :orders)
                          :expressions  [[:+ {:lib/expression-name "CustomColumn"} 1 1]]
                          :aggregation  [[:sum {} [:expression {} "CustomColumn"]]]}]}
      :expected-native {:stages
                        [{:lib/type    :mbql.stage/mbql,
                          :source-card number?
                          :aggregation [[:sum {} [:field {} "CustomColumn"]]]}]}})))
