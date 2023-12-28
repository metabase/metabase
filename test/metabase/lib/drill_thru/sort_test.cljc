(ns metabase.lib.drill-thru.sort-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.sort :as lib.drill-thru.sort]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel sort-e2e-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        drill (lib.drill-thru.sort/sort-drill query
                                              -1
                                              {:column     (meta/field-metadata :orders :id)
                                               :column-ref (lib/ref (meta/field-metadata :orders :id))
                                               :value      nil})]
    (is (=? {:type            :drill-thru/sort
             :column          {:id (meta/id :orders :id)}
             :sort-directions [:asc :desc]}
            drill))
    ;; fails: invalid output: missing display name
    ;; disabled for now because display info seems to be broken
    #_(is (= :neat
             (lib/display-info query drill)))
    ;; fails: no drill-thru-method
    (are [actual] (=? {:stages [{:lib/type :mbql.stage/mbql
                                 :order-by [[:asc {} [:field {} (meta/id :orders :id)]]]}]}
                      actual)
      (lib/drill-thru query drill)
      (lib/drill-thru query -1 drill)
      (lib/drill-thru query -1 drill :asc)
      (mu/disable-enforcement
        (lib/drill-thru query -1 drill "asc")))
    (testing "Handle JS input correctly (#34342)"
      (mu/disable-enforcement
        (is (=? {:query {:source-table (meta/id :orders)
                         :order-by     [[:asc
                                         [:field
                                          (meta/id :orders :id)
                                          {:base-type :type/BigInteger}]]]}}
                (lib.convert/->legacy-MBQL (lib/drill-thru query -1 drill "asc"))))))
    (is (=? {:stages [{:lib/type :mbql.stage/mbql
                       :order-by [[:desc {} [:field {} (meta/id :orders :id)]]]}]}
            (lib/drill-thru query -1 drill :desc)))))

(deftest ^:parallel aggregate-column-e2e-test
  (testing "Sort drills should be suggested/work for aggregate columns like count (#34185)"
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
      (let [drill (lib.drill-thru.sort/sort-drill query -1 context)]
        (is (=? {:lib/type        :metabase.lib.drill-thru/drill-thru
                 :type            :drill-thru/sort
                 :column          {:name "count"}
                 :sort-directions [:asc :desc]}
                drill))
        (testing "Apply the drill"
          (is (=? {:stages [{:aggregation [[:count {}]]
                             :breakout    [[:field {} (meta/id :orders :product-id)]]
                             :order-by    [[:desc
                                            {}
                                            [:aggregation {} string?]]]}]}
                  (lib/drill-thru query -1 drill :desc))))))))

(deftest ^:parallel remove-existing-sort-test
  (testing "Applying sort to already sorted column should REPLACE original sort (#34497)"
    ;; technically this query doesn't make sense, how are you supposed to have a max aggregation and then also order
    ;; by a different column, but MBQL doesn't enforce that,
    (let [query   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/order-by (meta/field-metadata :orders :user-id))
                      (lib/order-by (meta/field-metadata :orders :id)))
          user-id (meta/field-metadata :orders :user-id)
          context {:column     user-id
                   :column-ref (lib/ref user-id)
                   :value      nil}
          drill   (lib.drill-thru.sort/sort-drill query -1 context)]
      (is (=? {:stages
               [{:order-by [[:asc {} [:field {} (meta/id :orders :user-id)]]
                            [:asc {} [:field {} (meta/id :orders :id)]]]}]}
              query))
      (is (=? {:lib/type        :metabase.lib.drill-thru/drill-thru
               :type            :drill-thru/sort
               :column          {:name "USER_ID"}
               :sort-directions [:desc]}
              drill))
      (testing "We should REPLACE the original sort, as opposed to removing it and appending a new one"
        (is (=? {:stages
                 [{:order-by [[:desc {} [:field {} (meta/id :orders :user-id)]]
                              [:asc {} [:field {} (meta/id :orders :id)]]]}]}
                (lib/drill-thru query -1 drill :desc)))))))

(deftest ^:parallel returns-sort-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/sort
    :click-type  :header
    :query-type  :unaggregated
    :column-name "ID"
    :expected    {:type :drill-thru/sort, :sort-directions [:asc :desc]}}))

(deftest ^:parallel returns-sort-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/sort
    :click-type  :header
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type :drill-thru/sort, :sort-directions [:asc :desc]}}))

(deftest ^:parallel returns-sort-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/sort
    :click-type  :header
    :query-type  :unaggregated
    :column-name "TOTAL"
    :expected    {:type :drill-thru/sort, :sort-directions [:asc :desc]}}))

(deftest ^:parallel returns-sort-test-4
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type   :drill-thru/sort
    :click-type   :header
    :query-type   :unaggregated
    :column-name  "TOTAL"
    :custom-query (-> (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                      (lib/order-by (meta/field-metadata :orders :total) :desc))
    :expected     {:type :drill-thru/sort, :sort-directions [:asc]}}))

(deftest ^:parallel returns-sort-test-5
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/sort
    :click-type  :header
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type :drill-thru/sort, :sort-directions [:asc :desc]}}))

(deftest ^:parallel returns-sort-test-6
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type   :drill-thru/sort
    :click-type   :header
    :query-type   :unaggregated
    :column-name  "CREATED_AT"
    :custom-query (-> (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :query])
                      (lib/order-by (meta/field-metadata :orders :created-at) :asc))
    :expected     {:type :drill-thru/sort, :sort-directions [:desc]}}))

(deftest ^:parallel returns-sort-test-7
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/sort
    :click-type  :header
    :query-type  :aggregated
    :column-name "CREATED_AT"
    :expected    {:type :drill-thru/sort, :sort-directions [:asc :desc]}}))

(deftest ^:parallel returns-sort-test-8
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/sort
    :click-type  :header
    :query-type  :aggregated
    :column-name "PRODUCT_ID"
    :expected    {:type :drill-thru/sort, :sort-directions [:asc :desc]}}))

(deftest ^:parallel returns-sort-test-9
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/sort
    :click-type  :header
    :query-type  :aggregated
    :column-name "count"
    :expected    {:type :drill-thru/sort, :sort-directions [:asc :desc]}}))

(deftest ^:parallel returns-sort-test-10
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type   :drill-thru/sort
    :click-type   :header
    :query-type   :aggregated
    :column-name  "count"
    :custom-query (-> (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :query])
                      (lib/order-by (meta/field-metadata :orders :created-at) :asc))
    :expected     {:type :drill-thru/sort, :sort-directions [:asc :desc]}}))

(deftest ^:parallel returns-sort-test-11
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/sort
    :click-type  :header
    :query-type  :aggregated
    :column-name "max"
    :expected    {:type :drill-thru/sort, :sort-directions [:asc :desc]}}))

(deftest ^:parallel returns-sort-test-12
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type   :drill-thru/sort
    :click-type   :header
    :query-type   :aggregated
    :column-name  "CREATED_AT"
    :custom-query (->
                   (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :query])
                   (lib/order-by (meta/field-metadata :orders :created-at) :asc))
    :expected     {:type :drill-thru/sort, :sort-directions [:desc]}}))

(deftest ^:parallel custom-column-test
  (testing "should support sorting for custom column without table relation (metabase#34499)"
    (let [query (as-> (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :query]) query
                  (lib/expression query "CustomColumn" (lib/+ 1 1))
                  (lib/expression query "CustomTax" (lib/+ (meta/field-metadata :orders :tax) 2))
                  (lib/aggregate query (lib/avg (lib/expression-ref query "CustomTax")))
                  (lib/breakout query (lib/expression-ref query "CustomColumn")))
          row   (merge (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row])
                       {"CustomColumn" 2
                        "avg"          13.2})]
      (lib.drill-thru.tu/test-drill-application
       {:column-name    "CustomColumn"
        :click-type     :header
        :query-type     :aggregated
        :custom-query   query
        :custom-row     row
        :drill-type     :drill-thru/sort
        :expected       {:type            :drill-thru/sort
                         :column          {:name "CustomColumn"}
                         :sort-directions [:asc :desc]}
        :expected-query {:stages [{:order-by [[:asc {} [:expression {} "CustomColumn"]]]}]}}))))
