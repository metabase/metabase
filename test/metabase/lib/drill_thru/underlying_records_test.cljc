(ns metabase.lib.drill-thru.underlying-records-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru :as lib.drill-thru]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal])
       :clj  ([java-time.api :as jt]))))

(deftest ^:parallel returns-underlying-records-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/underlying-records
    :click-type  :cell
    :query-type  :aggregated
    :column-name "count"
    :expected    {:type :drill-thru/underlying-records, :row-count 77, :table-name "Orders"}}))

(deftest ^:parallel returns-underlying-records-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/underlying-records
    :click-type  :cell
    :query-type  :aggregated
    :column-name "sum"
    :expected    {:type :drill-thru/underlying-records, :row-count 1, :table-name "Orders"}}))

(deftest ^:parallel returns-underlying-records-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/underlying-records
    :click-type  :cell
    :query-type  :aggregated
    :column-name "max"
    :expected    {:type :drill-thru/underlying-records, :row-count 2, :table-name "Orders"}}))

(deftest ^:parallel returns-underlying-records-test-4-table-name-correct-for-nested-query
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type   :drill-thru/underlying-records
    :click-type   :cell
    :query-type   :aggregated
    :column-name  "count"
    :custom-query (-> (lib/query lib.tu/metadata-provider-with-mock-cards (lib.tu/mock-cards :orders))
                      (lib/aggregate (lib/count))
                      (lib/breakout (lib.metadata/field lib.tu/metadata-provider-with-mock-cards
                                                        (meta/id :orders :created-at))))
    :custom-row   {"CREATED_AT" "2023-12-01"
                   "count"      9}
    :expected     {:type :drill-thru/underlying-records, :row-count 9, :table-name "Mock orders card"}}))

(deftest ^:parallel do-not-return-fk-filter-for-non-fk-column-test
  (testing "underlying-records should only get shown once for aggregated query (#34439)"
    (let [test-case           {:click-type  :cell
                               :query-type  :aggregated
                               :column-name "max"}
          {:keys [query row]} (lib.drill-thru.tu/query-and-row-for-test-case test-case)
          context             (lib.drill-thru.tu/test-case-context query row test-case)]
      (testing (str "\nQuery = \n"   (u/pprint-to-str query)
                    "\nContext =\n" (u/pprint-to-str context))
        (let [drills (lib/available-drill-thrus query context)]
          (testing (str "\nAvailable drills =\n" (u/pprint-to-str drills))
            (is (= 1
                   (count (filter #(= (:type %) :drill-thru/underlying-records)
                                  drills))))))))))


#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def last-month
  #?(:cljs (let [now    (js/Date.)
                 year   (.getFullYear now)
                 month  (.getMonth now)]
             (-> (js/Date.UTC year (dec month))
                 (js/Date.)
                 (.toISOString)))
     :clj  (let [last-month (-> (jt/zoned-date-time (jt/year) (jt/month))
                                (jt/minus (jt/months 1)))]
             (jt/format :iso-offset-date-time last-month))))

(defn- underlying-state [query agg-index agg-value breakout-values exp-filters-fn]
  (let [columns                         (lib/returned-columns query)
        {aggs      :source/aggregations
         breakouts :source/breakouts}   (group-by :lib/source columns)
        agg-column                      (nth aggs agg-index)
        agg-dim                         {:column     agg-column
                                         :column-ref (lib/ref agg-column)
                                         :value      agg-value}]
    (is (= (count breakouts)
           (count breakout-values)))
    (let [breakout-dims (for [[breakout value] (map vector breakouts breakout-values)]
                          {:column     breakout
                           :column-ref (lib/ref breakout)
                           :value      value})
          context       (merge agg-dim
                               {:row        (cons agg-dim breakout-dims)
                                :dimensions breakout-dims})]
      (is (=? {:lib/type :mbql/query
               :stages [{:filters     (exp-filters-fn agg-dim breakout-dims)
                         :aggregation (symbol "nil #_\"key is not present.\"")
                         :breakout    (symbol "nil #_\"key is not present.\"")
                         :fields      (symbol "nil #_\"key is not present.\"")}]}
              (->> (lib.drill-thru/available-drill-thrus query context)
                   (m/find-first #(= (:type %) :drill-thru/underlying-records))
                   (lib.drill-thru/drill-thru query -1)))))))

(deftest ^:parallel underlying-records-apply-test
  (testing "sum(subtotal) over time"
    (underlying-state (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                          (lib/breakout (lib/with-temporal-bucket
                                          (meta/field-metadata :orders :created-at)
                                          :month)))
                      0 #_agg-index
                      42295.12
                      [last-month]
                      (fn [_agg-dim [breakout-dim]]
                        [[:= {}
                          (-> (:column-ref breakout-dim)
                              (lib.options/with-options {:temporal-unit :month}))
                          last-month]]))))

(deftest ^:parallel underlying-records-apply-test-2
  (testing "sum_where(subtotal, products.category = \"Doohickey\") over time"
    (underlying-state (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/sum-where
                                           (meta/field-metadata :orders :subtotal)
                                           (lib/= (meta/field-metadata :products :category)
                                                  "Doohickey")))
                          (lib/breakout (lib/with-temporal-bucket
                                          (meta/field-metadata :orders :created-at)
                                          :month)))
                      0 #_agg-index
                      6572.12
                      [last-month]
                      (fn [_agg-dim [breakout-dim]]
                        [[:= {}
                          (-> (:column-ref breakout-dim)
                              (lib.options/with-options {:temporal-unit :month}))
                          last-month]
                         [:= {} (-> (meta/field-metadata :products :category)
                                    lib/ref
                                    (lib.options/with-options {}))
                          "Doohickey"]]))))

(deftest ^:parallel underlying-records-apply-test-3
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
      (underlying-state (-> (lib/query provider (meta/table-metadata :orders))
                            (lib/aggregate metric)
                            (lib/breakout (lib/with-temporal-bucket
                                            (meta/field-metadata :orders :created-at)
                                            :month)))
                        0 #_agg-index
                        6572.12
                        [last-month]
                        (fn [_agg-dim [breakout-dim]]
                          (let [monthly-breakout (-> (:column-ref breakout-dim)
                                                     (lib.options/with-options {:temporal-unit :month}))
                                subtotal         (-> (meta/field-metadata :orders :subtotal)
                                                     lib/ref
                                                     (lib.options/with-options {}))]
                            [[:=  {} monthly-breakout last-month]
                             [:>= {} subtotal 100]]))))))

(deftest ^:parallel multiple-aggregations-multiple-breakouts-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/aggregate (lib/count))
                  (lib/aggregate (lib/sum (meta/field-metadata :orders :tax)))
                  (lib/aggregate (lib/max (meta/field-metadata :orders :discount)))
                  (lib/breakout  (meta/field-metadata :orders :product-id))
                  (lib/breakout  (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month)))]
    (doseq [[agg-index agg-value] [[0 77]
                                   [1 1]
                                   [2 :null]]]
      (underlying-state query agg-index agg-value
                        [120 last-month]
                        (fn [_agg-dim [product-id-dim created-at-dim]]
                          [[:= {}
                            (-> (:column-ref product-id-dim)
                                (lib.options/update-options dissoc :lib/uuid))
                            120]
                           [:= {}
                            (-> (:column-ref created-at-dim)
                                (lib.options/with-options {:temporal-unit :month}))
                            last-month]])))))

(deftest ^:parallel temporal-unit-breakouts-test
  (let [column (-> (meta/field-metadata :orders :created-at)
                   (lib/with-temporal-bucket :day-of-month))]
    (doseq [[types column] {:default column
                            :forced  (-> column
                                         (dissoc :semantic-type)
                                         (assoc :base-type :type/Integer
                                                :effective-type :type/Integer))}
            :let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                            (lib/aggregate (lib/count))
                            (lib/breakout  column))]]
      (testing (str "breakout with temporal-unit with " (name types) " types")
        (let [agg-index 0
              agg-value 96]
          (underlying-state query agg-index agg-value
                            [1]
                            (fn [_agg-dim [created-at-dim]]
                              [[:= {}
                                (-> (:column-ref created-at-dim)
                                    (lib.options/with-options {:temporal-unit :day-of-month}))
                                1]])))))))

(deftest ^:parallel binned-column-test
  (testing "Underlying records for a binned column should generate a filters for current bin's min/max values (#35431)"
    (let [query                    (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                                       (lib/aggregate (lib/count))
                                       (lib/breakout (-> (meta/field-metadata :orders :quantity)
                                                         (lib/with-binning {:strategy :num-bins, :num-bins 10}))))
          col-count                (m/find-first #(= (:name %) "count")
                                                 (lib/returned-columns query))
          _                        (is (some? col-count))
          col-orders-quantity      (m/find-first #(= (:name %) "QUANTITY")
                                                 (lib/returned-columns query))
          _                        (is (some? col-orders-quantity))
          context                  {:column     col-count
                                    :column-ref (lib/ref col-count)
                                    :value      1
                                    :dimensions [{:column     col-orders-quantity
                                                  :column-ref (lib/ref col-orders-quantity)
                                                  :value      20}]}
          available-drills         (lib/available-drill-thrus query context)
          underlying-records-drill (m/find-first #(= (:type %) :drill-thru/underlying-records)
                                                 available-drills)
          _                        (is (some? underlying-records-drill))
          query'                   (lib/drill-thru query underlying-records-drill)]
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
