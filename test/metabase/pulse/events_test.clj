(ns metabase.pulse.events-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest dashboard-writes-sync-subscriptions-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Before"}
                 :model/Card      {card-id :id}      {}
                 :model/Pulse     {pulse-id :id}     {:dashboard_id dashboard-id}]
    (testing "renaming the dashboard renames its subscriptions"
      (dashboard/update-dashboard! dashboard-id {:name "After"})
      (is (= "After" (t2/select-one-fn :name :model/Pulse :id pulse-id))))
    (testing "adding a dashcard adds its card to the subscriptions"
      (dashboard-card/create-dashboard-cards! [{:dashboard_id dashboard-id :card_id card-id :row 0 :col 0 :size_x 4 :size_y 4}])
      (is (= [card-id] (t2/select-fn-vec :card_id :model/PulseCard :pulse_id pulse-id))))))
