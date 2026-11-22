(ns metabase.pulse.models.pulse-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-card :as pulse-card]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest append-pulse-cards-position-test
  (testing "No existing cards"
    (mt/with-temp [:model/Pulse         {pulse-id :id}     {}
                   :model/Card          {card-id :id}      {}
                   :model/Dashboard     {dashboard-id :id} {}
                   :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id}]
      (mt/with-model-cleanup [:model/PulseCard]
        (is (= [0] (map :position (pulse-card/append-pulse-cards! [{:card_id card-id :pulse_id pulse-id :dashboard_card_id dashcard-id}])))))))
  (testing "With cards"
    (mt/with-temp [:model/Pulse         {pulse-id :id}     {}
                   :model/Card          {card-id :id}      {}
                   :model/Dashboard     {dashboard-id :id} {}
                   :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id :card_id card-id}
                   :model/DashboardCard {other-id :id}     {:dashboard_id dashboard-id :card_id card-id}
                   :model/PulseCard     _                  {:pulse_id          pulse-id
                                                            :card_id           card-id
                                                            :dashboard_card_id dashcard-id
                                                            :position          2}]
      (mt/with-model-cleanup [:model/PulseCard]
        (is (= [3] (map :position (pulse-card/append-pulse-cards! [{:card_id card-id :pulse_id pulse-id :dashboard_card_id other-id}]))))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Card      {card-id :id}  {}
                 :model/Dashboard {dashboard :id} {}]
    (mt/with-model-cleanup [:model/Pulse :model/PulseCard :model/DashboardCard]
      (let [pulses!  (fn [n] (mapv :id (models.pulse/create-pulses!
                                        (vec (repeat n {:name (mt/random-name) :creator_id (mt/user->id :rasta) :cards [] :channels []})))))
            rows     (fn [ids] (vec (map-indexed (fn [i id] {:pulse_id id :card_id card-id :position i}) ids)))]
        (testing "creating PulseCards"
          (let [counted (fn [n] (let [ids (pulses! n)] (events.tu/statement-count! #(pulse-card/create-pulse-cards! (rows ids)))))]
            (counted 2)
            (is (= (counted 2) (counted 6)))))
        (testing "deleting the PulseCards of Pulses"
          (let [counted (fn [n]
                          (let [ids (pulses! n)]
                            (pulse-card/create-pulse-cards! (rows ids))
                            (events.tu/statement-count! #(pulse-card/delete-pulse-cards-for-pulses! ids))))]
            (counted 2)
            (is (= (counted 2) (counted 6)))))
        (testing "deleting the PulseCards of DashboardCards"
          (let [counted (fn [n]
                          (let [dashcards (t2/insert-returning-pks! :model/DashboardCard
                                                                    (vec (repeat n {:dashboard_id dashboard :card_id card-id :size_x 1 :size_y 1 :row 0 :col 0})))
                                ids       (pulses! n)]
                            (pulse-card/create-pulse-cards! (vec (map (fn [id dashcard] {:pulse_id id :card_id card-id :position 0 :dashboard_card_id dashcard}) ids dashcards)))
                            (events.tu/statement-count! #(pulse-card/delete-pulse-cards-for-dashcards! dashcards))))]
            (counted 2)
            (is (= (counted 2) (counted 6)))))))))

(deftest ^:parallel position-schema-test
  (testing "PulseCard position is not negative"
    (is (not (mr/validate ::pulse.schema/pulse-card.update {:position -1})))
    (is (mr/validate ::pulse.schema/pulse-card.update {:position 5}))))

(deftest delete-pulse-cards-for-dashcards-audits-their-pulse-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                     :model/Card          {card-id :id}      {}
                     :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id :card_id card-id}
                     :model/DashboardCard {other-dc-id :id}  {:dashboard_id dashboard-id :card_id card-id}
                     :model/Pulse         {pulse-id :id}     {:dashboard_id dashboard-id}
                     :model/Pulse         {other-id :id}     {:dashboard_id dashboard-id}
                     :model/PulseCard     _                  {:pulse_id pulse-id :card_id card-id
                                                              :dashboard_card_id dashcard-id}
                     :model/PulseCard     _                  {:pulse_id other-id :card_id card-id
                                                              :dashboard_card_id other-dc-id}]
        (models.pulse/delete-pulse-cards-for-dashcards! [dashcard-id])
        (testing "the subscription that loses a card is audited once as updated"
          (is (= 1 (count (mt/all-entries-for :subscription-update :model/Pulse pulse-id)))))
        (testing "a subscription that keeps its cards is not audited"
          (is (empty? (mt/all-entries-for :subscription-update :model/Pulse other-id))))))))
