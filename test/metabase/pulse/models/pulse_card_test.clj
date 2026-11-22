(ns metabase.pulse.models.pulse-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-card :as pulse-card]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

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
