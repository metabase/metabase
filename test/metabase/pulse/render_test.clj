(ns metabase.pulse.render-test
  (:require [clojure.test :refer :all]
            [metabase.mbql.util :as mbql.u]
            [metabase.models :refer [Card Dashboard DashboardCard DashboardCardSeries]]
            [metabase.pulse :as pulse]
            [metabase.pulse.render :as render]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.util :as u]))

;; Let's make sure rendering Pulses actually works

(defn- render-pulse-card
  ([{query :dataset_query, :as card}]
   (render-pulse-card card (qp/process-query query)))

  ([card results]
   (render/render-pulse-card-for-display (pulse/defaulted-timezone card) card results)))

(defn- render-results [query]
  (mt/with-temp Card [card {:dataset_query query
                            :display       :line}]
    (render-pulse-card card)))

(deftest render-test
  (testing "if the pulse rendered correctly it will have an img tag."
    (is (some? (mbql.u/match-one (render-results
                                  (mt/mbql-query checkins
                                    {:aggregation [[:count]]
                                     :breakout    [!month.date]}))
                                 [:img _])))))

(deftest render-error-test
  (testing "gives us a proper error if we have erroring card"
    (is (= (get-in (render/render-pulse-card-for-display
                     nil nil
                     {:error "some error"}) [1 2 4 2 2])
           "There was a problem with this question."))))

(deftest detect-pulse-chart-type-test
  (is (= :scalar
         (render/detect-pulse-chart-type {:display :anything}
                                         {}
                                         {:cols [{:base_type :type/Number}]
                                          :rows [[6]]})))
  (is (= :smartscalar
         (render/detect-pulse-chart-type {:display :smartscalar}
                                         {}
                                         {:cols     [{:base_type :type/Temporal
                                                      :name      "month"}
                                                     {:base_type :type/Number
                                                      :name      "apples"}]
                                          :rows     [[#t "2020" 2]
                                                     [#t "2021" 3]]
                                          :insights [{:name           "apples"
                                                      :last-value     3
                                                      :previous-value 2
                                                      :last-change    50.0}]})))
  (is (= :bar
         (render/detect-pulse-chart-type {:display :bar}
                                         {}
                                         {:cols [{:base_type :type/Text}
                                                 {:base_type :type/Number}]
                                          :rows [["A" 2]]})))
  (is (= :combo
         (render/detect-pulse-chart-type {:display :combo}
                                         {}
                                         {:cols [{:base_type :type/Temporal}
                                                 {:base_type :type/Number}]
                                          :rows [[#t "2020" 2]
                                                 [#t "2021" 3]]})))

  (is (= :multiple
         (mt/with-temp* [Card                [card1 {:display :something}]
                         Card                [card2 {:display :whatever}]
                         Dashboard           [dashboard]
                         DashboardCard       [dc1 {:dashboard_id (u/the-id dashboard) :card_id (u/the-id card1)}]
                         DashboardCardSeries [_   {:dashboardcard_id (u/the-id dc1) :card_id (u/the-id card2)}]]
           (render/detect-pulse-chart-type card1
                                           dc1
                                           {:cols [{:base_type :type/Temporal}
                                                   {:base_type :type/Number}]
                                            :rows [[#t "2020" 2]
                                                   [#t "2021" 3]]}))))

  (is (= :funnel
         (render/detect-pulse-chart-type {:display :funnel}
                                         {}
                                         {:cols [{:base_type :type/Text}
                                                 {:base_type :type/Number}]
                                          :rows [["A" 2]]})))

  ;; timeseries line chart
  (is (= :line
         (render/detect-pulse-chart-type {:display :line}
                                         {}
                                         {:cols [{:base_type :type/Temporal}
                                                 {:base_type :type/Number}]
                                          :rows [[#t "2020" 2]
                                                 [#t "2021" 3]]})))
  ;; Category line chart
  (is (= :line
         (render/detect-pulse-chart-type {:display :line}
                                         {}
                                         {:cols [{:base_type :type/Text}
                                                 {:base_type :type/Number}]
                                          :rows [["Red" 2]
                                                 ["Blue" 3]]})))
  (is (= :categorical/donut
         (render/detect-pulse-chart-type {:display :pie}
                                         {}
                                         {:cols [{:base_type :type/Text}
                                                 {:base_type :type/Number}]
                                          :rows [["apple" 3]
                                                 ["banana" 4]]}))))

(deftest make-description-if-needed-test
  (testing "Use Visualization Settings's description if it exists"
    (mt/with-temp* [Card          [card {:description "Card description"}]
                    Dashboard     [dashboard]
                    DashboardCard [dc1 {:dashboard_id (:id dashboard) :card_id (:id card)
                                        :visualization_settings {:card.description "Visualization description"}}]]
      (binding [render/*include-description* true]
        (is (= "Visualization description" (last (:content (#'render/make-description-if-needed dc1 card))))))))

  (testing "Fallback to Card's description if Visualization Settings's description not exists"
    (mt/with-temp* [Card          [card {:description "Card description"}]
                    Dashboard     [dashboard]
                    DashboardCard [dc1 {:dashboard_id (:id dashboard) :card_id (:id card)}]]
      (binding [render/*include-description* true]
        (is (= "Card description" (last (:content (#'render/make-description-if-needed dc1 card)))))))))
