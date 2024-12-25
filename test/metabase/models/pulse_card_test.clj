(ns metabase.models.pulse-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.pulse-card :as pulse-card]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(deftest test-next-position-for
  (testing "No existing cards"
    (t2.with-temp/with-temp [:model/Pulse {pulse-id :id}]
      (is (zero? (pulse-card/next-position-for pulse-id)))))
  (testing "With cards"
    (t2.with-temp/with-temp [:model/Pulse         {pulse-id :id}     {}
                             :model/Card          {card-id :id}      {}
                             :model/Dashboard     {dashboard-id :id} {}
                             :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id}
                             :model/PulseCard     _                  {:pulse_id          pulse-id
                                                                      :card_id           card-id
                                                                      :dashboard_card_id dashcard-id
                                                                      :position          2}]
      (is (= 3 (pulse-card/next-position-for pulse-id))))))
