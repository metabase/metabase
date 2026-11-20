(ns metabase.pulse.models.pulse-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.models.pulse-card :as pulse-card]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
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

(deftest ^:parallel position-schema-test
  (testing "PulseCard position is not negative"
    (is (not (mr/validate ::pulse.schema/pulse-card.update {:position -1})))
    (is (mr/validate ::pulse.schema/pulse-card.update {:position 5}))))

(deftest plain-insert-derives-position-test
  (mt/with-temp [:model/Pulse         {pulse-id :id}     {}
                 :model/Card          {card-id :id}      {}
                 :model/Dashboard     {dashboard-id :id} {}
                 :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id}]
    (let [insert! (fn [extra]
                    (t2/insert-returning-instance! :model/PulseCard
                                                   (merge {:pulse_id          pulse-id
                                                           :card_id           card-id
                                                           :dashboard_card_id dashcard-id}
                                                          extra)))]
      (testing "First card of pulse gets position 0"
        (is (= 0 (:position (insert! {})))))
      (testing "Next card follows the highest stored position"
        (is (= 1 (:position (insert! {})))))
      (testing "Given position is kept"
        (is (= 7 (:position (insert! {:position 7})))))
      (testing "Position after a gap follows the maximum"
        (is (= 8 (:position (insert! {:position nil}))))))))

(deftest format-rows-default-test
  (mt/with-temp [:model/Pulse         {pulse-id :id}     {}
                 :model/Card          {card-id :id}      {}
                 :model/Dashboard     {dashboard-id :id} {}
                 :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id}]
    (let [row     {:pulse_id          pulse-id
                   :card_id           card-id
                   :dashboard_card_id dashcard-id}
          stored  (fn [extra]
                    (t2/insert-returning-instance! :model/PulseCard (merge row extra)))]
      (testing "Absent or nil format_rows takes the column default"
        (is (true? (:format_rows (stored {}))))
        (is (true? (:format_rows (stored {:format_rows nil})))))
      (testing "Given format_rows is kept"
        (is (false? (:format_rows (stored {:format_rows false})))))
      (testing "bulk-create! leaves an omitted format_rows to the default and keeps the other booleans false"
        (pulse-card/bulk-create! [row])
        (is (= [true false false false]
               (-> (t2/select-one :model/PulseCard :pulse_id pulse-id {:order-by [[:id :desc]]})
                   ((juxt :format_rows :include_csv :include_xls :pivot_results)))))))))
