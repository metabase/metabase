(ns metabase.xrays.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.xrays.db :as xrays.db]))

(set! *warn-on-reflection* true)

(deftest dashcard-card-and-dashboard-ids-test
  (testing "GHY-4481: narrowing by card ids and excluding dashboard ids still filters the DashboardCards"
    (mt/with-temp [:model/Card          {card-1 :id} {}
                   :model/Card          {card-2 :id} {}
                   :model/Dashboard     {dash-1 :id} {}
                   :model/Dashboard     {dash-2 :id} {}
                   :model/DashboardCard _ {:card_id card-1 :dashboard_id dash-1}
                   :model/DashboardCard _ {:card_id card-1 :dashboard_id dash-2}
                   :model/DashboardCard _ {:card_id card-2 :dashboard_id dash-2}]
      (let [pairs (fn [card-ids excluded-dashboard-ids]
                    (->> (xrays.db/dashcard-card-and-dashboard-ids card-ids excluded-dashboard-ids)
                         (map (juxt :card_id :dashboard_id))
                         (filter (comp #{card-1 card-2} first))
                         set))]
        (is (= #{[card-1 dash-1] [card-1 dash-2] [card-2 dash-2]}
               (pairs nil nil)
               (pairs [] [])))
        (is (= #{[card-1 dash-1] [card-1 dash-2]}
               (pairs [card-1] nil)))
        (is (= #{[card-1 dash-1]}
               (pairs [card-1 card-2] [dash-2])))
        (is (= #{}
               (pairs [card-2] [dash-2])))))))
