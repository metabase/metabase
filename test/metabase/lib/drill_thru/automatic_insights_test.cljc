(ns metabase.lib.drill-thru.automatic-insights-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel returns-automatic-insights-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/automatic-insights
    :click-type  :cell
    :query-type  :aggregated
    :column-name "count"
    :expected    {:type :drill-thru/automatic-insights
                  :column-ref [:aggregation {} u/uuid-regex]
                  :dimensions [{} {}]}}))

(deftest ^:parallel returns-automatic-insights-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/automatic-insights
    :click-type  :cell
    :query-type  :aggregated
    :column-name "sum"
    :expected    {:type :drill-thru/automatic-insights
                  :column-ref [:aggregation {} u/uuid-regex]
                  :dimensions [{} {}]}}))

(deftest ^:parallel returns-automatic-insights-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/automatic-insights
    :click-type  :cell
    :query-type  :aggregated
    :column-name "max"
    :expected    {:type :drill-thru/automatic-insights
                  :column-ref [:aggregation {} u/uuid-regex]
                  :dimensions [{} {}]}}))

(defn- auto-insights [query exp-filters]
  (let [[created-at sum] (lib/returned-columns query)
        drills           (lib/available-drill-thrus
                           query -1 {:column     sum
                                     :column-ref (lib/ref sum)
                                     :value      124.5
                                     :dimensions [{:column     created-at
                                                   :column-ref (lib/ref created-at)
                                                   :value      "2023-12-01"}]})
        drill            (m/find-first #(= (:type %) :drill-thru/automatic-insights) drills)]
    (is (=? {:lib/type :mbql/query
             :stages [{:filters     exp-filters
                       :aggregation (symbol "nil #_\"key is not present.\"")
                       :breakout    (symbol "nil #_\"key is not present.\"")
                       :fields      (symbol "nil #_\"key is not present.\"")}]}
            (lib/drill-thru query -1 drill)))) )

(deftest ^:parallel automatic-insights-apply-test
  (let [filters [[:= {} [:field {} (meta/id :orders :created-at)] "2023-12-01"]]]
    (testing "breakouts are turned to filters, aggregations dropped"
      (auto-insights (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                         (lib/breakout (lib/with-temporal-bucket
                                         (meta/field-metadata :orders :created-at)
                                         :month)))
                     filters))
    (testing "existing filters are dropped"
      (auto-insights (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/filter (lib/= (meta/field-metadata :products :category) "Gizmo"))
                         (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                         (lib/breakout (lib/with-temporal-bucket
                                         (meta/field-metadata :orders :created-at)
                                         :month)))
                     filters))))

(deftest ^:parallel automatic-insights-apply-test-2
  (testing "sum_where(subtotal, products.category = \"Doohickey\") over time"
    (auto-insights (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                       (lib/aggregate (lib/sum-where
                                        (meta/field-metadata :orders :subtotal)
                                        (lib/= (meta/field-metadata :products :category)
                                               "Doohickey")))
                       (lib/breakout (lib/with-temporal-bucket
                                       (meta/field-metadata :orders :created-at)
                                       :month)))
                   [[:= {} [:field {} (meta/id :orders :created-at)] "2023-12-01"]
                    [:= {} [:field {} (meta/id :products :category)] "Doohickey"]])))

(deftest ^:parallel automatic-insights-apply-test-3
  (testing "metric over time"
    (let [metric   {:description "Orders with a subtotal of $100 or more."
                    :archived false
                    :updated-at "2023-10-04T20:11:34.029582"
                    :lib/type :metadata/metric
                    :definition
                    {"source-table" (meta/id :orders)
                     "aggregation" [["count"]]
                     "filter" [">=" ["field" (meta/id :orders :subtotal) nil] 100]}
                    :table-id (meta/id :orders)
                    :name "Large orders"
                    :caveats nil
                    :entity-id "NWMNcv_yhhZIT7winoIdi"
                    :how-is-this-calculated nil
                    :show-in-getting-started false
                    :id 1
                    :database (meta/id)
                    :points-of-interest nil
                    :creator-id 1
                    :created-at "2023-10-04T20:11:34.029582"}
          provider (lib/composed-metadata-provider
                    meta/metadata-provider
                    (providers.mock/mock-metadata-provider {:metrics [metric]}))]
      (auto-insights (-> (lib/query provider (meta/table-metadata :orders))
                         (lib/aggregate metric)
                         (lib/breakout (lib/with-temporal-bucket
                                         (meta/field-metadata :orders :created-at)
                                         :month)))
                     [[:= {} [:field {} (meta/id :orders :created-at)] "2023-12-01"]
                      [:>= {} [:field {} (meta/id :orders :subtotal)] 100]]))))

(deftest ^:parallel binned-column-test
  (testing "Automatic insights for a binned column should generate filters for current bin's min/max values"
    (let [query               (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                  (lib/aggregate (lib/count))
                                  (lib/breakout (-> (meta/field-metadata :orders :quantity)
                                                    (lib/with-binning {:strategy :num-bins, :num-bins 10}))))
          col-count           (m/find-first #(= (:name %) "count")
                                            (lib/returned-columns query))
          _                   (is (some? col-count))
          col-orders-quantity (m/find-first #(= (:name %) "QUANTITY")
                                            (lib/returned-columns query))
          _                   (is (some? col-orders-quantity))
          context             {:column     col-count
                               :column-ref (lib/ref col-count)
                               :value      1
                               :dimensions [{:column     col-orders-quantity
                                             :column-ref (lib/ref col-orders-quantity)
                                             :value      20}]}
          available-drills    (lib/available-drill-thrus query context)
          auto-insights-drill (m/find-first #(= (:type %) :drill-thru/underlying-records)
                                            available-drills)
          _                   (is (some? auto-insights-drill))
          query'              (lib/drill-thru query auto-insights-drill)]
      (is (=? {:stages [{:lib/type :mbql.stage/mbql
                         :filters  [[:>=
                                     {}
                                     [:field
                                      {:binning (symbol "nil #_\"key is not present.\"")}
                                      (meta/id :orders :quantity)]
                                     20]
                                    [:<
                                     {}
                                     [:field
                                      {:binning (symbol "nil #_\"key is not present.\"")}
                                      (meta/id :orders :quantity)]
                                     30.0]]}]}
              query')))))
