(ns metabase.lib.drill-thru.zoom-in-bins-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel zoom-in-bins-available-test
  (testing "zoom-in for bins is available for cells, pivots and legends on numeric columns which have binning set"
    (canned/canned-test
      :drill-thru/zoom-in.binning
      (fn [test-case context {:keys [click]}]
        (and (#{:cell :pivot :legend} click)
             (not (:native? test-case))
             (seq (for [dim (:dimensions context)
                        :when (and (isa? (:effective-type (:column dim)) :type/Number)
                                   (lib/binning (:column dim)))]
                    dim)))))))

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

;; TODO: Add a test for clicking on pivot column cells (and headers?) - but that's broken on master. See #38265.
(deftest ^:parallel cell-click-filters-and-updates-only-one-dimension-test
  (testing "when zooming in on one dimension, existing breakouts are dropped and replaced, along with new filters"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/count))
                    (lib/breakout (-> (meta/field-metadata :orders :quantity)
                                      (lib/with-binning {:strategy :num-bins, :num-bins 10})))
                    (lib/breakout (-> (meta/field-metadata :orders :created-at)
                                      (lib/with-temporal-bucket :month))))]
      (lib.drill-thru.tu/test-drill-application
        {:click-type     :cell
         :query-type     :aggregated
         :custom-query   query
         :custom-row     {"count"      100
                          "QUANTITY"   10
                          "CREATED_AT" "2024-09-08T22:03:20.239+03:00"}
         ;; TODO: Clicking on breakout columns in table views doesn't work properly.
         :column-name    "count"
         :drill-type     :drill-thru/zoom-in.binning
         :expected       {:type        :drill-thru/zoom-in.binning
                          :column      {:name "QUANTITY"}
                          :min-value   10
                          :max-value   20.0
                          :new-binning {:strategy :default}}
         :expected-query {:stages [{:source-table (meta/id :orders)
                                    :aggregation  [[:count {}]]
                                    :breakout     [[:field
                                                    {:binning {:strategy :default}}
                                                    (meta/id :orders :quantity)]
                                                   [:field
                                                    {:temporal-unit :month}
                                                    (meta/id :orders :created-at)]]
                                    :filters      [[:>= {}
                                                    [:field {} (meta/id :orders :quantity)]
                                                    10]
                                                   [:< {}
                                                    [:field {} (meta/id :orders :quantity)]
                                                    20.0]]}]}}))))

(deftest ^:parallel legend-zoom-binning-numeric-test
  ;; Sum of Subtotal by month and Product->Rating with binning, then click a rating to zoom in.
  (let [query   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                    (lib/breakout  (-> (meta/field-metadata :products :rating)
                                       (lib/with-binning {:strategy :default})))
                    (lib/breakout  (-> (meta/field-metadata :orders :created-at)
                                       (lib/with-temporal-bucket :month))))
        rating  (m/find-first #(= (:name %) "RATING") (lib/returned-columns query))
        context {:column     nil
                 :column-ref nil
                 :value      nil
                 :dimensions [{:column     rating
                               :column-ref (lib/ref rating)
                               :value      4.5}]}
        drills  (lib/available-drill-thrus query -1 context)
        zoom-in (m/find-first #(= (:type %) :drill-thru/zoom-in.binning) drills)
        drilled (lib/drill-thru query -1 zoom-in)]
    (testing "zoom-in.binning is available"
      (is (some? zoom-in)))

    (testing "drilled query"
      (testing "still has both breakouts"
        (is (= 2 (count (lib/breakouts drilled)))))
      (testing "filters to the zoomed range"
        (is (=? [[:>= {} [:field {} (meta/id :products :rating)] 4.5]
                 [:<  {} [:field {} (meta/id :products :rating)] 5.125]]
                (lib/filters drilled)))))))

;; This actually checks pivot tables too.
(deftest ^:parallel legend-zoom-binning-latitude-test
  ;; Sum of Subtotal by month and People->Latitude with binning, then click a latitude range to zoom in.
  (let [query    (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                     (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                     (lib/breakout  (-> (meta/field-metadata :people :latitude)
                                        (lib/with-binning {:strategy :default})))
                     (lib/breakout  (-> (meta/field-metadata :orders :created-at)
                                        (lib/with-temporal-bucket :month))))
        latitude (m/find-first #(= (:name %) "LATITUDE") (lib/returned-columns query))
        context  {:column     nil
                  :column-ref nil
                  :value      nil
                  :dimensions [{:column     latitude
                                :column-ref (lib/ref latitude)
                                :value      30}]}
        drills   (lib/available-drill-thrus query -1 context)
        zoom-in  (m/find-first #(= (:type %) :drill-thru/zoom-in.binning) drills)
        drilled  (lib/drill-thru query -1 zoom-in)]
    (testing "zoom-in.binning is available"
      (is (some? zoom-in)))

    (testing "drilled query"
      (testing "still has both breakouts"
        (is (= 2 (count (lib/breakouts drilled)))))
      (testing "filters to the zoomed range"
        (is (=? [[:>= {} [:field {} (meta/id :people :latitude)] 30]
                 [:<  {} [:field {} (meta/id :people :latitude)] 40.0]]
                (lib/filters drilled)))))))

(deftest ^:parallel nil-aggregation-value-test
  (testing "nil dimension value for binned column should not return this drill"
    (let [query        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/aggregate (lib/count))
                           (lib/breakout (-> (meta/field-metadata :orders :discount)
                                             (lib/with-binning {:strategy :default})))
                           #_(lib/breakout (-> (meta/field-metadata :orders :created-at)
                                               (lib/with-temporal-bucket :month))))
          count-col    (m/find-first #(= (:name %) "count")
                                     (lib/returned-columns query))
          _            (is (some? count-col))
          discount-col (m/find-first #(= (:name %) "DISCOUNT")
                                     (lib/returned-columns query))
          _            (is (some? discount-col))
          discount-dim {:column     discount-col
                        :column-ref (lib/ref discount-col)
                        :value      nil}
          context      {:column     count-col
                        :column-ref (lib/ref count-col)
                        :value      16845
                        :row        [discount-dim
                                     {:column     count-col
                                      :column-ref (lib/ref count-col)
                                      :value      16845}]
                        :dimensions [discount-dim]}
          drills       (set (map :type (lib/available-drill-thrus query context)))]
      (is (not (drills :drill-thru/zoom-in.binning))))))

(deftest ^:parallel nested-zoom-test
  (testing "repeatedly zooming in on smaller bins should work"
    (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) $q
                  ;; Filtering like we'd already zoomed in once, on the 40-60 bin.
                  (lib/filter $q (lib/>= (meta/field-metadata :orders :subtotal) 40))
                  (lib/filter $q (lib/<  (meta/field-metadata :orders :subtotal) 60))
                  (lib/aggregate $q (lib/count))
                  (lib/breakout $q (lib/with-binning (meta/field-metadata :orders :subtotal)
                                     {:strategy  :num-bins
                                      :num-bins  8
                                      :bin-width 2.5
                                      :min-value 40
                                      :max-value 60})))]
      (lib.drill-thru.tu/test-drill-application
        {:click-type     :cell
         :query-type     :aggregated
         :custom-query   query
         :custom-row     {"count" 100
                          "SUBTOTAL" 50} ;; Clicking the 50-52.5 bin
         :column-name    "count"
         :drill-type     :drill-thru/zoom-in.binning
         :expected       {:type        :drill-thru/zoom-in.binning
                          :column      {:name "SUBTOTAL"}
                          :min-value   50
                          :max-value   52.5
                          :new-binning {:strategy :default}}
         :expected-query {:stages [{:source-table (meta/id :orders)
                                    :aggregation  [[:count {}]]
                                    :breakout     [[:field
                                                    {:binning {:strategy :default}}
                                                    (meta/id :orders :subtotal)]]
                                    :filters      [[:>= {}
                                                    [:field {} (meta/id :orders :subtotal)]
                                                    50]
                                                   [:< {}
                                                    [:field {} (meta/id :orders :subtotal)]
                                                    52.5]]}]}}))))
