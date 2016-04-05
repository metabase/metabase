(ns metabase.models.card-test
  (:require [expectations :refer :all]
            (metabase.api [card-test :refer [post-card]])
            [metabase.db :refer [ins]]
            (metabase.models [card :refer :all]
                             [dashboard-card :refer [DashboardCard]])
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [random-name]]))


(defn create-dash [dash-name]
  ((user->client :rasta) :post 200 "dashboard" {:name         dash-name
                                                :public_perms 0}))

;; Check that the :dashboard_count delay returns the correct count of Dashboards a Card is in
(expect [0 1 2]
  (let [{card-id :id}       (post-card (random-name))
        get-dashboard-count (fn [] (dashboard-count (Card card-id)))]

    [(get-dashboard-count)
     (do (ins DashboardCard :card_id card-id, :dashboard_id (:id (create-dash (random-name))))
         (get-dashboard-count))
     (do (ins DashboardCard :card_id card-id, :dashboard_id (:id (create-dash (random-name))))
         (get-dashboard-count))]))


;; card-dependencies

(expect
  {:Segment #{2 3}
   :Metric  nil}
  (card-dependencies Card 12 {:dataset_query {:type :query
                                              :query {:aggregation ["rows"]
                                                      :filter      ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["SEGMENT" 2] ["SEGMENT" 3]]}}}))

(expect
  {:Segment #{1}
   :Metric #{7}}
  (card-dependencies Card 12 {:dataset_query {:type :query
                                              :query {:aggregation ["METRIC" 7]
                                                      :filter      ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["OR" ["SEGMENT" 1] ["!=" 5 "5"]]]}}}))

(expect
  {:Segment nil
   :Metric  nil}
  (card-dependencies Card 12 {:dataset_query {:type :query
                                              :query {:aggregation nil
                                                      :filter      nil}}}))
