(ns metabase.pulse.render-test
  (:require [clojure.test :refer :all]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.card :refer [Card]]
            [metabase.pulse :as pulse]
            [metabase.pulse.render :as render]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]))

;; Let's make sure rendering Pulses actually works

(defn- render-pulse-card
  ([{query :dataset_query, :as card}]
   (render-pulse-card card (qp/process-query query)))

  ([card results]
   (render/render-pulse-card-for-display (pulse/defaulted-timezone card) card results)))

(defn- render-results [query]
  (mt/with-temp Card [card {:dataset_query query}]
    (render-pulse-card card)))

(deftest render-test
  (testing "if the pulse rendered correctly it will have this one row that says \"November 2015\" (not sure why)"
    (is (some? (mbql.u/match-one (render-results
                                  (mt/mbql-query checkins
                                    {:aggregation [[:count]]
                                     :breakout    [!month.date]}))
                                 [:td _ "November 2015"])))))

(deftest detect-pulse-chart-type-test
  (is (= :scalar
         (render/detect-pulse-chart-type {:display :anything}
                                         {:cols [{:base_type :type/Number}]
                                          :rows [[6]]})))
  (is (= :smartscalar
         (render/detect-pulse-chart-type {:display :smartscalar}
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
                                         {:cols [{:base_type :type/Text}
                                                 {:base_type :type/Number}]
                                          :rows [["A" 2]]})))
  (is (= :sparkline
         (render/detect-pulse-chart-type {:display :line}
                                         {:cols [{:base_type :type/Temporal}
                                                 {:base_type :type/Number}]
                                          :rows [[#t "2020" 2]
                                                 [#t "2021" 3]]})))
  (is (= :categorical/donut
         (render/detect-pulse-chart-type {:display :pie}
                                         {:cols [{:base_type :type/Text}
                                                 {:base_type :type/Number}]
                                          :rows [["apple" 3]
                                                 ["banana" 4]]}))))
