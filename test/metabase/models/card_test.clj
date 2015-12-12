(ns metabase.models.card-test
  (:require [expectations :refer :all]
            (metabase.api [card-test :refer [post-card]]
                          [dashboard-test :refer [create-dash]])
            [metabase.db :refer [ins]]
            (metabase.models [card :refer :all]
                             [dashboard-card :refer [DashboardCard]])
            [metabase.test.util :refer [random-name]]))

;; Check that the :dashboard_count delay returns the correct count of Dashboards a Card is in
(expect [0 1 2]
  (let [{card-id :id}       (post-card (random-name))
        get-dashboard-count (fn [] @(:dashboard_count (Card card-id)))]

    [(get-dashboard-count)
     (do (ins DashboardCard :card_id card-id, :dashboard_id (:id (create-dash (random-name))))
         (get-dashboard-count))
     (do (ins DashboardCard :card_id card-id, :dashboard_id (:id (create-dash (random-name))))
         (get-dashboard-count))]))


;; card-dependencies

(expect
  {:Segment #{2 3}}
  (card-dependencies Card 12 {:dataset_query {:type :query
                                              :query {:filter ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["SEGMENT" 2] ["SEGMENT" 3]]}}}))

(expect
  {:Segment #{1}}
  (card-dependencies Card 12 {:dataset_query {:type :query
                                              :query {:filter ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["OR" ["SEGMENT" 1] ["!=" 5 "5"]]]}}}))

(expect
  {:Segment nil}
  (card-dependencies Card 12 {:dataset_query {:type :query
                                              :query {:filter nil}}}))
