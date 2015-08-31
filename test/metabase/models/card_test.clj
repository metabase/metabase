(ns metabase.models.card-test
  (:require [expectations :refer :all]
            (metabase.api [card-test :refer [post-card]]
                          [dash-test :refer [create-dash]])
            [metabase.db :refer [ins]]
            (metabase.models [card :refer [Card]]
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
