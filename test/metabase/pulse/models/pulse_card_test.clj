(ns metabase.pulse.models.pulse-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.models.pulse-card :as pulse-card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest test-next-position-for
  (testing "No existing cards"
    (mt/with-temp [:model/Pulse {pulse-id :id}]
      (is (zero? (pulse-card/next-position-for pulse-id)))))
  (testing "With cards"
    (mt/with-temp [:model/Pulse         {pulse-id :id}     {}
                   :model/Card          {card-id :id}      {}
                   :model/Dashboard     {dashboard-id :id} {}
                   :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id}
                   :model/PulseCard     _                  {:pulse_id          pulse-id
                                                            :card_id           card-id
                                                            :dashboard_card_id dashcard-id
                                                            :position          2}]
      (is (= 3 (pulse-card/next-position-for pulse-id))))))

(deftest position-test
  (mt/with-temp [:model/Pulse         {pulse-id :id}     {}
                 :model/Card          {card-id :id}      {}
                 :model/Dashboard     {dashboard-id :id} {}
                 :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id}
                 :model/PulseCard     {pulse-card-id :id} {:pulse_id          pulse-id
                                                           :card_id           card-id
                                                           :dashboard_card_id dashcard-id
                                                           :position          0}]
    (testing "a position cannot be negative"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must not be negative"
                            (t2/insert! :model/PulseCard {:pulse_id          pulse-id
                                                          :card_id           card-id
                                                          :dashboard_card_id dashcard-id
                                                          :position          -1})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must not be negative"
                            (t2/update! :model/PulseCard :id pulse-card-id {:position -1})))
      (is (= 0 (t2/select-one-fn :position :model/PulseCard :id pulse-card-id))))
    (testing "any other position goes"
      (is (= 1 (t2/update! :model/PulseCard :id pulse-card-id {:position 5})))
      (is (= 5 (t2/select-one-fn :position :model/PulseCard :id pulse-card-id))))))
