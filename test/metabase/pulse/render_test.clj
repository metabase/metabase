(ns metabase.pulse.render-test
  (:require [clojure.test :refer :all]
            [metabase
             [pulse :as pulse]
             [query-processor :as qp]
             [test :as mt]]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.card :refer [Card]]
            [metabase.pulse.render :as render]))

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
