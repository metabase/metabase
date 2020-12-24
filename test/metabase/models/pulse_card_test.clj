(ns metabase.models.pulse-card-test
  (:require [clojure.test :refer :all]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [pulse :refer [Pulse]]
             [pulse-card :refer :all]]
            [toucan.util.test :as tt]))

(deftest test-next-position-for
  (testing "No existing cards"
    (tt/with-temp Pulse [{pulse-id :id}]
      (is (zero? (next-position-for pulse-id)))))
  (testing "With cards"
    (tt/with-temp* [Pulse [{pulse-id :id}]
                    Card  [{card-id :id}]
                    Dashboard [{dashboard-id :id}]
                    DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id}]
                    PulseCard [_ {:pulse_id          pulse-id
                                  :card_id           card-id
                                  :dashboard_card_id dashcard-id
                                  :position 2}]]
      (is (= 3 (next-position-for pulse-id))))))
