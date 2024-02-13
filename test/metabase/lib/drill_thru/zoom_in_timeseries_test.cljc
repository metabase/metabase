(ns metabase.lib.drill-thru.zoom-in-timeseries-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.zoom-in-timeseries :as lib.drill-thru.zoom-in-timeseries]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel zoom-in-timeseries-e2e-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/aggregate (lib/count))
                  (lib/breakout (meta/field-metadata :products :category))
                  (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :year)))]
    (is (=? {:stages [{:aggregation [[:count {}]]
                       :breakout    [[:field {} (meta/id :products :category)]
                                     [:field {:temporal-unit :year} (meta/id :orders :created-at)]]}]}
            query))
    (let [columns    (lib/returned-columns query)
          created-at (m/find-first #(and (= (:id %) (meta/id :orders :created-at))
                                         (= (lib.temporal-bucket/raw-temporal-bucket %) :year))
                                   (lib/returned-columns query))
          _          (assert created-at)
          count-col  (m/find-first #(= (:name %) "count") columns)
          _          (assert count-col)
          drill      (lib.drill-thru.zoom-in-timeseries/zoom-in-timeseries-drill
                       query -1
                       {:column     count-col
                        :column-ref (lib/ref count-col)
                        :value 200
                        :dimensions [{:column     created-at
                                      :column-ref (lib/ref created-at)
                                      :value      2022}]})]
      (is (=? {:type         :drill-thru/zoom-in.timeseries
               :dimension    {:column     {:id                               (meta/id :orders :created-at)
                                           :metabase.lib.field/temporal-unit :year}
                              :column-ref [:field {} (meta/id :orders :created-at)]
                              :value      2022}
               :next-unit    :quarter
               :display-name "See this year by quarter"}
              drill))
      (is (=? {:display-name "See this year by quarter"}
              (lib/display-info query -1 drill)))
      (let [query' (lib/drill-thru query drill)]
        (is (=? {:stages [{:aggregation [[:count {}]]
                           :breakout    [[:field {} (meta/id :products :category)]
                                         [:field {:temporal-unit :quarter} (meta/id :orders :created-at)]]
                           :filters     [[:=
                                          {}
                                          [:field {:temporal-unit :year} (meta/id :orders :created-at)]
                                          2022]]}]}
                query'))
        (let [columns    (lib/returned-columns query')
              created-at (m/find-first #(and (= (:id %) (meta/id :orders :created-at))
                                             (= (lib.temporal-bucket/raw-temporal-bucket %) :quarter))
                                       columns)
              _          (assert created-at)
              drill      (lib.drill-thru.zoom-in-timeseries/zoom-in-timeseries-drill
                           query' -1
                           {:column     count-col
                            :column-ref (lib/ref count-col)
                            :value      19
                            :dimensions [{:column     created-at
                                          :column-ref (lib/ref created-at)
                                          :value      "2022-04-01T00:00:00"}]})]
          (is (=? {:type         :drill-thru/zoom-in.timeseries
                   :dimension    {:column     {:id                               (meta/id :orders :created-at)
                                               :metabase.lib.field/temporal-unit :quarter}
                                  :column-ref [:field {} (meta/id :orders :created-at)]
                                  :value      "2022-04-01T00:00:00"}
                   :next-unit    :month
                   :display-name "See this quarter by month"}
                  drill))
          (is (=? {:display-name "See this quarter by month"}
                  (lib/display-info query' -1 drill)))
          (let [query'' (lib/drill-thru query' drill)]
            (is (=? {:stages [{:aggregation [[:count {}]]
                               :breakout    [[:field {} (meta/id :products :category)]
                                             [:field {:temporal-unit :month} (meta/id :orders :created-at)]]
                               ;; if we were SMART we could remove the first filter clause since it's not adding any
                               ;; value, but it won't hurt anything other than performance to keep it there. QP can
                               ;; generate optimal filters anyway
                               :filters     [[:=
                                              {}
                                              [:field {:temporal-unit :year} (meta/id :orders :created-at)]
                                              2022]
                                             [:=
                                              {}
                                              [:field {:temporal-unit :quarter} (meta/id :orders :created-at)]
                                              "2022-04-01T00:00:00"]]}]}
                    query''))))))))

(deftest ^:parallel returns-zoom-in-timeseries-test-1
  (testing "zoom-in.timeseries should be returned for aggregated query metric click (#33811)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/zoom-in.timeseries
      :click-type  :cell
      :query-type  :aggregated
      :column-name "count"
      :expected    {:type :drill-thru/zoom-in.timeseries}})))

(deftest ^:parallel returns-zoom-in-timeseries-test-2
  (testing "zoom-in.timeseries should be returned for aggregated query metric click (#33811)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/zoom-in.timeseries
      :click-type  :cell
      :query-type  :aggregated
      :column-name "max"
      :expected    {:type :drill-thru/zoom-in.timeseries}})))

(deftest ^:parallel returns-zoom-in-timeseries-test-3
  (testing "zoom-in.timeseries should be returned for aggregated query metric click (#33811)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/zoom-in.timeseries
      :click-type  :cell
      :query-type  :aggregated
      :column-name "sum"
      :expected    {:type :drill-thru/zoom-in.timeseries}})))

(deftest ^:parallel returns-zoom-in-timeseries-e2e-test-2
  (testing "zoom-in.timeseries should be returned for a"
    (let [query          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                             (lib/aggregate (lib/count))
                             (lib/breakout (-> (meta/field-metadata :orders :created-at)
                                               (lib/with-temporal-bucket :year))))
          created-at-col (m/find-first #(= (:name %) "CREATED_AT")
                                       (lib/returned-columns query))
          _              (is (some? created-at-col))]
      (doseq [[message context] {"pivot cell (no column, value = NULL) (#36173)"
                                 {:value      :null
                                  :column     nil
                                  :column-ref nil
                                  :dimensions [{:column     created-at-col
                                                :column-ref (lib/ref created-at-col)
                                                :value      "2022-12-01T00:00:00+02:00"}]}

                                 "for a legend item (no column, no value) (#36173)"
                                 {:value      nil
                                  :column     nil
                                  :column-ref nil
                                  :dimensions [{:column     created-at-col
                                                :column-ref (lib/ref created-at-col)
                                                :value      "2022-12-01T00:00:00+02:00"}]}}]
        (testing message
          (let [[drill :as drills] (filter #(= (:type %) :drill-thru/zoom-in.timeseries)
                                           (lib/available-drill-thrus query -1 context))]
            (is (= 1
                   (count drills)))
            (is (=? {:lib/type     :metabase.lib.drill-thru/drill-thru
                     :display-name "See this year by quarter"
                     :type         :drill-thru/zoom-in.timeseries
                     :dimension    {:column {:name "CREATED_AT"}
                                    :value  "2022-12-01T00:00:00+02:00"}
                     :next-unit    :quarter}
                    drill))
            (is (=? {:stages [{:aggregation [[:count {}]]
                               :breakout    [[:field {:temporal-unit :quarter} (meta/id :orders :created-at)]],
                               :filters     [[:=
                                              {}
                                              [:field {:temporal-unit :year} (meta/id :orders :created-at)]
                                              "2022-12-01T00:00:00+02:00"]]}]}
                    (lib/drill-thru query -1 drill)))))))))
