(ns metabase.models.pulse-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-card :as pulse-card :refer [PulseCard]]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(deftest test-next-position-for
  (testing "No existing cards"
    (t2.with-temp/with-temp [Pulse {pulse-id :id}]
      (is (zero? (pulse-card/next-position-for pulse-id)))))
  (testing "With cards"
    (t2.with-temp/with-temp [Pulse         {pulse-id :id}     {}
                             Card          {card-id :id}      {}
                             Dashboard     {dashboard-id :id} {}
                             DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id}
                             PulseCard     _                  {:pulse_id          pulse-id
                                                               :card_id           card-id
                                                               :dashboard_card_id dashcard-id
                                                               :position          2}]
      (is (= 3 (pulse-card/next-position-for pulse-id))))))
