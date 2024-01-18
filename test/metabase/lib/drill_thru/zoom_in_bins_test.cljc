(ns metabase.lib.drill-thru.zoom-in-bins-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel num-bins->default-test
  (testing ":num-bins binning => :default binning + between filter"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/count))
                    (lib/breakout (-> (meta/field-metadata :orders :total)
                                      (lib/with-binning {:strategy :num-bins, :num-bins 10}))))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count" 100
                         "TOTAL" 40}
        :column-name    "TOTAL"
        :drill-type     :drill-thru/zoom-in.binning
        :expected       {:type        :drill-thru/zoom-in.binning
                         :column      {:name "TOTAL"}
                         :min-value   40
                         :max-value   60.0
                         :new-binning {:strategy :default}}
        :expected-query {:stages [{:source-table (meta/id :orders)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :default}}
                                                   (meta/id :orders :total)]]
                                   :filters      [[:>= {}
                                                   [:field {} (meta/id :orders :total)]
                                                   40]
                                                  [:< {}
                                                   [:field {} (meta/id :orders :total)]
                                                   60.0]]}]}}))))

(deftest ^:parallel bin-width-test
  (testing ":bin-width binning => :bin-width binning (width ÷= 10) + between filter"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                    (lib/aggregate (lib/count))
                    (lib/breakout (-> (meta/field-metadata :people :latitude)
                                      (lib/with-binning {:strategy :bin-width, :bin-width 1.0}))))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count"    100
                         "LATITUDE" 41.0}
        :column-name    "LATITUDE"
        :drill-type     :drill-thru/zoom-in.binning
        :expected       {:type        :drill-thru/zoom-in.binning
                         :column      {:name "LATITUDE"}
                         :min-value   41.0
                         :max-value   42.0
                         :new-binning {:strategy :bin-width, :bin-width 0.1}}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :bin-width, :bin-width 0.1}}
                                                   (meta/id :people :latitude)]]
                                   :filters      [[:>= {}
                                                   [:field {} (meta/id :people :latitude)]
                                                   41.0]
                                                  [:< {}
                                                   [:field {} (meta/id :people :latitude)]
                                                   42.0]]}]}}))))

(deftest ^:parallel default-binning-test
  (testing ":default binning => :bin-width binning. Should consider :dimensions in drill context (#36117)"
    (let [query        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/aggregate (lib/count))
                           (lib/breakout (-> (meta/field-metadata :orders :quantity)
                                             (lib/with-binning {:strategy :default}))))
          col-count    (m/find-first #(= (:name %) "count")
                                     (lib/returned-columns query))
          _            (is (some? col-count))
          col-quantity (m/find-first #(= (:name %) "QUANTITY")
                                     (lib/returned-columns query))
          _            (is (some? col-quantity))
          context      {:column     col-count
                        :column-ref (lib/ref col-count)
                        :value      10
                        :row        [{:column     col-quantity
                                      :column-ref (lib/ref col-quantity)
                                      :value      20}
                                     {:column     col-count
                                      :column-ref (lib/ref col-count)
                                      :value      10}]
                        :dimensions [{:column     col-quantity
                                      :column-ref (lib/ref col-quantity)
                                      :value      20}]}
          drill        (m/find-first #(= (:type %) :drill-thru/zoom-in.binning)
                                     (lib/available-drill-thrus query -1 context))]
      (is (=? {:lib/type    :metabase.lib.drill-thru/drill-thru
               :type        :drill-thru/zoom-in.binning
               :column      {:name                       "QUANTITY"
                             :metabase.lib.field/binning {:strategy :default}}
               :min-value   20
               :max-value   32.5
               :new-binning {:strategy :default}}
              drill))
      (when drill
        (is (=? {:stages [{:aggregation [[:count {}]]
                           :breakout    [[:field {:binning {:strategy :default}} (meta/id :orders :quantity)]]
                           :filters     [[:>=
                                          {}
                                          [:field {:binning {:strategy :default}} (meta/id :orders :quantity)]
                                          20]
                                         [:<
                                          {}
                                          [:field {:binning {:strategy :default}} (meta/id :orders :quantity)]
                                          32.5]]}]}
                (lib/drill-thru query -1 drill)))))))
