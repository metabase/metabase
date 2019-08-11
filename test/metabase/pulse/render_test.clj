(ns metabase.pulse.render-test
  (:require [expectations :refer [expect]]
            [metabase
             [pulse :as pulse]
             [query-processor :as qp]]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.card :refer [Card]]
            [metabase.pulse.render :as render]
            [metabase.test.data :as data]
            [toucan.util.test :as tt]))

;; Let's make sure rendering Pulses actually works

(defn- render-pulse-card
  ([{query :dataset_query, :as card}]
   (render-pulse-card card (qp/process-query query)))

  ([card results]
   (render/render-pulse-card-for-display (pulse/defaulted-timezone card) card results)))

(defn- render-results [query]
  (tt/with-temp Card [card {:dataset_query query}]
    (render-pulse-card card)))

;; if the pulse rendered correctly it will have this one row that says "November 2015" (not sure why)
(expect
  (mbql.u/match-one (render-results
                     (data/mbql-query checkins
                       {:aggregation  [[:count]]
                        :breakout     [!month.date]}))
    [:td _ "November 2015"]))
